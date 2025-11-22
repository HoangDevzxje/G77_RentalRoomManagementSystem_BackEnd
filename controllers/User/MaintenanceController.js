const MaintenanceRequest = require("../../models/MaintenanceRequest");
const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const mongoose = require("mongoose");

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
      priority = "medium",
      affectedQuantity = 1,
    } = req.body;

    if (!roomId || !furnitureId || !title) {
      return res.status(400).json({
        success: false,
        message: "Thiếu roomId, furnitureId hoặc tiêu đề",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: "ID phòng không hợp lệ",
      });
    }

    // Tìm RoomFurniture dựa trên roomId và furnitureId (có thể là ID hoặc name)
    let rf;
    if (mongoose.Types.ObjectId.isValid(furnitureId)) {
      rf = await RoomFurniture.findOne({ roomId, furnitureId });
    } else {
      const furniture = await mongoose
        .model("Furniture")
        .findOne({ name: furnitureId })
        .select("_id");

      if (furniture) {
        rf = await RoomFurniture.findOne({
          roomId,
          furnitureId: furniture._id,
        });
      }
    }

    if (!rf) {
      return res.status(400).json({
        success: false,
        message: "Đồ nội thất không thuộc phòng này hoặc không tồn tại",
      });
    }

    const actualFurnitureId = rf.furnitureId;
    const existsNonFinal = await MaintenanceRequest.exists({
      roomId,
      furnitureId: actualFurnitureId,
      status: { $nin: ["resolved", "rejected"] },
    });

    if (existsNonFinal) {
      return res.status(400).json({
        success: false,
        message: "Đã có yêu cầu đang xử lý cho món đồ này trong phòng",
      });
    }

    // Lấy thông tin phòng và tòa nhà
    const room = await Room.findById(roomId)
      .select("buildingId building roomNumber")
      .lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng",
      });
    }

    const buildingId = room.buildingId || room.building;
    const qty = Number(affectedQuantity) || 1;
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Số lượng bị ảnh hưởng phải là số >= 1",
      });
    }

    if (qty > rf.quantity) {
      return res.status(400).json({
        success: false,
        message:
          "Số lượng bị ảnh hưởng vượt quá số lượng đồ nội thất trong phòng",
      });
    }

    let assigneeAccountId = null;
    const landlordIdFromBuilding = await getLandlordIdByBuildingId(buildingId);

    if (landlordIdFromBuilding) {
      assigneeAccountId = landlordIdFromBuilding;
    } else if (isLandlord(req.user)) {
      assigneeAccountId = req.user._id;
    }

    const uploadedImages = req.files || [];
    const photos = uploadedImages.map((file) => ({
      url: file.path || file.location,
      uploadedAt: new Date(),
    }));

    // Tạo maintenance request
    const doc = await MaintenanceRequest.create({
      buildingId,
      roomId,
      furnitureId: actualFurnitureId,
      reporterAccountId: req.user._id,
      assigneeAccountId,
      title: title.trim(),
      description: description?.trim() || "",
      photos: photos,
      priority: ["low", "medium", "high", "urgent"].includes(priority)
        ? priority
        : "medium",
      affectedQuantity: qty,
      timeline: [
        {
          by: req.user._id,
          action: "created",
          note: assigneeAccountId
            ? "Yêu cầu đã được giao cho người quản lý tòa nhà"
            : "Chưa có người quản lý tòa nhà, yêu cầu chưa được giao",
          createdAt: new Date(),
        },
      ],
    });

    // Cập nhật damageCount (đảm bảo không vượt quá quantity)
    rf.damageCount = Math.min((rf.damageCount || 0) + qty, rf.quantity);
    if (rf.syncConditionFromDamage) {
      rf.syncConditionFromDamage();
    }
    await rf.save();

    // Populate thông tin để trả về
    const populatedDoc = await MaintenanceRequest.findById(doc._id)
      .populate("roomId", "roomNumber")
      .populate("furnitureId", "name")
      .populate({
        path: "assigneeAccountId",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      })
      .lean();

    return res.status(201).json({
      success: true,
      message: "Đã tạo yêu cầu bảo trì thành công",
      data: populatedDoc,
    });
  } catch (error) {
    console.error("Create maintenance request error:", error);

    // Xử lý lỗi duplicate key (nếu có)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu bảo trì đã tồn tại",
      });
    }

    // Xử lý lỗi validation của Mongoose
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Đã có lỗi xảy ra khi tạo yêu cầu bảo trì, vui lòng thử lại sau",
    });
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
