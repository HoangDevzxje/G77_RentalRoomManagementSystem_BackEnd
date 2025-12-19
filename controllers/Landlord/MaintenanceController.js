const MaintenanceRequest = require("../../models/MaintenanceRequest");
const Notification = require("../../models/Notification");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const mongoose = require("mongoose");
const Account = require("../../models/Account");

exports.listRequests = async (req, res) => {
  try {
    let {
      buildingId,
      roomId,
      status,
      category,
      q,
      page = 1,
      limit = 15,
      sort = "-createdAt",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 15));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // Quyền theo role
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({ success: true, data: [], total: 0, pagination: { page: pageNum, limit: limitNum } });
      }
      filter.buildingId = { $in: req.staff.assignedBuildingIds };
    }
    if (req.user.role === "landlord") {
      const ownedBuildings = await Building.find({
        landlordId: req.user._id,
        isDeleted: false
      }).select("_id");

      const ownedIds = ownedBuildings.map(b => b._id);

      if (!ownedIds.length)
        return res.json({ success: true, data: [], total: 0 });

      filter.buildingId = buildingId ? buildingId : { $in: ownedIds };
    }

    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (status) filter.status = status;
    if (category) filter.category = category;

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    const [data, total] = await Promise.all([
      MaintenanceRequest.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .select("_id title category status repairCost images photos affectedQuantity roomId reporterAccountId assigneeAccountId resolvedAt createdAt")
        .populate("roomId", "roomNumber")
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
        .lean(),

      MaintenanceRequest.countDocuments(filter),
    ]);
    const requests = data.map(r => ({
      _id: r._id,
      title: r.title,
      category: r.category,
      status: r.status,
      roomNumber: r.roomId?.roomNumber || "—",
      reportedBy: r.reporterAccountId?.userInfo?.fullName || "Người thuê",
      assignee: r.assigneeAccountId ? {
        name: r.assigneeAccountId?.userInfo?.fullName,
        phone: r.assigneeAccountId?.userInfo?.phoneNumber,
      } : null,
      photoCount: r.photos?.length || 0,
      proofImageCount: r.images?.length || 0,
      repairCost: r.repairCost,
      mustPay: !!(r.repairCost && r.images?.length > 0),
      affectedQuantity: r.affectedQuantity,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
    }));

    return res.json({
      success: true,
      data: requests,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
      },
    });

  } catch (error) {
    console.error("listRequests error:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.getRequest = async (req, res) => {
  try {
    const doc = await MaintenanceRequest.findById(req.params.id)
      .populate("buildingId", "name")
      .populate("roomId", "roomNumber currentTenantIds")
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
      })
      .lean();

    if (!doc) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    // Kiểm tra quyền staff
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.includes(String(doc.buildingId._id))) {
        return res.status(403).json({ success: false, message: "Bạn không quản lý tòa này" });
      }
    }

    return res.json({ success: true, data: doc });

  } catch (error) {
    console.error("getRequest error:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.updateRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    const { status, repairCost, note } = req.body;

    const maintenance = await MaintenanceRequest.findById(id)
      .populate("buildingId", "landlordId")
      .populate("roomId", "currentTenantIds roomNumber");

    if (!maintenance) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    const changes = [];
    const isPrivileged = ["landlord", "staff"].includes(req.user.role);
    const isCurrentAssignee = String(maintenance.assigneeAccountId) === String(req.user._id);
    const hasAssignee = !!maintenance.assigneeAccountId;

    if (!isPrivileged && !isCurrentAssignee && hasAssignee) {
      return res.status(403).json({ success: false, message: "Bạn không phải người được phân công" });
    }
    if (req.user.role === "staff" && !req.staff?.assignedBuildingIds?.includes(String(maintenance.buildingId._id))) {
      return res.status(403).json({ success: false, message: "Bạn không quản lý tòa này" });
    }

    if (!hasAssignee && (isPrivileged || req.user.role === "staff")) {
      maintenance.assigneeAccountId = req.user._id;
      changes.push("Đã nhận xử lý phiếu");
    }

    if (status && status !== maintenance.status) {
      const oldStatus = maintenance.status;
      maintenance.status = status;
      if (status === "resolved") {
        maintenance.resolvedAt = new Date();
        changes.push(`ĐÃ HOÀN THÀNH (từ ${oldStatus} → resolved)`);
      } else {
        changes.push(`Trạng thái: ${oldStatus} → ${status}`);
        if (maintenance.resolvedAt) maintenance.resolvedAt = null;
      }
    }

    let isPaymentRequest = false;
    if (repairCost !== undefined || req.files?.length > 0) {
      const cost = Number(repairCost);

      if (cost > 0) {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Phải upload ít nhất 1 ảnh hóa đơn khi yêu cầu thanh toán",
          });
        }
        const imageUrls = req.files.map(file => file.path);
        maintenance.repairCost = cost;
        maintenance.images = imageUrls;
        changes.push(`Yêu cầu thanh toán: ${cost.toLocaleString()}₫`);
        isPaymentRequest = true;
      } else {
        maintenance.repairCost = null;
        maintenance.images = [];
        changes.push("Chi phí do chủ nhà chi trả");
      }
    }

    // === 5. GHI LOG ===
    if (changes.length > 0 || note) {
      maintenance.timeline.push({
        by: req.user._id,
        action: "updated",
        note: note || changes.join(" | "),
        at: new Date(),
      });
    }

    await maintenance.save();
    const io = req.app.get("io");
    const user = await Account.findById(req.user._id).populate("userInfo");
    const senderName = user?.userInfo?.fullName || req.user.email.split("@")[0] || "Chủ nhà";

    if (io && maintenance.roomId?.currentTenantIds?.length) {
      let title = "";
      let content = "";

      if (isPaymentRequest) {
        title = "Yêu cầu thanh toán chi phí sửa chữa";
        content = `${senderName} đã xử lý xong phiếu bảo trì.\nChi phí: ${maintenance.repairCost.toLocaleString()}₫\nVui lòng thanh toán trong 3 ngày nhé!`;
      } else {
        title = "Phiếu bảo trì đã được cập nhật";
        content = `Phiếu "${maintenance.title}" đã được ${senderName} cập nhật.\nTrạng thái hiện tại: ${maintenance.status.toUpperCase()}`;
        if (maintenance.status === "resolved") {
          content = `Phiếu bảo trì đã được HOÀN THÀNH!\n${senderName} đã sửa xong "${maintenance.title}"`;
        }
      }

      const notification = await Notification.create({
        landlordId: maintenance.buildingId.landlordId,
        createByRole: "system",
        title,
        content,
        target: { residents: maintenance.roomId.currentTenantIds },
        createdAt: new Date(),
      });

      const payload = {
        _id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          _id: req.user._id.toString(),
          role: "system",
          name: senderName,
        },
        data: isPaymentRequest ? {
          maintenanceId: id,
          repairCost: maintenance.repairCost,
          proofImages: maintenance.images,
          deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        } : {
          maintenanceId: id,
          status: maintenance.status,
        },
      };

      maintenance.roomId.currentTenantIds.forEach(tid => {
        const userIdStr = tid.toString();
        io.to(`user:${userIdStr}`).emit("new_notification", payload);
        io.to(`user:${userIdStr}`).emit("unread_count_increment", { increment: 1 });
      });

    }

    return res.json({
      success: true,
      message: "Cập nhật thành công",
      data: maintenance,
    });

  } catch (error) {
    console.error("updateRequest error:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.comment = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    if (!note?.trim()) return res.status(400).json({ success: false, message: "Nội dung không được trống" });

    const maintenance = await MaintenanceRequest.findById(id)
      .populate("roomId", "currentTenantIds roomNumber")
      .populate("buildingId", "landlordId");

    if (!maintenance) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    const allowed = ["landlord", "staff"].includes(req.user.role) ||
      String(maintenance.reporterAccountId) === String(req.user._id) ||
      String(maintenance.assigneeAccountId) === String(req.user._id);

    if (!allowed) return res.status(403).json({ success: false, message: "Không có quyền bình luận" });
    const user = await Account.findById(req.user._id).populate("userInfo");
    const senderName = user?.userInfo?.fullName || req.user.email.split("@")[0] || "Chủ nhà";

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      by: req.user._id,
      action: "comment",
      note: note.trim(),
      at: new Date(),
    };

    maintenance.timeline.push(newComment);
    await maintenance.save();

    const io = req.app.get("io");
    if (io && maintenance.roomId?.currentTenantIds?.length) {
      const notification = await Notification.create({
        landlordId: maintenance.buildingId.landlordId,
        createByRole: "system",
        title: "Có bình luận mới trong phiếu bảo trì",
        content: `${senderName} đã bình luận: "${note.trim().substring(0, 100)}${note.trim().length > 100 ? "..." : ""}"`,
        target: { residents: maintenance.roomId.currentTenantIds },
        createdAt: new Date(),
      });

      const payload = {
        _id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          _id: req.user._id.toString(),
          role: req.user.role,
          name: senderName,
        },
        data: {
          maintenanceId: id,
          comment: {
            _id: newComment._id.toString(),
            note: newComment.note,
            by: senderName,
            byId: req.user._id.toString(),
            at: newComment.at,
          },
        },
      };

      maintenance.roomId.currentTenantIds.forEach(tid => {
        const userIdStr = tid.toString();
        if (userIdStr !== req.user._id.toString()) {
          io.to(`user:${userIdStr}`).emit("new_notification", payload);
          io.to(`user:${userIdStr}`).emit("unread_count_increment", { increment: 1 });
        }
      });

    }

    return res.json({
      success: true,
      message: "Đã thêm bình luận",
      data: { commentId: newComment._id.toString() },
    });

  } catch (error) {
    console.error("comment error:", error.message);
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
    if (!note?.trim()) return res.status(400).json({ success: false, message: "Nội dung không được trống" });

    const maintenance = await MaintenanceRequest.findById(id)
      .populate("roomId", "currentTenantIds")
      .populate("buildingId", "landlordId");

    if (!maintenance) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    const comment = maintenance.timeline.id(commentId);
    if (!comment || comment.action !== "comment") {
      return res.status(404).json({ success: false, message: "Không tìm thấy bình luận" });
    }

    if (String(comment.by) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Chỉ chủ bình luận mới được sửa" });
    }

    const oldNote = comment.note;
    comment.note = note.trim();
    comment.action = "update";
    comment.at = new Date();
    await maintenance.save();

    const user = await Account.findById(req.user._id).populate("userInfo");
    const senderName = user?.userInfo?.fullName || req.user.email.split("@")[0] || "Chủ nhà";

    const io = req.app.get("io");
    if (io && maintenance.roomId?.currentTenantIds?.length) {
      const notification = await Notification.create({
        landlordId: maintenance.buildingId.landlordId,
        createByRole: "system",
        title: "Bình luận đã được chỉnh sửa",
        content: `${senderName} đã chỉnh sửa bình luận trong phiếu bảo trì`,
        target: { residents: maintenance.roomId.currentTenantIds },
        createdAt: new Date(),
      });

      const payload = {
        _id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: { _id: req.user._id.toString(), role: req.user.role, name: senderName },
        data: {
          maintenanceId: id,
          commentId,
          note: note.trim(),
          edited: true,
          editedAt: comment.editedAt,
        },
      };

      maintenance.roomId.currentTenantIds.forEach(tid => {
        io.to(`user:${tid}`).emit("new_notification", payload);
        io.to(`user:${tid}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    return res.json({ success: true, message: "Đã sửa bình luận" });

  } catch (error) {
    console.error("updateComment error:", error.message);
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
      .populate("roomId", "currentTenantIds")
      .populate("buildingId", "landlordId");

    if (!maintenance) return res.status(404).json({ success: false, message: "Không tìm thấy phiếu" });

    const comment = maintenance.timeline.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bình luận" });
    }

    const isOwner = String(comment.by) === String(req.user._id);
    const isPrivileged = ["landlord", "staff"].includes(req.user.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ success: false, message: "Không có quyền xóa" });
    }

    const user = await Account.findById(req.user._id).populate("userInfo");
    const senderName = user?.userInfo?.fullName || req.user.email.split("@")[0] || "Chủ nhà";

    maintenance.timeline.pull({ _id: commentId });
    await maintenance.save();

    const io = req.app.get("io");
    if (io && maintenance.roomId?.currentTenantIds?.length) {
      const notification = await Notification.create({
        landlordId: maintenance.buildingId.landlordId,
        createByRole: "system",
        title: "Bình luận đã bị xóa",
        content: `${senderName} đã xóa một bình luận trong phiếu bảo trì`,
        target: { residents: maintenance.roomId.currentTenantIds },
        createdAt: new Date(),
      });

      const payload = {
        _id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: { _id: req.user._id.toString(), role: req.user.role, name: senderName },
        data: { maintenanceId: id, commentId, action: "deleted" },
      };

      maintenance.roomId.currentTenantIds.forEach(tid => {
        io.to(`user:${tid}`).emit("new_notification", payload);
        io.to(`user:${tid}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    return res.json({ success: true, message: "Đã xóa bình luận" });

  } catch (error) {
    console.error("deleteComment error:", error.message);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};