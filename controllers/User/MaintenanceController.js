const MaintenanceRequest = require("../../models/MaintenanceRequest");
const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const mongoose = require("mongoose");
const Staff = require("../../models/Staff");
const Notification = require("../../models/Notification");
const Account = require("../../models/Account");

const isAdmin = (u) => u?.role === "admin";
const isLandlord = (u) => u?.role === "landlord";
const isResident = (u) => u?.role === "resident";

async function getLandlordIdByBuildingId(buildingId) {
  const building = await Building.findById(buildingId)
    .select("landlordId")
    .lean();
  return building?.landlordId || null;
}

const CATEGORIES = [
  "furniture",
  "electrical",
  "plumbing",
  "air_conditioning",
  "door_lock",
  "wall_ceiling",
  "flooring",
  "windows",
  "appliances",
  "internet_wifi",
  "pest_control",
  "cleaning",
  "safety",
  "other"
];

exports.createRequest = async (req, res) => {
  try {
    const {
      roomId,
      category,
      furnitureId,
      title,
      description,
      affectedQuantity = 1,
    } = req.body;

    if (!roomId || !category || !title?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Thiếu phòng, danh mục hoặc tiêu đề",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: "ID phòng không hợp lệ",
      });
    }

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Danh mục bảo trì không hợp lệ",
      });
    }

    const room = await Room.findOne({
      _id: roomId,
      currentTenantIds: req.user._id,
      status: "rented",
      active: true,
      isDeleted: false,
    })
      .select("buildingId roomNumber")
      .lean();

    if (!room) {
      return res.status(403).json({
        success: false,
        message: "Bạn không phải cư dân đang ở phòng này",
      });
    }

    const buildingId = room.buildingId;
    const qty = parseInt(affectedQuantity, 10);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: "Số lượng bị ảnh hưởng phải ≥ 1",
      });
    }

    let actualFurnitureId = null;
    let rf = null;

    if (category === "furniture") {
      if (!furnitureId) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn đồ nội thất bị hỏng",
        });
      }

      if (mongoose.Types.ObjectId.isValid(furnitureId)) {
        rf = await RoomFurniture.findOne({ roomId, furnitureId });
      } else {
        const furniture = await mongoose.model("Furniture").findOne({ name: furnitureId }).select("_id").lean();
        if (furniture) {
          rf = await RoomFurniture.findOne({ roomId, furnitureId: furniture._id }).lean();
        }
      }

      if (!rf) {
        return res.status(400).json({
          success: false,
          message: "Đồ nội thất không thuộc phòng này hoặc không tồn tại",
        });
      }

      actualFurnitureId = rf.furnitureId;

      const exists = await MaintenanceRequest.exists({
        roomId,
        furnitureId: actualFurnitureId,
        status: { $nin: ["resolved", "rejected"] },
      });

      if (exists) {
        return res.status(400).json({
          success: false,
          message: "Đã có yêu cầu đang xử lý cho món đồ này",
        });
      }

      if (qty > rf.quantity) {
        return res.status(400).json({
          success: false,
          message: "Số lượng vượt quá số lượng đồ nội thất trong phòng",
        });
      }
    }

    // === XỬ LÝ ẢNH ===
    const uploadedImages = req.files || [];
    const photos = uploadedImages.map((file) => ({
      url: file.path || file.location,
      uploadedAt: new Date(),
    }));

    // === TẠO YÊU CẦU ===
    const doc = await MaintenanceRequest.create({
      buildingId,
      roomId,
      furnitureId: actualFurnitureId,
      category,
      reporterAccountId: req.user._id,
      title: title.trim(),
      description: description?.trim() || "",
      photos,
      affectedQuantity: qty,
      timeline: [
        {
          by: req.user._id,
          action: "created",
          note: "Người thuê đã gửi yêu cầu bảo trì",
          createdAt: new Date(),
        },
      ],
    });

    if (rf && category === "furniture") {
      rf.damageCount = Math.min((rf.damageCount || 0) + qty, rf.quantity);
      if (rf.syncConditionFromDamage) {
        rf.syncConditionFromDamage();
      }
      await rf.save();
    }

    const io = req.app.get("io");
    if (io) {
      const building = await Building.findById(buildingId).select("landlordId name").lean();

      const itemName = category === "furniture"
        ? rf?.furnitureName || "Đồ nội thất"
        : category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

      const notification = await Notification.create({
        landlordId: building.landlordId,
        createBy: req.user._id,
        createByRole: "resident",
        title: `Báo hỏng: ${title}`,
        content: `Phòng ${room.roomNumber} tòa nhà ${building.name} - ${itemName} bị hỏng (${qty} cái)`,
        target: { buildings: [buildingId] },
        link: `/landlord/maintenance`,
      });

      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: req.user._id.toString(),
          name: req.user.fullName || req.user.username,
          role: "resident",
          roomNumber: room.roomNumber,
          buildingName: building?.name || "Tòa nhà",
        },
        photos: photos.map(p => p.url),
      };

      if (building?.landlordId) {
        io.to(`user:${building.landlordId}`).emit("new_notification", payload);
        io.to(`user:${building.landlordId}`).emit("unread_count_increment", { increment: 1 });
      }

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false,
      }).select("accountId").lean();

      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    const populatedDoc = await MaintenanceRequest.findById(doc._id)
      .populate("roomId", "roomNumber")
      .populate("furnitureId", "name")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Đã gửi yêu cầu bảo trì thành công",
      data: populatedDoc,
    });

  } catch (error) {
    console.error("Create maintenance request error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu bảo trì đã tồn tại",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống",
    });
  }
};
// Chi tiết phiếu
exports.getRequest = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Thiếu id" });
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID phòng không hợp lệ",
      });
    }
    const doc = await MaintenanceRequest.findById(req.params.id)
      .populate("roomId", "roomNumber buildingId")
      .populate("furnitureId", "name")
      .populate({
        path: "reporterAccountId",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      })
      .populate({
        path: "assigneeAccountId",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      })
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

exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!note?.trim()) {
      return res.status(400).json({ success: false, message: "Nội dung bình luận không được để trống" });
    }

    const maintenance = await MaintenanceRequest.findById(id)
      .populate("roomId", "roomNumber currentTenantIds buildingId")
      .populate("buildingId", "landlordId name")
      .lean();

    if (!maintenance) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiếu bảo trì" });
    }

    const userId = req.user._id;
    const isInRoom = maintenance.roomId?.currentTenantIds?.some(id => String(id) === String(userId));

    if (!isInRoom) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền bình luận vào phiếu này" });
    }

    const newComment = {
      by: userId,
      action: "comment",
      note: note.trim(),
      at: new Date(),
    };

    await MaintenanceRequest.updateOne(
      { _id: id },
      { $push: { timeline: newComment }, $set: { updatedAt: new Date() } }
    );

    const user = await Account.findById(userId).populate("userInfo").lean();
    const senderName = user?.userInfo?.fullName || user.email;
    const notification = await Notification.create({
      landlordId: maintenance.buildingId.landlordId,
      createBy: userId,
      createByRole: "resident",
      title: "Ghi chú mới trong phiếu bảo trì",
      content: `${senderName} đã bình luận: "${note.trim().substring(0, 50)}${note.length > 50 ? "..." : ""}"`,
      target: { buildings: [maintenance.buildingId._id] },
      link: `/landlord/maintenance`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: userId.toString(),
          name: senderName,
          role: "resident",
          roomNumber: maintenance.roomId?.roomNumber || null,
        },
        maintenanceId: id,
        comment: newComment.note,
      };

      io.to(`user:${maintenance.buildingId.landlordId}`).emit("new_notification", payload);
      io.to(`user:${maintenance.buildingId.landlordId}`).emit("unread_count_increment", { increment: 1 });

      const staffList = await Staff.find({
        assignedBuildings: maintenance.buildingId._id,
        isDeleted: false,
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    return res.json({
      success: true,
      message: "Đã thêm bình luận thành công",
      data: newComment,
    });

  } catch (error) {
    console.error("Add comment error:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { note } = req.body;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!commentId) {
      return res.status(400).json({ message: 'Thiếu commentId' });
    }
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'commentId không hợp lệ' });
    }
    if (!note?.trim()) return res.status(400).json({ success: false, message: "Nội dung không được để trống" });

    const maintenance = await MaintenanceRequest.findById(id).populate("buildingId", "landlordId");
    if (!maintenance) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    const comment = maintenance.timeline.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Không tìm thấy bình luận" });

    const isOwner = String(comment.by) === String(req.user._id);
    if (!isOwner) return res.status(403).json({ success: false, message: "Không có quyền sửa" });

    comment.note = note.trim();
    comment.action = "update";
    comment.at = new Date();
    await maintenance.save();

    const user = await Account.findById(req.user._id).populate("userInfo").lean();
    const senderName = user?.userInfo?.fullName || user.email;
    const notification = await Notification.create({
      landlordId: maintenance.buildingId.landlordId,
      createBy: req.user._id,
      createByRole: "resident",
      title: "Người thuê mới cập nhật trong phiếu bảo trì",
      content: `${senderName} đã bình luận: "${note.trim().substring(0, 50)}${note.length > 50 ? "..." : ""}"`,
      target: { buildings: [maintenance.buildingId._id] },
      link: `/landlord/maintenance`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: req.user._id.toString(),
          name: senderName,
          role: "resident",
          roomNumber: maintenance.roomId?.roomNumber || null,
        },
        maintenanceId: id,
      };

      io.to(`user:${maintenance.buildingId.landlordId}`).emit("new_notification", payload);
      io.to(`user:${maintenance.buildingId.landlordId}`).emit("unread_count_increment", { increment: 1 });

      const staffList = await Staff.find({
        assignedBuildings: maintenance.buildingId._id,
        isDeleted: false,
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    return res.json({ success: true, message: "Đã cập nhật bình luận" });

  } catch (error) {
    console.error("Update comment error:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!commentId) {
      return res.status(400).json({ message: 'Thiếu commentId' });
    }
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: 'commentId không hợp lệ' });
    }
    const maintenance = await MaintenanceRequest.findById(id)
      .populate("buildingId", "landlordId _id")
      .populate("roomId", "roomNumber");

    if (!maintenance) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phiếu bảo trì" });
    }

    const commentIndex = maintenance.timeline.findIndex(
      c => c._id.toString() === commentId
    );

    if (commentIndex === -1) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bình luận" });
    }

    const comment = maintenance.timeline[commentIndex];

    const isOwner = String(comment.by) === String(req.user._id);

    if (!isOwner) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền xóa bình luận này" });
    }

    const user = await Account.findById(req.user._id).populate("userInfo").lean();
    const deletedByName = user?.userInfo?.fullName || user.email;
    await MaintenanceRequest.updateOne(
      { _id: id },
      { $pull: { timeline: { _id: commentId } } }
    );

    // === THÔNG BÁO + REALTIME ===
    const notification = await Notification.create({
      landlordId: maintenance.buildingId.landlordId,
      createBy: req.user._id,
      createByRole: "resident",
      title: "Bình luận đã bị xóa",
      content: `${deletedByName} đã xóa một bình luận trong phiếu bảo trì phòng ${maintenance.roomId?.roomNumber || ""}`,
      target: { buildings: [maintenance.buildingId._id] },
      link: `/landlord/maintenance`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: req.user._id.toString(),
          name: deletedByName,
          role: "resident",
        },
        maintenanceId: id,
        action: "comment_deleted",
      };

      io.to(`user:${maintenance.buildingId.landlordId}`).emit("new_notification", payload);
      io.to(`user:${maintenance.buildingId.landlordId}`).emit("unread_count_increment", { increment: 1 });

      const staffList = await Staff.find({
        assignedBuildings: maintenance.buildingId._id,
        isDeleted: false,
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    return res.json({
      success: true,
      message: "Đã xóa bình luận thành công",
    });

  } catch (error) {
    console.error("Delete comment error:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};
exports.listMyRoomRequests = async (req, res) => {
  try {
    if (req.user.role !== "resident") {
      return res.status(403).json({
        success: false,
        message: "Chỉ cư dân mới được sử dụng chức năng này",
      });
    }

    const tenantId = req.user._id;

    const rooms = await Room.find({
      currentTenantIds: tenantId,
      status: "rented",
      active: true,
      isDeleted: false,
    }).select("roomNumber buildingId").lean();

    if (rooms.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bạn hiện chưa ở phòng nào",
      });
    }

    const roomIds = rooms.map(r => r._id);

    let {
      status,
      category,
      page = 1,
      limit = 15,
      sort = "-createdAt",
    } = req.query;

    page = Math.max(1, parseInt(page, 10));
    limit = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const skip = (page - 1) * limit;

    const filter = { roomId: { $in: roomIds } };
    if (status) filter.status = status;
    if (category) filter.category = category;

    const [data, total] = await Promise.all([
      MaintenanceRequest.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(
          "_id title status category affectedQuantity photos createdAt updatedAt " +
          "roomId furnitureId reporterAccountId assigneeAccountId scheduledAt resolvedAt"
        )
        .populate("roomId", "roomNumber")
        .populate("furnitureId", "name")
        .populate({
          path: "reporterAccountId",
          select: "email role userInfo",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .populate({
          path: "assigneeAccountId",
          select: "email role userInfo",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .lean(),

      MaintenanceRequest.countDocuments(filter),
    ]);

    const requests = data.map(req => ({
      _id: req._id,
      title: req.title,
      category: req.category,
      status: req.status,
      itemName: req.furnitureId?.name || null,
      roomNumber: req.roomId.roomNumber,

      reportedBy: {
        name: req.reporterAccountId?.userInfo?.fullName
          || req.reporterAccountId?.email
          || "Người thuê trước",
        isMe: req.reporterAccountId
          ? String(req.reporterAccountId._id) === String(tenantId)
          : false,
      },

      assignee: req.assigneeAccountId
        ? {
          name: req.assigneeAccountId.userInfo?.fullName
            || req.assigneeAccountId.email
            || "Chưa chỉ định",
          phone: req.assigneeAccountId.userInfo?.phoneNumber || null,
        }
        : null,

      photoCount: req.photos?.length || 0,
      hasPhoto: (req.photos?.length || 0) > 0,
      affectedQuantity: req.affectedQuantity,
      scheduledAt: req.scheduledAt || null,
      resolvedAt: req.resolvedAt || null,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
    }));

    const activeRooms = rooms.map(r => ({
      id: r._id,
      roomNumber: r.roomNumber,
    }));

    return res.json({
      success: true,
      summary: {
        totalRequests: total,
        activeRooms: activeRooms.length,
      },
      rooms: activeRooms,
      requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    console.error("listMyRoomRequests error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi tải danh sách",
    });
  }
};
