const Contract = require("../../models/Contract");
const Contact = require("../../models/Contact");
const ContractTemplate = require("../../models/ContractTemplate");
const Room = require("../../models/Room");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");
const Account = require("../../models/Account");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const he = require("he");
const PDFDocument = require("pdfkit");
const Building = require("../../models/Building");
const contentDisposition = require("content-disposition");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const FONT_REGULAR =
  process.env.CONTRACT_FONT_PATH || "public/fonts/NotoSans-Regular.ttf";
const FONT_BOLD =
  process.env.CONTRACT_FONT_BOLD_PATH || "public/fonts/NotoSans-Bold.ttf";
function normalizeAddress(raw) {
  if (!raw) return "";

  // Trường hợp là array (lịch sử địa chỉ)
  if (Array.isArray(raw)) {
    if (!raw.length) return "";
    const last = raw[raw.length - 1]; // lấy địa chỉ gần nhất

    return [last.address, last.wardName, last.districtName, last.provinceName]
      .filter(Boolean)
      .join(", ");
  }

  // Trường hợp là object đơn lẻ
  if (typeof raw === "object") {
    return [raw.address, raw.wardName, raw.districtName, raw.provinceName]
      .filter(Boolean)
      .join(", ");
  }

  // Trường hợp đã là string
  return String(raw);
}

// Helper: map Account + UserInformation -> personSchema
function mapAccountToPerson(acc) {
  if (!acc) return undefined;
  const ui = acc.userInfo || {};

  return {
    name: ui.fullName || "",
    dob: ui.dob || null,
    phone: ui.phoneNumber || "",
    permanentAddress: normalizeAddress(ui.address),
    email: acc.email || "",

    cccd: "",
    cccdIssuedDate: null,
    cccdIssuedPlace: "",
    bankAccount: "",
    bankName: "",
  };
}

