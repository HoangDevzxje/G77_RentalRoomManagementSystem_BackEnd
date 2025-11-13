const Contract = require("../../models/Contract");
const Contact = require("../../models/Contact");
const ContractTemplate = require("../../models/ContractTemplate");
const Room = require("../../models/Room");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");
const Account = require("../../models/Account");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");

// POST /landlords/contracts/from-contact
// body: { contactId }
exports.createFromContact = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { contactId } = req.body || {};

    if (!contactId) {
      return res.status(400).json({ message: "Thiếu contactId" });
    }

    const contact = await Contact.findOne({
      _id: contactId,
      landlordId,
      isDeleted: { $ne: true },
    }).lean();

    if (!contact) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy yêu cầu liên hệ" });
    }

    // Nếu đã có hợp đồng từ contact này rồi thì trả luôn
    const existed = await Contract.findOne({ contactId: contact._id }).lean();
    if (existed) return res.json(existed);

    // Lấy template
    const template = await ContractTemplate.findOne({
      buildingId: contact.buildingId,
      ownerId: landlordId,
      status: "active",
    }).lean();

    const termIds = template?.defaultTermIds || [];
    const regulationIds = template?.defaultRegulationIds || [];

    // Lấy info landlord & tenant & room để prefill
    const [landlordAcc, tenantAcc, room] = await Promise.all([
      Account.findById(landlordId).lean(),
      Account.findById(contact.tenantId).lean(),
      Room.findById(contact.roomId).lean(),
    ]);

    const A = landlordAcc
      ? {
          name: landlordAcc.name || "",
          phone: landlordAcc.phone || "",
          email: landlordAcc.email || "",
        }
      : undefined;

    const B = tenantAcc
      ? {
          name: tenantAcc.name || "",
          phone: tenantAcc.phone || "",
          email: tenantAcc.email || "",
        }
      : undefined;

    const contractInfo = {
      price: room?.price || undefined,
    };

    const doc = await Contract.create({
      landlordId,
      tenantId: contact.tenantId,
      buildingId: contact.buildingId,
      roomId: contact.roomId,
      contactId: contact._id,
      templateId: template?._id,
      termIds,
      regulationIds,
      A,
      B,
      contract: contractInfo,
      status: "draft",
    });

    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// PUT /landlords/contracts/:id
// body: { A, contract, termIds, regulationIds }
exports.updateData = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;
    const {
      A,
      contract: contractInfo,
      termIds,
      regulationIds,
    } = req.body || {};

    const doc = await Contract.findOne({ _id: id, landlordId });
    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (doc.status !== "draft") {
      // tùy bạn, có thể cho sửa cả khi signed_by_tenant, v.v.
      // ở đây mình cho sửa khi chưa gửi cho người thuê
      // nếu muốn thoáng hơn thì bỏ điều kiện này
      // return res.status(400).json({ message: "Chỉ sửa hợp đồng khi đang ở trạng thái nháp" });
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

    if (Array.isArray(termIds)) {
      // kiểm tra active
      const count = await Term.countDocuments({
        _id: { $in: termIds },
        status: "active",
      });
      if (count !== termIds.length) {
        return res
          .status(400)
          .json({ message: "Một số điều khoản không hợp lệ" });
      }
      doc.termIds = termIds;
    }

    if (Array.isArray(regulationIds)) {
      const count = await Regulation.countDocuments({
        _id: { $in: regulationIds },
        status: "active",
      });
      if (count !== regulationIds.length) {
        return res
          .status(400)
          .json({ message: "Một số quy định không hợp lệ" });
      }
      doc.regulationIds = regulationIds;
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
        message: `Không thể gửi ở trạng thái hiện tại: ${contract.status}`,
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

    if (
      !["draft", "sent_to_tenant", "signed_by_tenant"].includes(contract.status)
    ) {
      return res.status(400).json({
        message: `Không thể ký ở trạng thái hiện tại: ${contract.status}`,
      });
    }

    contract.landlordSignatureUrl = signatureUrl;

    if (contract.tenantSignatureUrl) {
      contract.status = "completed";
      contract.completedAt = new Date();
    } else {
      contract.status = "signed_by_landlord";
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

    const roommateCount = (contract.roommateIds || []).length;
    const totalTenant = 1 + roommateCount;
    if (room.maxTenants && totalTenant > room.maxTenants) {
      return res.status(400).json({
        message: `Số người ở (${totalTenant}) vượt quá giới hạn cho phép (${room.maxTenants})`,
      });
    }

    room.status = "rented";
    room.currentTenantIds = [
      contract.tenantId,
      ...(contract.roommateIds || []),
    ];
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
      .populate("tenantId", "name email")
      .populate("roommateIds", "name email")
      .populate("termIds", "name description")
      .populate("regulationIds", "title description effectiveFrom")
      .lean();

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    const roomFurnitures = await RoomFurniture.find({
      roomId: contract.roomId,
    })
      .populate("furnitureId", "name category code")
      .lean();

    // gom vào response
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
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { landlordId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id status createdAt updatedAt buildingId roomId tenantId contract.no contract.startDate contract.endDate"
        )
        .populate("buildingId", "name")
        .populate("roomId", "roomNumber")
        .populate("tenantId", "name email")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Contract.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
