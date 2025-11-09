const MaintenanceRequest = require("../../models/MaintenanceRequest");
const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");

const isAdmin = (u) => u?.role === "admin";
const isLandlord = (u) => u?.role === "landlord";
const isResident = (u) => u?.role === "resident";

const isFinal = (st) => ["resolved", "rejected"].includes(st);

// Danh sách phiếu
const toInt = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

exports.listRequests = async (req, res) => {
  try {
    let {
      buildingId,
      roomId,
      furnitureId,
      status,
      priority,
      q,
      page = 1,
      limit = 10,
      sort = "-createdAt",
      includeTimeline = "false",
      scheduledFrom,
      scheduledTo,
      estCostMin, // number
      estCostMax, // number
      actCostMin, // number
      actCostMax, // number
    } = req.query;

    const filter = {};
    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (furnitureId) filter.furnitureId = furnitureId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // resident: chỉ xem phiếu thuộc phòng họ
    if (req.user?.role === "resident") {
      const roomIds = req.user?.roomIds || [];
      if (!roomIds.length) {
        return res.json({
          data: [],
          total: 0,
          page: 1,
          limit: toInt(limit, 10),
        });
      }
      filter.roomId = { $in: roomIds };
    }
    // staff: chỉ xem phiếu thuộc tòa được giao ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({ data: [], total: 0, page: 1, limit: toInt(limit, 10) });
      }
      filter.buildingId = { $in: req.staff.assignedBuildingIds };
    }
    // landlord: nếu không truyền buildingId thì auto lọc tòa thuộc landlord
    if (
      req.user?.role === "landlord" &&
      !buildingId &&
      Array.isArray(req.user.buildingIds) &&
      req.user.buildingIds.length
    ) {
      filter.buildingId = { $in: req.user.buildingIds };
    }

    // search text
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    if (scheduledFrom || scheduledTo) {
      filter.scheduledAt = {};
      if (scheduledFrom) filter.scheduledAt.$gte = new Date(scheduledFrom);
      if (scheduledTo) filter.scheduledAt.$lte = new Date(scheduledTo);
    }

    const n = (x) => (x != null && x !== "" ? Number(x) : undefined);
    const estMin = n(estCostMin),
      estMax = n(estCostMax);
    const actMin = n(actCostMin),
      actMax = n(actCostMax);
    if (estMin != null || estMax != null) {
      filter.estimatedCost = {};
      if (estMin != null) filter.estimatedCost.$gte = estMin;
      if (estMax != null) filter.estimatedCost.$lte = estMax;
    }
    if (actMin != null || actMax != null) {
      filter.actualCost = {};
      if (actMin != null) filter.actualCost.$gte = actMin;
      if (actMax != null) filter.actualCost.$lte = actMax;
    }

    page = toInt(page, 1);
    limit = Math.min(Math.max(toInt(limit, 10), 1), 100);
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
      .populate({ path: "buildingId", select: "_id name address" })
      .populate({ path: "roomId", select: "_id name code floorNumber" })
      .populate({ path: "furnitureId", select: "_id name" })
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
      .lean();

    if (String(includeTimeline) === "true") {
      baseQuery
        .populate({
          path: "timeline.by",
          select: "email role userInfo",
          populate: { path: "userInfo", select: "fullName" },
        })
        .select("+timeline");
    }

    const [data, total] = await Promise.all([
      baseQuery.exec(),
      MaintenanceRequest.countDocuments(filter),
    ]);

    for (const r of data) {
      const rep = r.reporterAccountId;
      const ass = r.assigneeAccountId;
      r.reporterName = rep?.userInfo?.fullName || rep?.email || "Unknown";
      r.assigneeName = ass?.userInfo?.fullName || ass?.email || null;

      if (String(includeTimeline) === "true" && Array.isArray(r.timeline)) {
        r.timeline = r.timeline.map((t) => ({
          ...t,
          byDisplay:
            t?.by?.userInfo?.fullName || t?.by?.email || t?.by || "Unknown",
        }));
      }
    }

    return res.json({
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      sort,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi lấy danh sách" });
  }
};
// Chi tiết phiếu
exports.getRequest = async (req, res) => {
  try {
    const doc = await MaintenanceRequest.findById(req.params.id)
      .populate("roomId furnitureId reporterAccountId assigneeAccountId")
      .populate({ path: "buildingId", select: "_id name address" })
      .populate({
        path: "timeline.by",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      });

    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(doc.buildingId._id))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
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
    if (!(isAdmin(req.user) || isLandlord(req.user) || isAssignee || req.user.role === "staff")) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(doc.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
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
      req.user.role === "staff" ||
      String(doc.reporterAccountId) === String(req.user._id) ||
      String(doc.assigneeAccountId) === String(req.user._id);

    if (!can) return res.status(403).json({ message: "Không có quyền" });

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(doc.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }

    doc.pushEvent(req.user._id, "comment", note || "");
    await doc.save();

    return res.json({ message: "Đã thêm ghi chú", data: doc });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Lỗi thêm ghi chú" });
  }
};