// POST /landlords/contracts/from-contact
// body: { contactId }
exports.createFromContact = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { contactId } = req.body || {};

    if (!contactId) {
      return res.status(400).json({ message: "Thiếu contactId" });
    }

    // Không dùng .lean() ở đây để còn contact.save()
    const contact = await Contact.findOne({
      _id: contactId,
      landlordId,
      isDeleted: { $ne: true },
    }).populate("buildingId");

    if (!contact) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy yêu cầu liên hệ" });
    }
    if (
      req.user.role === "staff" &&
      !req.staff.assignedBuildingIds.includes(String(contact.buildingId._id))
    ) {
      return res
        .status(403)
        .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
    }
    if (
      req.user.role === "landlord" &&
      String(contact.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
    }
    //Nếu contact đã có contractId -> load contract đó và trả luôn (và chưa bị xóa)
    if (contact.contractId) {
      const existed = await Contract.findOne({
        _id: contact.contractId,
        isDeleted: false, // chỉ tính hợp đồng chưa bị soft delete
      }).lean();

      if (
        existed &&
        existed.status !== "voided" &&
        existed.status !== "terminated"
      ) {
        return res.json({
          alreadyCreated: true,
          contract: existed,
        });
      }

      // Nếu contractId trỏ đến HĐ đã bị xoá soft -> clear để tạo mới
      contact.contractId = null;
      await contact.save();
    }

    // Check phòng đã có hợp đồng đang xử lý chưa
    const conflict = await Contract.findOne({
      roomId: contact.roomId,
      isDeleted: false,
      status: {
        $in: [
          "draft",
          "sent_to_tenant",
          "signed_by_tenant",
          "signed_by_landlord",
        ],
      },
    })
      .select("_id status contract.no tenantId")
      .lean();

    if (conflict) {
      return res.status(400).json({
        message:
          "Phòng này hiện đã có một hợp đồng đang xử lý. Vui lòng hoàn tất hoặc hủy hợp đồng đó trước khi tạo hợp đồng mới.",
        conflictContractId: conflict._id,
        conflictStatus: conflict.status,
        conflictContractNo: conflict?.contract?.no || null,
      });
    }

    //Lấy template (nếu không có template cũng cho tạo, chỉ là không có terms/regulations default)
    const template = await ContractTemplate.findOne({
      buildingId: contact.buildingId,
      ownerId: landlordId,
      status: "active",
    }).lean();

    const termSnapshots = [];
    const regulationSnapshots = [];

    if (template?.defaultTermIds?.length) {
      const terms = await Term.find({
        _id: { $in: template.defaultTermIds },
        status: "active",
      })
        .sort({ createdAt: 1 })
        .lean();

      terms.forEach((t, idx) => {
        termSnapshots.push({
          name: t.name,
          description: t.description,
          order: idx + 1,
        });
      });
    }

    if (template?.defaultRegulationIds?.length) {
      const regs = await Regulation.find({
        _id: { $in: template.defaultRegulationIds },
        status: "active",
      })
        .sort({ createdAt: 1 })
        .lean();

      regs.forEach((r, idx) => {
        regulationSnapshots.push({
          title: r.title,
          description: r.description,
          effectiveFrom: r.effectiveFrom,
          order: idx + 1,
        });
      });
    }
    let representativeAcc = null;

    if (isStaff) {
      // Staff tạo → dùng thông tin của staff làm đại diện bên A
      representativeAcc = await Account.findById(req.user._id)
        .populate("userInfo")
        .lean();

      if (!representativeAcc?.userInfo?.fullName) {
        return res.status(400).json({
          message:
            "Nhân viên chưa cập nhật họ tên, không thể đại diện ký hợp đồng",
        });
      }
    } else {
      // Landlord tạo → dùng thông tin chính chủ
      representativeAcc = await Account.findById(landlordId)
        .populate("userInfo")
        .lean();

      if (!representativeAcc) {
        return res
          .status(400)
          .json({ message: "Không tìm thấy tài khoản chủ trọ" });
      }
    }
    // Lấy tenant và room
    const [tenantAcc, room] = await Promise.all([
      Account.findById(contact.tenantId).populate("userInfo").lean(),
      Room.findById(contact.roomId).lean(),
    ]);

    if (!tenantAcc) {
      return res
        .status(400)
        .json({ message: "Không tìm thấy tài khoản người thuê" });
    }

    // Map thông tin hợp đồng
    const A = mapAccountToPerson(representativeAcc);
    A.name = representativeAcc.userInfo.fullName.trim();
    const B = mapAccountToPerson(tenantAcc);

    const contractInfo = {
      price: room?.price || undefined,
    };

    //Tạo contract
    const doc = await Contract.create({
      landlordId,
      tenantId: contact.tenantId,
      buildingId: contact.buildingId,
      roomId: contact.roomId,
      contactId: contact._id,
      templateId: template?._id,
      terms: termSnapshots,
      regulations: regulationSnapshots,
      A,
      B,
      contract: contractInfo,
      status: "draft",
      createBy: req.user._id,
    });

    //Gán contractId lại cho contact
    contact.contractId = doc._id;
    await contact.save();

    res.json({
      alreadyCreated: false,
      contract: doc,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// DELETE /landlords/contracts/:id
exports.deleteContract = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    });

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // Chỉ cho xóa khi là draft
    if (contract.status !== "draft") {
      return res.status(400).json({
        message: "Chỉ được xóa hợp đồng ở trạng thái nháp (draft)",
      });
    }

    contract.isDeleted = true;
    contract.deletedAt = new Date();
    await contract.save();

    // Nếu hợp đồng này được tạo từ 1 Contact → clear contractId
    if (contract.contactId) {
      await Contact.updateOne(
        { _id: contract.contactId, contractId: contract._id },
        { $unset: { contractId: "" } }
      );
    }

    return res.json({
      message: "Đã xóa hợp đồng nháp",
      id: contract._id,
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

// PUT /landlords/contracts/:id
// body: { A, contract, termIds?, regulationIds?, terms?, regulations? }
exports.updateData = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { A, contract: contractInfo, terms, regulations } = req.body || {};

    const doc = await Contract.findOne({ _id: id, landlordId });
    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (doc.status !== "draft" || doc.landlordSignatureUrl) {
      return res.status(400).json({
        message:
          "Chỉ được chỉnh sửa hợp đồng khi đang ở trạng thái 'draft' và chưa ký",
      });
    }
    if (isStaff) {
      if (
        !doc.createBy ||
        doc.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được chỉnh sửa hợp đồng do chính bạn tạo",
          createdBy: doc.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    if (A) {
      doc.A = {
        ...(doc.A?.toObject?.() || doc.A || {}),
        ...A,
      };
    }

    if (contractInfo) {
      doc.contract = {
        ...doc.contract,
        ...contractInfo,
      };
    }

    if (Array.isArray(terms)) {
      doc.terms = terms;
    }

    if (Array.isArray(regulations)) {
      doc.regulations = regulations;
    }

    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/send-to-tenant
exports.sendToTenant = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (!["draft", "signed_by_landlord"].includes(contract.status)) {
      return res.status(400).json({
        message: `Chỉ được gửi hợp đồng khi đang ở trạng thái 'draft' hoặc 'signed_by_landlord'. Hiện tại: ${contract.status}`,
      });
    }
    if (isStaff) {
      if (
        !contract.createBy ||
        contract.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được gửi hợp đồng do chính mình tạo",
          createdBy: contract.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    contract.status = "sent_to_tenant";
    contract.sentToTenantAt = new Date();
    await contract.save();

    res.json({
      message: "Đã gửi hợp đồng cho người thuê",
      status: contract.status,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/sign-landlord
// body: { signatureUrl }
exports.signByLandlord = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { signatureUrl } = req.body || {};

    if (!signatureUrl) {
      return res.status(400).json({ message: "Thiếu signatureUrl" });
    }

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    //Chỉ được ký khi
    if (
      !["draft", "sent_to_tenant", "signed_by_tenant"].includes(contract.status)
    ) {
      return res.status(400).json({
        message: `Không thể ký ở trạng thái hiện tại: ${contract.status}`,
      });
    }
    if (isStaff) {
      if (
        !contract.createBy ||
        contract.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được ký hợp đồng do chính mình tạo",
          createdBy: contract.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    contract.landlordSignatureUrl = signatureUrl;
    if (contract.tenantSignatureUrl) {
      // Tenant đã ký trước đó → đây là chữ ký thứ 2 → completed
      contract.status = "completed";
      contract.completedAt = new Date();
    } else {
      // Landlord ký trước → set trạng thái phù hợp:
      if (contract.status === "draft") {
        // Ký xong nhưng chưa gửi → đánh dấu đã ký
        contract.status = "signed_by_landlord";
      } else {
        // Đang sent_to_tenant → landlord ký nhưng tenant chưa ký
        contract.status = "signed_by_landlord";
      }
    }

    await contract.save();

    res.json({
      message: "Ký hợp đồng (bên A) thành công",
      status: contract.status,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/confirm-move-in
exports.confirmMoveIn = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message: "Chỉ xác nhận vào ở khi hợp đồng đã hoàn tất",
      });
    }
    if (isStaff) {
      if (
        !contract.createBy ||
        contract.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được xác nhận vào ở cho hợp đồng do chính mình tạo",
          createdBy: contract.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    const room = await Room.findById(contract.roomId);
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    // Số người ở: 1 (Bên B) + số roommates
    const roommateCount = (contract.roommates || []).length;
    const totalTenant = 1 + roommateCount;

    if (room.maxTenants && totalTenant > room.maxTenants) {
      return res.status(400).json({
        message: `Số người ở (${totalTenant}) vượt quá giới hạn cho phép (${room.maxTenants})`,
      });
    }

    // Chỉ gán tenant chính (người có Account) vào Room
    room.status = "rented";
    room.currentTenantIds = [contract.tenantId];
    room.currentContractId = contract._id;
    await room.save();

    contract.moveInConfirmedAt = new Date();
    await contract.save();
    res.json({
      message: "Đã xác nhận người thuê vào ở",
      roomStatus: room.status,
      currentTenantIds: room.currentTenantIds,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /landlords/contracts/:id
exports.getDetail = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne({ _id: id, landlordId })
      .populate("buildingId", "name address")
      .populate("roomId", "roomNumber price maxTenants")
      .populate({
        path: "tenantId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber address dob",
        },
      })

      .lean();

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // Lấy danh sách nội thất trong phòng
    const roomFurnitures = await RoomFurniture.find({
      roomId: contract.roomId,
    })
      .populate("furnitureId", "name category code")
      .lean();

    contract.furnitures = roomFurnitures.map((rf) => ({
      id: rf._id,
      name: rf.furnitureId?.name,
      code: rf.furnitureId?.code,
      category: rf.furnitureId?.category,
      quantity: rf.quantity,
      condition: rf.condition,
      damageCount: rf.damageCount,
      notes: rf.notes,
    }));

    res.json(contract);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
// POST /landlords/contracts/:id/void
exports.voidContract = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { reason } = req.body || {};

    const contract = await Contract.findOne({ _id: id, landlordId });

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // Không cho void nếu đã move-in
    if (contract.moveInConfirmedAt) {
      return res.status(400).json({
        message:
          "Không thể vô hiệu hóa hợp đồng vì người thuê đã xác nhận vào ở. Vui lòng dùng chức năng chấm dứt hợp đồng (terminate).",
      });
    }

    // Không cho void nếu đã terminated / voided
    if (["terminated", "voided"].includes(contract.status)) {
      return res.status(400).json({
        message: `Hợp đồng đang ở trạng thái ${contract.status}, không thể vô hiệu hóa.`,
      });
    }
    if (isStaff) {
      if (
        !contract.createBy ||
        contract.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được xác nhận vào ở cho hợp đồng do chính mình tạo",
          createdBy: contract.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    contract.status = "voided";
    contract.voidedAt = new Date();
    if (reason) contract.voidReason = reason;

    // Nếu room đang trỏ về hợp đồng này thì clear
    const room = await Room.findById(contract.roomId);
    if (room && String(room.currentContractId) === String(contract._id)) {
      room.currentContractId = null;
      room.currentTenantIds = [];
      room.status = "available";
      await room.save();
    }

    await contract.save();

    res.json({
      message: "Đã vô hiệu hóa hợp đồng thành công",
      status: contract.status,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/clone
// Tạo hợp đồng mới (draft) từ hợp đồng cũ
exports.cloneContract = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const old = await Contract.findOne({ _id: id, landlordId }).lean();
    if (!old) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    const ALLOWED_CLONE_STATUSES = ["terminated", "voided"];

    if (!ALLOWED_CLONE_STATUSES.includes(old.status)) {
      return res.status(400).json({
        message: `Chỉ được clone hợp đồng ở trạng thái: ${ALLOWED_CLONE_STATUSES.join(
          ", "
        )}. Hiện tại: ${old.status}`,
      });
    }

    if (isStaff) {
      if (
        !old.createBy ||
        old.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được sao chép hợp đồng do chính mình tạo",
          createdBy: old.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }

    // ❗ Check xem đã có hợp đồng mới được clone từ hợp đồng này chưa
    const existingClone = await Contract.findOne({
      clonedFrom: old._id,
      status: { $in: ["draft", "pending", "active", "signed"] }, // tùy status của bạn
    }).lean();

    if (existingClone) {
      return res.status(400).json({
        message:
          "Hợp đồng này đã có bản sao được tạo trước đó. Vui lòng chỉnh sửa hợp đồng đã tạo thay vì tạo mới.",
        clonedContractId: existingClone._id,
      });
    }

    // Tạo contract mới: copy các thông tin cần thiết
    const newContract = await Contract.create({
      landlordId: old.landlordId,
      tenantId: old.tenantId,
      buildingId: old.buildingId,
      roomId: old.roomId,
      templateId: old.templateId,

      A: old.A,
      B: old.B,
      roommates: old.roommates || [],
      bikes: old.bikes || [],

      contract: {
        price: old.contract?.price,
        deposit: old.contract?.deposit,
        signPlace: old.contract?.signPlace,
        paymentCycleMonths: old.contract?.paymentCycleMonths || 1,
        // startDate / endDate / no / signDate => landlord tự chỉnh lại
      },

      terms: old.terms || [],
      regulations: old.regulations || [],

      status: "draft",
      clonedFrom: old._id,
    });

    res.json({
      message: "Đã tạo hợp đồng mới từ hợp đồng cũ",
      contractId: newContract._id,
      contract: newContract,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/terminate
// body: { reason?, terminatedAt? }
exports.terminateContract = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { reason, terminatedAt } = req.body || {};

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    // Chỉ cho terminate khi hợp đồng đã hoàn tất
    if (contract.status !== "completed") {
      return res.status(400).json({
        message: `Chỉ được chấm dứt hợp đồng khi đang ở trạng thái 'completed'. Hiện tại: ${contract.status}`,
      });
    }

    // Nếu chưa confirm move-in thì nên dùng void, không dùng terminate
    if (!contract.moveInConfirmedAt) {
      return res.status(400).json({
        message:
          "Hợp đồng này chưa xác nhận người thuê vào ở. Nếu nhập sai, hãy dùng chức năng 'vô hiệu hợp đồng' (void) thay vì terminate.",
      });
    }

    if (["voided", "terminated"].includes(contract.status)) {
      return res.status(400).json({
        message: `Hợp đồng đang ở trạng thái ${contract.status}, không thể chấm dứt thêm`,
      });
    }
    if (isStaff) {
      if (
        !old.createBy ||
        old.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được chấm dút hợp đồng do chính mình tạo",
          createdBy: old.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    // Lấy phòng
    const room = await Room.findById(contract.roomId);
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    // Cập nhật hợp đồng
    contract.status = "terminated";
    contract.terminatedReason =
      reason || "Chấm dứt hợp đồng trước hạn theo thoả thuận";
    contract.terminatedAt = terminatedAt ? new Date(terminatedAt) : new Date();

    await contract.save();

    // Nếu phòng đang gắn với hợp đồng này thì giải phóng phòng
    if (
      room.currentContractId &&
      String(room.currentContractId) === String(contract._id)
    ) {
      room.status = "available";
      room.currentTenantIds = [];
      room.currentContractId = null;
      await room.save();
    }

    res.json({
      message: "Đã chấm dứt hợp đồng thành công",
      status: contract.status,
      terminatedAt: contract.terminatedAt,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /landlords/contracts
exports.listMine = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const {
      status,
      search,
      moveIn, // 'confirmed' | 'not_confirmed'
      buildingId,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { landlordId };

    if (isStaff && req.staff?.assignedBuildingIds?.length > 0) {
      filter.buildingId = { $in: req.staff.assignedBuildingIds };
    }
    // Filter theo trạng thái
    if (status) {
      filter.status = status;
    }
    if (buildingId) {
      if (isStaff && !req.staff.assignedBuildingIds.includes(buildingId)) {
        return res.status(403).json({
          message: "Bạn không được phép xem hợp đồng của tòa nhà này",
        });
      }
      filter.buildingId = buildingId;
    }
    // Filter theo đã xác nhận vào ở hay chưa
    if (moveIn === "confirmed") {
      filter.moveInConfirmedAt = { $ne: null }; // đã confirm
    } else if (moveIn === "not_confirmed") {
      filter.moveInConfirmedAt = null; // chưa confirm
    }

    // Search theo số hợp đồng
    if (search) {
      const keyword = String(search).trim();
      if (keyword) {
        filter["contract.no"] = { $regex: keyword, $options: "i" };
      }
    }

    const pageNumber = Number(page) || 1;
    const pageSize = Number(limit) || 20;
    const skip = (pageNumber - 1) * pageSize;

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          [
            "_id",
            "status",
            "moveInConfirmedAt", // 👈 THÊM Ở ĐÂY
            "sentToTenantAt",
            "completedAt",
            "buildingId",
            "roomId",
            "tenantId",
            "createBy",
            "contract.no",
            "contract.startDate",
            "contract.endDate",
            "createdAt",
            "updatedAt",
          ].join(" ")
        )
        .populate("buildingId", "name")
        .populate("roomId", "roomNumber")
        .populate({
          path: "tenantId",
          select: "email userInfo",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Contract.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/approve-extension
exports.approveExtension = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { note } = req.body || {};

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message:
          "Chỉ gia hạn hợp đồng khi đang ở trạng thái đã hoàn tất (completed)",
      });
    }

    const rr = contract.renewalRequest;
    if (!rr || rr.status !== "pending") {
      return res.status(400).json({
        message: "Không có yêu cầu gia hạn nào đang chờ xử lý",
      });
    }

    if (!contract.contract?.endDate) {
      return res.status(400).json({
        message: "Hợp đồng chưa có ngày kết thúc để gia hạn",
      });
    }

    const oldEndDate = contract.contract.endDate;
    const newEnd = rr.requestedEndDate;

    if (!newEnd || newEnd <= oldEndDate) {
      return res.status(400).json({
        message:
          "Ngày kết thúc mới không hợp lệ (phải lớn hơn ngày kết thúc hiện tại)",
      });
    }
    if (isStaff) {
      if (
        !old.createBy ||
        old.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được chấm dút hợp đồng do chính mình tạo",
          createdBy: old.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    const now = new Date();

    // Lưu vào lịch sử gia hạn
    contract.extensions.push({
      oldEndDate,
      newEndDate: newEnd,
      note: note || rr.note || "",
      extendedAt: now,
      extendedById: landlordId,
      extendedByRole: "landlord",
    });

    // Cập nhật endDate hiện tại
    contract.contract.endDate = newEnd;

    // Cập nhật trạng thái request
    contract.renewalRequest.status = "approved";
    contract.renewalRequest.processedAt = now;
    contract.renewalRequest.processedById = landlordId;
    contract.renewalRequest.processedByRole = "landlord";

    await contract.save();

    return res.json({
      message: "Đã duyệt gia hạn hợp đồng",
      contract,
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/reject-extension
exports.rejectExtension = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    const { reason } = req.body || {};

    const contract = await Contract.findOne({ _id: id, landlordId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    const rr = contract.renewalRequest;
    if (!rr || rr.status !== "pending") {
      return res.status(400).json({
        message: "Không có yêu cầu gia hạn nào đang chờ xử lý",
      });
    }
    if (isStaff) {
      if (
        !old.createBy ||
        old.createBy.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({
          message: "Bạn chỉ được chấm dút hợp đồng do chính mình tạo",
          createdBy: old.createBy?.toString(),
          yourId: req.user._id.toString(),
        });
      }
    }
    const now = new Date();

    contract.renewalRequest.status = "rejected";
    contract.renewalRequest.rejectedReason = reason || "";
    contract.renewalRequest.processedAt = now;
    contract.renewalRequest.processedById = landlordId;
    contract.renewalRequest.processedByRole = "landlord";

    await contract.save();

    return res.json({
      message: "Đã từ chối yêu cầu gia hạn",
      renewalRequest: contract.renewalRequest,
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

// GET /landlords/contracts/renewal-requests?status=pending|approved|rejected&buildingId=...
exports.listRenewalRequests = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { status = "pending", buildingId, page = 1, limit = 20 } = req.query;

    const filter = {
      landlordId,
      "renewalRequest.status": status,
    };
    if (isStaff && req.staff?.assignedBuildingIds?.length > 0) {
      filter.buildingId = { $in: req.staff.assignedBuildingIds };
    }
    if (buildingId) {
      const bid = buildingId.toString();
      if (isStaff && !req.staff.assignedBuildingIds.includes(bid)) {
        return res.status(403).json({
          message: "Bạn không được phép xem yêu cầu gia hạn của tòa nhà này",
          buildingId: bid,
        });
      }
      filter.buildingId = bid;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id buildingId roomId tenantId contract.endDate renewalRequest"
        )
        .populate("buildingId", "name")
        .populate("roomId", "roomNumber")
        .populate({
          path: "tenantId",
          select: "email userInfo",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .sort({ "renewalRequest.requestedAt": -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Contract.countDocuments(filter),
    ]);

    return res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

// ==== Helpers giống bên template PDF ====

// Tên file an toàn
function sanitizeFileName(name) {
  return String(name || "contract.pdf")
    .replace(/[\r\n]/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/\s+/g, " ");
}

function formatDate(d) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function isHtml(s = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(s));
}

function inlineText(html = "") {
  const decoded = he.decode(String(html));
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n");
  return withBreaks.replace(/<\/?(strong|em|b|i|u|span|p)>/gi, "");
}

function extractListItems(html = "") {
  const decoded = he.decode(String(html));
  const listMatch = decoded.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
  if (!listMatch) return null;
  const isOrdered = /^<ol/i.test(listMatch[0]);
  const body = listMatch[2];

  const items = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(body))) {
    const text = inlineText(m[1]).trim();
    if (text) items.push(text);
  }
  return { isOrdered, items };
}
async function loadImageBuffer(signatureUrl) {
  if (!signatureUrl) return null;

  try {
    // Nếu là URL http/https (Cloudinary, S3, v.v.)
    if (/^https?:\/\//i.test(signatureUrl)) {
      const resp = await axios.get(signatureUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      return Buffer.from(resp.data);
    }

    const filePath = path.isAbsolute(signatureUrl)
      ? signatureUrl
      : path.join(process.cwd(), signatureUrl);

    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  } catch (e) {
    console.error("Không load được ảnh chữ ký:", e.message);
    return null;
  }
}

// GET /landlords/contracts/:id/download
exports.downloadContractPdf = async (req, res) => {
  let pdf;

  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    // Lấy hợp đồng thuộc landlord
    const contract = await Contract.findOne({
      _id: id,
      landlordId,
      isDeleted: { $ne: true },
    })
      .populate({ path: "buildingId", select: "_id name address" })
      .populate({ path: "roomId", select: "_id roomNumber floorId area price" })
      .lean();

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message: "Chỉ được tải PDF khi hợp đồng đã hoàn tất (completed)",
      });
    }

    const {
      A,
      B,
      roommates = [],
      bikes = [],
      contract: meta = {},
      terms = [],
      regulations = [],
    } = contract;
    const AName = A?.name || "";
    const BName = B?.name || "";
    const building = contract.buildingId;
    const room = contract.roomId;

    // Tên file
    const fileNameRaw = `HopDong_${meta.no || contract._id}.pdf`;
    const fileName = sanitizeFileName(fileNameRaw);
    const cd = contentDisposition(fileName, { type: "attachment" });

    res.setHeader("Content-Disposition", cd);
    res.setHeader("Content-Type", "application/pdf");

    // Khởi tạo PDF
    pdf = new PDFDocument({
      size: "A4",
      margins: { top: 50, left: 50, right: 50, bottom: 50 },
    });

    pdf.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || "PDF stream error" });
      } else {
        try {
          res.end();
        } catch {}
      }
    });

    pdf.pipe(res);

    // Font
    try {
      pdf.font(FONT_REGULAR);
    } catch {
      pdf.font("Times-Roman");
    }

    // ===== HEADER =====
    pdf
      .fontSize(12)
      .text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" })
      .moveDown(0.2)
      .text("ĐỘC LẬP – TỰ DO – HẠNH PHÚC", { align: "center" });

    pdf.moveDown(0.8);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf
      .fontSize(16)
      .text("HỢP ĐỒNG THUÊ PHÒNG", { align: "center", underline: true });

    try {
      pdf.font(FONT_REGULAR);
    } catch {}
    pdf.moveDown(0.5);
    pdf
      .fontSize(10)
      .fillColor("gray")
      .text(`Số: ${meta.no || "........"}`, { align: "center" })
      .fillColor("black");

    // Ngày ký & địa điểm
    pdf.moveDown(1);
    pdf
      .fontSize(12)
      .text(
        `Hôm nay, ngày ${formatDate(meta.signDate) || "....../....../......"},`
      );
    pdf.text(
      `Tại: ${
        meta.signPlace || (building && building.address) || "................"
      }`
    );

    pdf.moveDown(0.5);

    // ===== BÊN A =====
    pdf.moveDown(0.3);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.text("BÊN CHO THUÊ (BÊN A):");
    try {
      pdf.font(FONT_REGULAR);
    } catch {}

    pdf
      .fontSize(11)
      .text(`Họ tên: ${A?.name || ""}`)
      .text(
        `CCCD: ${A?.cccd || ""}   Cấp ngày: ${
          formatDate(A?.cccdIssuedDate) || ""
        }   Nơi cấp: ${A?.cccdIssuedPlace || ""}`
      )
      .text(`Hộ khẩu thường trú: ${A?.permanentAddress || ""}`)
      .text(`Điện thoại: ${A?.phone || ""}`)
      .text(`Email: ${A?.email || ""}`);

    // ===== BÊN B =====
    pdf.moveDown(0.6);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.text("BÊN THUÊ (BÊN B):");
    try {
      pdf.font(FONT_REGULAR);
    } catch {}

    pdf
      .fontSize(11)
      .text(`Họ tên: ${B?.name || ""}`)
      .text(
        `CCCD: ${B?.cccd || ""}   Cấp ngày: ${
          formatDate(B?.cccdIssuedDate) || ""
        }   Nơi cấp: ${B?.cccdIssuedPlace || ""}`
      )
      .text(`Hộ khẩu thường trú: ${B?.permanentAddress || ""}`)
      .text(`Điện thoại: ${B?.phone || ""}`)
      .text(`Email: ${B?.email || ""}`);

    // Roommates
    if (roommates.length) {
      pdf.moveDown(0.6);
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.text("Người ở cùng (roommates):");
      try {
        pdf.font(FONT_REGULAR);
      } catch {}

      roommates.forEach((r, idx) => {
        pdf
          .fontSize(11)
          .text(
            `${idx + 1}. ${r.name || ""} – CCCD: ${
              r.cccd || ""
            } – Điện thoại: ${r.phone || ""}`
          );
      });
    }

    // ===== THÔNG TIN PHÒNG & GIÁ =====
    pdf.moveDown(0.8);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.text("THÔNG TIN PHÒNG VÀ GIÁ THUÊ:");
    try {
      pdf.font(FONT_REGULAR);
    } catch {}

    const buildingName = building?.name || "";
    const roomNumber = room?.roomNumber || "";
    const area = room?.area;
    pdf
      .fontSize(11)
      .text(
        `Tòa nhà: ${buildingName} – Địa chỉ: ${
          building?.address || "................................"
        }`
      )
      .text(`Phòng: ${roomNumber}    Diện tích: ${area || ""} m²`)
      .text(`Giá thuê: ${meta.price?.toLocaleString("vi-VN") || ""} VND/tháng`)
      .text(
        `Tiền cọc: ${
          meta.deposit?.toLocaleString("vi-VN") || ""
        } VND (bằng chữ: ................................)`
      )
      .text(
        `Thời hạn thuê: từ ngày ${formatDate(
          meta.startDate
        )} đến ngày ${formatDate(meta.endDate)}`
      )
      .text(`Chu kỳ thanh toán: mỗi ${meta.paymentCycleMonths || 1} tháng/lần`);

    // Bikes
    if (bikes.length) {
      pdf.moveDown(0.5);
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.text("Phương tiện gửi kèm:");
      try {
        pdf.font(FONT_REGULAR);
      } catch {}

      bikes.forEach((b, idx) => {
        pdf
          .fontSize(11)
          .text(
            `${idx + 1}. Biển số: ${b.bikeNumber || ""} – Màu: ${
              b.color || ""
            } – Hãng: ${b.brand || ""}`
          );
      });
    }

    // ===== ĐIỀU KHOẢN (terms snapshot) =====
    if (terms.length) {
      pdf.moveDown(1); // cho rõ ràng, để terms sang trang mới
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.fontSize(13).text("I. ĐIỀU KHOẢN HỢP ĐỒNG", { underline: true });
      try {
        pdf.font(FONT_REGULAR);
      } catch {}
      pdf.moveDown(0.5);

      // sort theo order nếu có
      const sortedTerms = [...terms].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      sortedTerms.forEach((t, idx) => {
        try {
          pdf.font(FONT_BOLD);
        } catch {}
        pdf.fontSize(12).text(`${idx + 1}. ${t.name || "Điều khoản"}`);
        try {
          pdf.font(FONT_REGULAR);
        } catch {}

        const desc = t.description || "";
        if (!desc) {
          pdf.moveDown(0.3);
          return;
        }

        if (isHtml(desc)) {
          const list = extractListItems(desc);
          if (list && list.items.length) {
            pdf.moveDown(0.2);
            list.items.forEach((it, i) => {
              const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
              try {
                pdf.font(FONT_BOLD);
              } catch {}
              pdf.fontSize(11).text(prefix, { continued: true });
              try {
                pdf.font(FONT_REGULAR);
              } catch {}
              pdf.fontSize(11).text(it, {
                paragraphGap: 4,
                align: "justify",
              });
            });
          } else {
            pdf.moveDown(0.2);
            pdf
              .fontSize(11)
              .text(inlineText(desc), { paragraphGap: 6, align: "justify" });
          }
        } else {
          pdf.moveDown(0.2);
          pdf
            .fontSize(11)
            .text(String(desc), { paragraphGap: 6, align: "justify" });
        }

        pdf.moveDown(0.3);
      });
    }

    // ===== NỘI QUY (regulations snapshot) =====
    if (regulations.length) {
      pdf.moveDown(1);
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.fontSize(13).text("II. NỘI QUY / QUY ĐỊNH", { underline: true });
      try {
        pdf.font(FONT_REGULAR);
      } catch {}
      pdf.moveDown(0.5);

      const sortedRegs = [...regulations].sort(
        (a, b) => (a.order || 0) - (b.order || 0)
      );

      sortedRegs.forEach((r, idx) => {
        try {
          pdf.font(FONT_BOLD);
        } catch {}
        pdf.fontSize(12).text(`${idx + 1}. ${r.title || "Quy định"}`);
        try {
          pdf.font(FONT_REGULAR);
        } catch {}

        const desc = r.description || "";
        if (!desc) {
          pdf.moveDown(0.3);
          return;
        }

        if (isHtml(desc)) {
          const list = extractListItems(desc);
          if (list && list.items.length) {
            pdf.moveDown(0.2);
            list.items.forEach((it, i) => {
              const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
              try {
                pdf.font(FONT_BOLD);
              } catch {}
              pdf.fontSize(11).text(prefix, { continued: true });
              try {
                pdf.font(FONT_REGULAR);
              } catch {}
              pdf.fontSize(11).text(it, {
                paragraphGap: 4,
                align: "justify",
              });
            });
          } else {
            pdf.moveDown(0.2);
            pdf
              .fontSize(11)
              .text(inlineText(desc), { paragraphGap: 6, align: "justify" });
          }
        } else {
          pdf.moveDown(0.2);
          pdf
            .fontSize(11)
            .text(String(desc), { paragraphGap: 6, align: "justify" });
        }
        pdf.moveDown(0.3);
      });
    }

    // ======= CHỮ KÝ =======
    pdf.moveDown(2);

    const pageWidth = pdf.page.width;
    const margins = pdf.page.margins;

    const columnWidth = (pageWidth - margins.left - margins.right) / 2;

    const leftX = margins.left;
    const rightX = margins.left + columnWidth;

    // Tên & chữ ký từ contract
    const landlordSigUrl = contract.landlordSignatureUrl;
    const tenantSigUrl = contract.tenantSignatureUrl;

    const landlordSigBuf = await loadImageBuffer(landlordSigUrl);
    const tenantSigBuf = await loadImageBuffer(tenantSigUrl);

    // ===== Tiêu đề =====
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf
      .fontSize(12)
      .text("ĐẠI DIỆN BÊN A", leftX, pdf.y, {
        width: columnWidth,
        align: "center",
      })
      .text("ĐẠI DIỆN BÊN B", rightX, pdf.y - 16, {
        width: columnWidth,
        align: "center",
      });

    pdf.moveDown(1);

    // ===== Hướng dẫn ký =====
    try {
      pdf.font(FONT_REGULAR);
    } catch {}
    pdf
      .fontSize(11)
      .text("(Ký, ghi rõ họ tên)", leftX, pdf.y, {
        width: columnWidth,
        align: "center",
      })
      .text("(Ký, ghi rõ họ tên)", rightX, pdf.y - 14, {
        width: columnWidth,
        align: "center",
      });

    pdf.moveDown(1.5);

    // ===== Ảnh chữ ký =====
    const sigWidth = 120;
    const sigHeight = 70;

    const sigY = pdf.y;

    if (landlordSigBuf) {
      pdf.image(landlordSigBuf, leftX + columnWidth / 2 - sigWidth / 2, sigY, {
        fit: [sigWidth, sigHeight],
      });
    }

    if (tenantSigBuf) {
      pdf.image(tenantSigBuf, rightX + columnWidth / 2 - sigWidth / 2, sigY, {
        fit: [sigWidth, sigHeight],
      });
    }

    // ===== Tên người ký =====
    pdf.moveDown(5);

    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf
      .fontSize(12)
      .text(AName, leftX, pdf.y, {
        width: columnWidth,
        align: "center",
      })
      .text(BName, rightX, pdf.y - 16, {
        width: columnWidth,
        align: "center",
      });

    pdf.moveDown(4);
    pdf.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      return res.status(400).json({ message: e.message || "Bad request" });
    }
    try {
      res.end();
    } catch {}
  }
};
