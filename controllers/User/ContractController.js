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
// body: { B, bikes, roommates }
exports.updateMyData = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { B, bikes, roommates } = req.body || {};

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

    // Cập nhật Bên B
    if (B) {
      const merged = {
        ...(contract.B?.toObject?.() || contract.B || {}),
        ...B,
      };

      // nếu B.permanentAddress FE gửi dạng object/array thì normalize
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

    //Roommates: nhập thủ công theo personSchema
    if (Array.isArray(roommates)) {
      const normalizedRoommates = roommates
        .filter((r) => r && r.name)
        .map((r) => ({
          name: r.name,
          dob: r.dob || null,
          cccd: r.cccd || "",
          cccdIssuedDate: r.cccdIssuedDate || null,
          cccdIssuedPlace: r.cccdIssuedPlace || "",
          permanentAddress: normalizeAddress(r.permanentAddress),
          phone: r.phone || "",
          email: r.email || "",
        }));

      contract.roommates = normalizedRoommates;
    }

    //Check maxTenants: 1 (B) + số roommates
    const room = await Room.findById(contract.roomId)
      .select("maxTenants")
      .lean();

    const roommateCount = (contract.roommates || []).length;
    const totalTenant = 1 + roommateCount; // 1 = B (tenant chính trong hợp đồng)

    if (room?.maxTenants && totalTenant > room.maxTenants) {
      return res.status(400).json({
        message: `Số người ở (${totalTenant}) vượt quá giới hạn cho phép (${room.maxTenants})`,
      });
    }

    //Build lại occupants = B + roommates
    const occupants = [];
    if (contract.B && contract.B.name) occupants.push(contract.B);
    if (Array.isArray(contract.roommates) && contract.roommates.length) {
      occupants.push(...contract.roommates);
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
// POST /tenants/contracts/:id/request-extend
// body: { months, note }
exports.requestExtend = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { months, note } = req.body || {};

    if (!months || Number(months) <= 0) {
      return res
        .status(400)
        .json({ message: "Số tháng gia hạn phải lớn hơn 0" });
    }

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message:
          "Chỉ có thể yêu cầu gia hạn khi hợp đồng đang ở trạng thái đã hoàn tất",
      });
    }

    if (!contract.contract?.endDate) {
      return res.status(400).json({
        message: "Hợp đồng chưa có ngày kết thúc để gia hạn",
      });
    }

    // Không cho gửi khi đã có request pending
    if (
      contract.renewalRequest &&
      contract.renewalRequest.status === "pending"
    ) {
      return res.status(400).json({
        message: "Bạn đã gửi yêu cầu gia hạn, vui lòng chờ chủ trọ xử lý",
      });
    }

    const oldEndDate = contract.contract.endDate;
    const now = new Date();

    // Optional: cho phép gửi trước khi hết hạn + trong 7 ngày sau khi hết hạn
    const GRACE_DAYS = 7;
    const graceLimit = new Date(
      oldEndDate.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000
    );

    if (now > graceLimit) {
      return res.status(400).json({
        message:
          "Hợp đồng đã hết hạn quá lâu, vui lòng liên hệ chủ trọ để làm hợp đồng mới.",
      });
    }

    // Tính ngày kết thúc mới (endDate + months)
    const requestedEndDate = new Date(oldEndDate);
    requestedEndDate.setMonth(requestedEndDate.getMonth() + Number(months));

    contract.renewalRequest = {
      months: Number(months),
      requestedEndDate,
      note: note || "",
      status: "pending",
      requestedAt: now,
      requestedById: tenantId,
      requestedByRole: "resident",
    };

    await contract.save();

    res.json({
      message: "Gửi yêu cầu gia hạn thành công",
      renewalRequest: contract.renewalRequest,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
// GET /tenants/contracts/upcoming-expire?days=30
exports.listUpcomingExpire = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { days = 30, page = 1, limit = 20 } = req.query;

    const numDays = Math.max(Number(days) || 30, 1); // ít nhất 1 ngày

    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + numDays);

    const filter = {
      tenantId,
      status: "completed",
      "contract.endDate": { $gte: now, $lte: future },
    };

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id status buildingId roomId contract.no contract.startDate contract.endDate"
        )
        .populate("buildingId", "name address")
        .populate("roomId", "roomNumber")
        .sort({ "contract.endDate": 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Contract.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      days: numDays,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
