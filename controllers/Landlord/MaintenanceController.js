const MaintenanceRequest = require("../../models/MaintenanceRequest");
const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");

const isAdmin = (u) => u?.role === "admin";
const isLandlord = (u) => u?.role === "landlord";
const isResident = (u) => u?.role === "resident";

const isFinal = (st) => ["resolved", "rejected"].includes(st);

// Danh sách phiếu
exports.listRequests = async (req, res) => {
  try {
    const {
      buildingId,
      roomId,
      furnitureId,
      status,
      priority,
      q,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};
    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (furnitureId) filter.furnitureId = furnitureId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      MaintenanceRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("roomId furnitureId reporterAccountId assigneeAccountId"),
      MaintenanceRequest.countDocuments(filter),
    ]);

    return res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi lấy danh sách" });
  }
};

// Chi tiết phiếu
exports.getRequest = async (req, res) => {
  try {
    const doc = await MaintenanceRequest.findById(req.params.id).populate(
      "roomId furnitureId reporterAccountId assigneeAccountId"
    );

    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });
    // TODO: kiểm tra quyền xem theo vai trò
    return res.json({ data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi lấy chi tiết" });
  }
};

// Cập nhật phiếu (trạng thái, assign, lịch, chi phí, ghi chú)
exports.updateRequest = async (req, res) => {
  try {
    const {
      status,
      assigneeAccountId,
      scheduledAt,
      estimatedCost,
      actualCost,
      note,
    } = req.body;

    const doc = await MaintenanceRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const prevStatus = doc.status;
    const isAssignee =
      doc.assigneeAccountId &&
      String(doc.assigneeAccountId) === String(req.user._id);
    if (!(isAdmin(req.user) || isLandlord(req.user) || isAssignee)) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (status) {
      doc.status = status;
      if (status === "resolved") doc.resolvedAt = new Date();
      if (status !== "resolved") doc.resolvedAt = undefined;
    }
    if (assigneeAccountId) doc.assigneeAccountId = assigneeAccountId;
    if (scheduledAt) doc.scheduledAt = new Date(scheduledAt);
    if (estimatedCost != null) doc.estimatedCost = estimatedCost;
    if (actualCost != null) doc.actualCost = actualCost;

    doc.pushEvent(req.user._id, "updated", note || "Cập nhật yêu cầu");
    await doc.save();

    // Đồng bộ damageCount theo chuyển trạng thái
    const rf = await RoomFurniture.findOne({
      roomId: doc.roomId,
      furnitureId: doc.furnitureId,
    });
    if (rf) {
      const wasFinal = isFinal(prevStatus);
      const nowFinal = isFinal(doc.status);

      // Non-final -> Final : giảm
      if (!wasFinal && nowFinal) {
        const dec = Math.min(doc.affectedQuantity || 1, rf.damageCount || 0);
        rf.damageCount = Math.max(0, (rf.damageCount || 0) - dec);
        rf.syncConditionFromDamage();
        await rf.save();
      }

      // Final -> Non-final (reopen) : tăng lại
      if (wasFinal && !nowFinal) {
        const inc = doc.affectedQuantity || 1;
        rf.damageCount = Math.min((rf.damageCount || 0) + inc, rf.quantity);
        rf.syncConditionFromDamage();
        await rf.save();
      }
    }

    return res.json({ message: "Đã cập nhật", data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi cập nhật" });
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
