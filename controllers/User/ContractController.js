const Contract = require("../../models/Contract");
const Account = require("../../models/Account");
const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const UserInformation = require("../../models/UserInformation");

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

    // Các field này chưa có trong UserInformation – để trống
    cccd: "",
    cccdIssuedDate: null,
    cccdIssuedPlace: "",
    bankAccount: "",
    bankName: "",
  };
}
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

// GET /tenants/contracts
exports.listMyContracts = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { tenantId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id status createdAt updatedAt buildingId roomId contract.no contract.startDate contract.endDate"
        )
        .populate("buildingId", "name")
        .populate("roomId", "roomNumber")
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

// GET /tenants/contracts/:id
exports.getMyContract = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const doc = await Contract.findOne({ _id: id, tenantId })
      .populate("buildingId", "name address")
      .populate("roomId", "roomNumber price maxTenants")
      .populate({
        path: "landlordId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber address dob",
        },
      })
      .populate({
        path: "roommateIds",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber address dob",
        },
      })
      .lean();

    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    // Lấy danh sách nội thất trong phòng
    const roomFurnitures = await RoomFurniture.find({
      roomId: doc.roomId,
    })
      .populate("furnitureId", "name category code")
      .lean();

    doc.furnitures = roomFurnitures.map((rf) => ({
      id: rf._id,
      name: rf.furnitureId?.name,
      code: rf.furnitureId?.code,
      category: rf.furnitureId?.category,
      quantity: rf.quantity,
      condition: rf.condition,
      damageCount: rf.damageCount,
      notes: rf.notes,
    }));

    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// PATCH /tenants/contracts/:id
// body: { B, bikes, roommateEmails }
exports.updateMyData = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { B, bikes, roommateEmails } = req.body || {};

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "sent_to_tenant") {
      return res.status(400).json({
        message:
          "Chỉ được chỉnh sửa thông tin khi hợp đồng đang được gửi cho bạn",
      });
    }

    // Cập nhật thông tin Bên B
    if (B) {
      const merged = {
        ...(contract.B?.toObject?.() || contract.B || {}),
        ...B,
      };

      if (merged.permanentAddress) {
        merged.permanentAddress = normalizeAddress(merged.permanentAddress);
      }

      contract.B = merged;
    }

    // Danh sách xe
    if (Array.isArray(bikes)) {
      contract.bikes = bikes
        .filter((b) => b && b.bikeNumber)
        .map((b) => ({
          _id: b._id,
          bikeNumber: String(b.bikeNumber || "").trim(),
          color: (b.color || "").trim(),
          brand: (b.brand || "").trim(),
        }));
    }

    // Roommates từ email
    if (Array.isArray(roommateEmails) && roommateEmails.length) {
      const emails = roommateEmails
        .map((e) => (e || "").trim().toLowerCase())
        .filter(Boolean);

      const accounts = await Account.find({ email: { $in: emails } })
        .select("_id email")
        .lean();

      const idSet = new Set((contract.roommateIds || []).map((x) => String(x)));

      for (const acc of accounts) {
        if (String(acc._id) !== String(tenantId)) {
          idSet.add(String(acc._id));
        }
      }

      // check maxTenants
      const room = await Room.findById(contract.roomId)
        .select("maxTenants")
        .lean();
      const totalTenant = 1 + idSet.size; // 1: tenant chính
      if (room?.maxTenants && totalTenant > room.maxTenants) {
        return res.status(400).json({
          message: `Số người ở (${totalTenant}) vượt quá giới hạn cho phép (${room.maxTenants})`,
        });
      }

      contract.roommateIds = Array.from(idSet);
    }

    // 🔥 Build lại occupants (danh sách người ở) từ B + roommateIds
    const occupants = [];
    if (contract.B && contract.B.name) {
      occupants.push(contract.B);
    }

    if (Array.isArray(contract.roommateIds) && contract.roommateIds.length) {
      const roommateAccounts = await Account.find({
        _id: { $in: contract.roommateIds },
      })
        .populate("userInfo")
        .lean();

      for (const acc of roommateAccounts) {
        const person = mapAccountToPerson(acc);
        if (person && person.name) occupants.push(person);
      }
    }

    contract.occupants = occupants;

    await contract.save();
    res.json(contract);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /tenants/contracts/:id/sign
// body: { signatureUrl }
exports.signByTenant = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { signatureUrl } = req.body || {};

    if (!signatureUrl) {
      return res.status(400).json({ message: "Thiếu signatureUrl" });
    }

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (!["sent_to_tenant", "signed_by_landlord"].includes(contract.status)) {
      return res.status(400).json({
        message: `Không thể ký ở trạng thái hiện tại: ${contract.status}`,
      });
    }

    contract.tenantSignatureUrl = signatureUrl;

    if (contract.landlordSignatureUrl) {
      contract.status = "completed";
      contract.completedAt = new Date();
    } else {
      contract.status = "signed_by_tenant";
    }

    await contract.save();
    res.json({
      message: "Ký hợp đồng thành công",
      status: contract.status,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /tenants/accounts/search-by-email?email=...
exports.searchAccountByEmail = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { email } = req.query || {};

    if (!email) {
      return res.status(400).json({ message: "Thiếu email" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const acc = await Account.findOne({
      email: normalizedEmail,
      isActivated: true,
      role: "resident", // chỉ cho phép thêm tài khoản người thuê khác
    })
      .populate("userInfo")
      .lean();

    if (!acc) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản với email này" });
    }

    // Không cho tự add chính mình làm roommate
    if (String(acc._id) === String(tenantId)) {
      return res.status(400).json({
        message: "Bạn không thể thêm chính mình làm người ở cùng",
      });
    }

    const ui = acc.userInfo || {};

    return res.json({
      id: acc._id,
      email: acc.email,
      fullName: ui.fullName || "",
      phoneNumber: ui.phoneNumber || "",
      dob: ui.dob || null,
      address: ui.address || "",
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};
