const MaintenanceRequest = require("../../models/MaintenanceRequest");
const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");

const isAdmin = (u) => u?.role === "admin";
const isLandlord = (u) => u?.role === "landlord";
const isResident = (u) => u?.role === "resident";

async function getLandlordIdByBuildingId(buildingId) {
  const building = await Building.findById(buildingId)
    .select("landlordId")
    .lean();
  return building?.landlordId || null;
}

// Tạo phiếu báo hỏng
exports.createRequest = async (req, res) => {
  try {
    const {
      roomId,
      furnitureId,
      title,
      description,
      photos,
      priority,
      affectedQuantity = 1,
    } = req.body;

    const rf = await RoomFurniture.findOne({ roomId, furnitureId });
    if (!rf)
      return res
        .status(400)
        .json({ message: "Furniture không thuộc phòng này" });

    // chặn trùng non-final (khuyến nghị)
    const existsNonFinal = await MaintenanceRequest.exists({
      roomId,
      furnitureId,
      status: { $nin: ["resolved", "rejected"] },
    });
    if (existsNonFinal) {
      return res
        .status(400)
        .json({ message: "Đã có yêu cầu đang xử lý cho món này trong phòng." });
    }

    const room = await Room.findById(roomId)
      .select("buildingId building")
      .lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const buildingId = room.buildingId || room.building;

    const qty = Number(affectedQuantity) || 1;
    if (qty < 1)
      return res.status(400).json({ message: "affectedQuantity phải >= 1" });
    if (qty > rf.quantity)
      return res
        .status(400)
        .json({ message: "affectedQuantity vượt số lượng trong phòng" });

    let assigneeAccountId = null;
    const landlordIdFromBuilding = await getLandlordIdByBuildingId(buildingId);
    if (landlordIdFromBuilding) {
      assigneeAccountId = landlordIdFromBuilding;
    } else if (isLandlord(req.user)) {
      assigneeAccountId = req.user._id;
    }

    const doc = await MaintenanceRequest.create({
      buildingId,
      roomId,
      furnitureId,
      reporterAccountId: req.user._id,
      assigneeAccountId, // <= auto gán ở đây
      title,
      description,
      photos,
      priority,
      affectedQuantity: qty,
      timeline: [
        {
          by: req.user._id,
          action: "created",
          note: assigneeAccountId ? "Tạo + auto-assign chủ trọ" : "Tạo yêu cầu",
        },
      ],
    });

    // cập nhật damageCount (cap ≤ quantity)
    rf.damageCount = Math.min((rf.damageCount || 0) + qty, rf.quantity);
    rf.syncConditionFromDamage();
    await rf.save();

    return res
      .status(201)
      .json({ message: "Đã tạo yêu cầu bảo trì", data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi tạo yêu cầu" });
  }
};

// Chi tiết phiếu
exports.getRequest = async (req, res) => {
  try {
    const doc = await MaintenanceRequest.findById(req.params.id)
      .populate("roomId furnitureId reporterAccountId assigneeAccountId")
      .populate({
        path: "timeline.by",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      });

    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });
    return res.json({ data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi lấy chi tiết" });
  }
};

// Thêm comment/timeline nhanh
exports.comment = async (req, res) => {
  try {
    const { note } = req.body;
    const doc = await MaintenanceRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const can =
      isAdmin(req.user) ||
      isLandlord(req.user) ||
      String(doc.reporterAccountId) === String(req.user._id) ||
      String(doc.assigneeAccountId) === String(req.user._id);

    if (!can) return res.status(403).json({ message: "Không có quyền" });

    doc.pushEvent(req.user._id, "comment", note || "");
    await doc.save();

    return res.json({ message: "Đã thêm ghi chú", data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi thêm ghi chú" });
  }
};
exports.listMyRoomRequests = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res
        .status(403)
        .json({ message: "Chỉ resident mới được dùng API này" });
    }

    const tenantId = req.user._id;

    // Tìm phòng mà tenant hiện đang ở
    const room = await Room.findOne({
      currentTenantIds: tenantId,
      status: "rented",
      isDeleted: false,
      active: true,
    })
      .populate({ path: "buildingId", select: "_id name address" })
      .lean();

    if (!room) {
      return res.status(404).json({
        message: "Bạn chưa được gán vào phòng nào hoặc phòng chưa active",
      });
    }

    // Lọc theo query đơn giản: status, priority, page, limit
    let {
      status,
      priority,
      page = 1,
      limit = 10,
      sort = "-createdAt",
    } = req.query;

    page = Number.isFinite(Number(page)) ? Number(page) : 1;
    limit = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    limit = Math.min(Math.max(limit, 1), 100);

    const filter = { roomId: room._id };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const skip = (page - 1) * limit;

    const baseQuery = MaintenanceRequest.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select(
        [
          "_id",
          "buildingId",
          "roomId",
          "furnitureId",
          "reporterAccountId",
          "assigneeAccountId",
          "title",
          "status",
          "priority",
          "affectedQuantity",
          "scheduledAt",
          "estimatedCost",
          "actualCost",
          "resolvedAt",
          "createdAt",
          "updatedAt",
        ].join(" ")
      )
      .populate({ path: "furnitureId", select: "_id name" })
      .populate({
        path: "assigneeAccountId",
        select: "email role userInfo",
        populate: { path: "userInfo", select: "fullName phoneNumber" },
      })
      .lean();

    const [data, total] = await Promise.all([
      baseQuery.exec(),
      MaintenanceRequest.countDocuments(filter),
    ]);

    // Bổ sung display tên người xử lý cho tiện
    for (const r of data) {
      const ass = r.assigneeAccountId;
      r.assigneeName = ass?.userInfo?.fullName || ass?.email || null;
    }

    return res.json({
      room: {
        id: room._id,
        roomNumber: room.roomNumber,
        floorId: room.floorId,
        building: room.buildingId,
        area: room.area,
        price: room.price,
        status: room.status,
      },
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      sort,
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ message: "Lỗi lấy danh sách yêu cầu của phòng" });
  }
};
