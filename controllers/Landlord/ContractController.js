const Contract = require("../../models/Contract");
const Contact = require("../../models/Contact");
const ContractTemplate = require("../../models/ContractTemplate");
const Room = require("../../models/Room");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");
const Account = require("../../models/Account");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");

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
    const landlordId = req.user?._id;
    const { contactId } = req.body || {};

    if (!contactId) {
      return res.status(400).json({ message: "Thiếu contactId" });
    }

    // Không dùng .lean() ở đây để còn contact.save()
    const contact = await Contact.findOne({
      _id: contactId,
      landlordId,
      isDeleted: { $ne: true },
    });

    if (!contact) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy yêu cầu liên hệ" });
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

    //Lấy info landlord & tenant & room để prefill
    const [landlordAcc, tenantAcc, room] = await Promise.all([
      Account.findById(landlordId).populate("userInfo").lean(),
      Account.findById(contact.tenantId).populate("userInfo").lean(),
      Room.findById(contact.roomId).lean(),
    ]);

    if (!landlordAcc) {
      return res
        .status(400)
        .json({ message: "Không tìm thấy tài khoản chủ trọ" });
    }

    if (!tenantAcc) {
      return res
        .status(400)
        .json({ message: "Không tìm thấy tài khoản người thuê" });
    }

    const A = mapAccountToPerson(landlordAcc); // đảm bảo có name
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user._id;
    const { id } = req.params;
    const { reason } = req.body || {};

    const contract = await Contract.findOne({ _id: id, landlordId });

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (
      !["draft", "signed_by_landlord", "sent_to_tenant"].includes(
        contract.status
      )
    ) {
      return res.status(400).json({
        message:
          "Chỉ có thể hủy hợp đồng do nhập sai khi đang ở trạng thái draft / signed_by_landlord / sent_to_tenant và chưa có chữ ký người thuê",
      });
    }

    if (contract.tenantSignatureUrl) {
      return res.status(400).json({
        message: "Không thể hủy hợp đồng vì người thuê đã ký",
      });
    }

    contract.status = "voided";
    contract.voidedAt = new Date();
    if (reason) contract.voidReason = reason;

    // Nếu lỡ room đang trỏ về hợp đồng này thì clear (phòng trả về available)
    const room = await Room.findById(contract.roomId);
    if (room && String(room.currentContractId) === String(contract._id)) {
      room.currentContractId = null;
      room.currentTenantIds = [];
      room.status = "available";
      await room.save();
    }

    await contract.save();

    res.json({
      message: "Đã hủy hợp đồng (void) thành công",
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
    const landlordId = req.user?._id;
    const { id } = req.params;

    const old = await Contract.findOne({ _id: id, landlordId }).lean();
    if (!old) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    const ALLOWED_CLONE_STATUSES = ["completed", "voided"];

    if (!ALLOWED_CLONE_STATUSES.includes(old.status)) {
      return res.status(400).json({
        message: `Chỉ được clone hợp đồng ở trạng thái: ${ALLOWED_CLONE_STATUSES.join(
          ", "
        )}. Hiện tại: ${old.status}`,
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
    const {
      status,
      search, 
      moveIn, // 'confirmed' | 'not_confirmed'
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { landlordId };

    // Filter theo trạng thái
    if (status) {
      filter.status = status;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
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
    const landlordId = req.user?._id;
    const { status = "pending", buildingId, page = 1, limit = 20 } = req.query;

    const filter = {
      landlordId,
      "renewalRequest.status": status,
    };

    if (buildingId) {
      filter.buildingId = buildingId;
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
