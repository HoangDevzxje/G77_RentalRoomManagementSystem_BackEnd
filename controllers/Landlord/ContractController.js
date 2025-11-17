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

      if (existed) {
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

    if (doc.status !== "draft") {
      return res
        .status(400)
        .json({ message: "Chỉ sửa hợp đồng khi đang ở trạng thái nháp" });
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

    //Chỉ gửi được sau khi landlord đã ký
    if (contract.status !== "signed_by_landlord") {
      return res.status(400).json({
        message: `Chỉ được gửi hợp đồng khi chủ trọ đã ký. Trạng thái hiện tại: ${contract.status}`,
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

    //Chỉ được ký khi còn là draft
    if (contract.status !== "draft") {
      return res.status(400).json({
        message: `Chỉ có thể ký hợp đồng khi đang ở trạng thái 'draft'. Hiện tại: ${contract.status}`,
      });
    }

    contract.landlordSignatureUrl = signatureUrl;
    contract.status = "signed_by_landlord"; // landlord ký xong, CHƯA gửi tenant
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

// GET /landlords/contracts
exports.listMine = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      status,
      search, // từ khóa search
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { landlordId };

    // Filter theo trạng thái
    if (status) {
      filter.status = status;
    }

    // Search đơn giản theo số hợp đồng (contract.no)
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
          "_id status createdAt updatedAt buildingId roomId tenantId contract.no contract.startDate contract.endDate"
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
// body: { note } (optional)
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

    // lưu vào lịch sử gia hạn
    contract.extensions.push({
      oldEndDate,
      newEndDate: newEnd,
      note: note || rr.note || "",
      extendedAt: now,
      extendedById: landlordId,
      extendedByRole: "landlord",
    });

    // cập nhật endDate hiện tại
    contract.contract.endDate = newEnd;

    // cập nhật trạng thái request
    contract.renewalRequest.status = "approved";
    contract.renewalRequest.processedAt = now;
    contract.renewalRequest.processedById = landlordId;
    contract.renewalRequest.processedByRole = "landlord";

    await contract.save();

    res.json({
      message: "Đã duyệt gia hạn hợp đồng",
      contract,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /landlords/contracts/:id/reject-extension
// body: { reason }
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

    res.json({
      message: "Đã từ chối yêu cầu gia hạn",
      renewalRequest: contract.renewalRequest,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
