const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Floor = require("../../models/Floor");
const Room = require("../../models/Room");
const { getDeviceStatus } = require("../../configs/tuyaClient");
const Contract = require("../../models/Contract");

async function getLaundryStatusForFloor(floorId) {
  const floor = await Floor.findById(floorId).lean();
  if (!floor || floor.isDeleted) {
    throw new Error("NOT_FOUND_FLOOR");
  }

  const devices = floor.laundryDevices || [];
  if (!devices.length) {
    return {
      floorId,
      devices: [],
      message: "Tầng này chưa cấu hình thiết bị giặt sấy",
    };
  }

  const checkDevice = async (device) => {
    try {
      const statusList = await getDeviceStatus(device.tuyaDeviceId);
      let power = 0;
      let switchOn = false;

      statusList.forEach((item) => {
        if (item.code === "cur_power") power = item.value || 0;
        if (item.code === "switch_1") switchOn = !!item.value;
      });

      let status = "idle";
      if (switchOn && power > 3) status = "running";

      return {
        _id: device._id,
        name: device.name,
        type: device.type,
        tuyaDeviceId: device.tuyaDeviceId,
        status,
        power,
      };
    } catch (err) {
      console.error(
        "Check Tuya device error:",
        device.tuyaDeviceId,
        err.message
      );
      return {
        _id: device._id,
        name: device.name,
        type: device.type,
        tuyaDeviceId: device.tuyaDeviceId,
        status: "unknown",
        power: 0,
      };
    }
  };

  const results = await Promise.all(devices.map(checkDevice));

  return {
    floorId,
    devices: results,
  };
}
function parsePositiveInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const list = async (req, res) => {
  try {
    const {
      buildingId,
      page = 1,
      limit = 20,
      includeDeleted = "false",
      status,
    } = req.query;

    if (!buildingId)
      return res.status(400).json({ message: "Thiếu buildingId" });
    if (!mongoose.Types.ObjectId.isValid(buildingId))
      return res.status(400).json({ message: "buildingId không hợp lệ" });

    const allowIncludeDeleted =
      includeDeleted === "true" && req.user?.role === "admin";

    const b = await Building.findById(buildingId)
      .select("_id landlordId isDeleted status")
      .lean();
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (b.isDeleted && !allowIncludeDeleted)
      return res.status(410).json({ message: "Tòa nhà đã bị xóa" });

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    } else if (req.user.role === "resident") {
      const allowed =
        Array.isArray(req.user.memberOfBuildingIds) &&
        req.user.memberOfBuildingIds.map(String).includes(String(b._id));
      if (!allowed) return res.status(403).json({ message: "Không có quyền" });
    }

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20);

    const filter = { buildingId: b._id };
    if (status === "active" || status === "inactive") filter.status = status;
    if (!allowIncludeDeleted) filter.isDeleted = false;

    const [data, total] = await Promise.all([
      Floor.find(filter)
        .sort({ level: 1, _id: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Floor.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    res.json({
      data,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      includeDeleted: allowIncludeDeleted,
    });
  } catch (e) {
    res.status(500).json({ message: e.message || "Lỗi máy chủ" });
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeDeleted = "false" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "floorId không hợp lệ" });

    const allowIncludeDeleted =
      includeDeleted === "true" && req.user?.role === "admin";

    const f = await Floor.findById(id).lean();
    if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
    if (f.isDeleted && !allowIncludeDeleted)
      return res.status(410).json({ message: "Tầng đã bị xóa" });

    const b = await Building.findById(f.buildingId)
      .select("_id landlordId isDeleted status")
      .lean();
    if (!b) return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (b.isDeleted && !allowIncludeDeleted)
      return res.status(410).json({ message: "Tòa nhà đã bị xóa" });

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(b._id))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    } else if (req.user.role === "resident") {
      const allowed =
        Array.isArray(req.user.memberOfBuildingIds) &&
        req.user.memberOfBuildingIds.map(String).includes(String(b._id));
      if (!allowed) return res.status(403).json({ message: "Không có quyền" });
    }

    res.json(f);
  } catch (e) {
    res.status(500).json({ message: e.message || "Lỗi máy chủ" });
  }
};

const create = async (req, res) => {
  try {
    const { buildingId, level, description } = req.body;

    if (!buildingId || level === undefined || level === null) {
      return res.status(400).json({ message: "Thiếu buildingId hoặc level" });
    }
    if (!Number.isInteger(Number(level))) {
      return res.status(400).json({ message: "level phải là số nguyên" });
    }

    const b = await Building.findById(buildingId).select(
      "landlordId isDeleted status"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (b.status === "inactive") {
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    }
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền với tòa nhà này" });
    }
    const doc = await Floor.create({
      buildingId,
      level: Number(level),
      description: description || "",
    });

    res.status(201).json(doc);
  } catch (e) {
    if (e.code === 11000) {
      return res
        .status(409)
        .json({ message: "Trùng tầng (unique {buildingId, level})" });
    }
    res.status(500).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Thiệu id" });

    const f = await Floor.findById(id);
    if (!f || f.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tầng" });

    const b = await Building.findById(f.buildingId).select(
      "landlordId isDeleted status"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });

    if (b.status === "inactive") {
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    }
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(f.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền với tòa nhà này" });
    }
    const payload = {};
    if (req.body.description !== undefined)
      payload.description = req.body.description;
    if (req.body.level !== undefined) {
      const newLevel = Number(req.body.level);
      if (!Number.isInteger(newLevel)) {
        return res.status(400).json({ message: "level phải là số nguyên" });
      }
      payload.level = newLevel;
    }

    if (Object.keys(payload).length === 0) {
      return res
        .status(400)
        .json({ message: "Không có trường nào để cập nhật" });
    }

    const updated = await Floor.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: payload },
      { new: true, runValidators: true }
    );

    res.json(updated);
  } catch (e) {
    if (e.code === 11000) {
      return res
        .status(409)
        .json({ message: "Trùng tầng (unique {buildingId, level})" });
    }
    res.status(500).json({ message: e.message });
  }
};

const softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const f = await Floor.findById(id).select("buildingId isDeleted");
    if (!f || f.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tầng" });

    const b = await Building.findById(f.buildingId).select(
      "landlordId isDeleted"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(f.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền với tòa nhà này" });
    }

    if (force === "true" && req.user.role === "admin") {
      await Promise.all([
        Room.deleteMany({ floorId: id }),
        Floor.deleteOne({ _id: id }),
      ]);
      return res.json({
        message: "Đã xóa vĩnh viễn tầng và các phòng thuộc tầng",
      });
    }

    // Soft delete + cascade mềm các phòng
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const now = new Date();
      await Floor.updateOne(
        { _id: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await Room.updateMany(
        { floorId: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã xóa mềm tầng (cascade room)" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
const restore = async (req, res) => {
  try {
    const { id } = req.params;

    const f = await Floor.findById(id).select("buildingId isDeleted");
    if (!f || !f.isDeleted)
      return res
        .status(404)
        .json({ message: "Không tìm thấy hoặc tầng chưa bị xóa" });

    const b = await Building.findById(f.buildingId).select(
      "landlordId isDeleted"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(f.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền với tòa nhà này" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await Floor.updateOne(
        { _id: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await Room.updateMany(
        { floorId: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã khôi phục tầng (cascade room)" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Giá trị status không hợp lệ" });
    }

    const floor = await Floor.findById(id).select(
      "_id buildingId isDeleted status"
    );
    if (!floor || floor.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tầng" });
    }

    const building = await Building.findById(floor.buildingId).select(
      "_id landlordId status isDeleted"
    );
    if (!building || building.isDeleted) {
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    }

    if (status === "active" && building.status !== "active") {
      return res.status(400).json({
        message: "Không thể mở tầng khi tòa nhà đang ngưng hoạt động",
      });
    }

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(floor.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (
      req.user.role === "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền với tòa nhà này" });
    }
    if (floor.status === status) {
      return res.json({ message: "Trạng thái không thay đổi" });
    }

    if (status === "inactive") {
      const roomIds = await Room.find({
        floorId: floor._id,
        isDeleted: false,
      }).distinct("_id");

      if (roomIds.length > 0) {
        const now = new Date();

        const hasActiveContract = await Contract.exists({
          roomId: { $in: roomIds },
          status: "completed",
          isDeleted: false,
          "contract.startDate": { $lte: now },
          "contract.endDate": { $gte: now },
        });

        if (hasActiveContract) {
          return res.status(400).json({
            message:
              "Không thể ngưng tầng vì vẫn còn phòng có hợp đồng thuê còn hiệu lực",
          });
        }

        await Room.updateMany(
          { floorId: floor._id, isDeleted: false },
          { $set: { active: false } }
        );
      }
    }

    await Floor.updateOne(
      { _id: floor._id },
      { $set: { status } }
    );

    res.json({ message: "Cập nhật trạng thái tầng thành công" });
  } catch (err) {
    console.error("[updateFloorStatus]", err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
const remove = async (req, res) => {
  try {
    const doc = await Floor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy tầng" });

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(doc.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
    const roomCount = await Room.countDocuments({ floorId: doc._id });
    if (roomCount > 0)
      return res
        .status(409)
        .json({ message: "Hãy xoá/di chuyển Rooms trước khi xoá Floor" });

    await doc.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const quickCreate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      buildingId,
      fromLevel,
      toLevel,
      count,
      startLevel,

      description,
    } = req.body;
    if (!buildingId)
      return res.status(400).json({ message: "buildingId là bắt buộc" });

    const b = await Building.findById(buildingId)
      .select("landlordId isDeleted status")
      .session(session);
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa" });
    if (b.status === "inactive")
      return res.status(403).json({ message: "Tòa đang tạm dừng hoạt động" });
    const isOwner =
      req.user.role === "admin" ||
      req.user.role === "staff" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
    let levels = [];
    if (fromLevel != null && toLevel != null) {
      if (+fromLevel > +toLevel)
        return res.status(400).json({ message: "fromLevel phải <= toLevel" });
      for (let lv = +fromLevel; lv <= +toLevel; lv++) levels.push(lv);
    } else if (count != null && startLevel != null) {
      for (let i = 0; i < +count; i++) levels.push(+startLevel + i);
    } else {
      return res
        .status(400)
        .json({ message: "Cần (fromLevel,toLevel) hoặc (count,startLevel)" });
    }

    // Lấy level đã có
    const existing = await Floor.find({ buildingId, isDeleted: false })
      .select("level")
      .session(session)
      .lean();
    const existSet = new Set(existing.map((x) => x.level));
    const skippedLevels = levels.filter((lv) => existSet.has(lv));
    const toInsert = levels
      .filter((lv) => !existSet.has(lv))
      .map((lv) => ({
        buildingId,
        level: lv,

        description,
      }));

    let created = [];
    if (toInsert.length) {
      created = await Floor.insertMany(toInsert, { session, ordered: false });
    }

    await session.commitTransaction();
    session.endSession();

    if (!created.length) {
      return res.status(409).json({
        message: "Tất cả level yêu cầu đã tồn tại, không có tầng nào được tạo.",
        createdCount: 0,
        createdLevels: [],
        skippedLevels,
      });
    }

    return res.status(201).json({
      message: "Tạo nhanh tầng thành công.",
      createdCount: created.length,
      createdLevels: created.map((d) => d.level),
      skippedLevels,
    });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    // Bắt duplicate index nếu có race
    if (e.code === 11000) {
      return res.status(409).json({
        message: "Một số level bị trùng (unique index). Vui lòng thử lại.",
        error: e.message,
      });
    }
    return res.status(400).json({ message: e.message });
  }
};
async function checkManageFloorPermission(req, floor) {
  try {
    const building = await Building.findById(floor.buildingId)
      .select("landlordId isDeleted")
      .lean();

    if (!building || building.isDeleted) {
      return { ok: false, status: 404, message: "Tòa nhà không tồn tại" };
    }

    if (req.user.role === "admin") {
      return { ok: true };
    }

    if (req.user.role === "landlord") {
      if (String(building.landlordId) !== String(req.user._id)) {
        return {
          ok: false,
          status: 403,
          message: "Không có quyền với tòa này",
        };
      }
      return { ok: true };
    }

    if (req.user.role === "staff") {
      if (
        !req.staff?.assignedBuildingIds
          ?.map(String)
          .includes(String(building._id))
      ) {
        return {
          ok: false,
          status: 403,
          message: "Bạn không được quản lý tòa này",
        };
      }
      return { ok: true };
    }

    return { ok: false, status: 403, message: "Không có quyền" };
  } catch (err) {
    return { ok: false, status: 500, message: err.message };
  }
}

const getLaundryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getLaundryStatusForFloor(id);
    return res.json(data);
  } catch (err) {
    if (err.message === "NOT_FOUND_FLOOR") {
      return res.status(404).json({ message: "Không tìm thấy tầng" });
    }
    console.error("getLaundryStatus error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST /floors/:id/laundry-devices
const createLaundryDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, tuyaDeviceId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "floorId không hợp lệ" });
    }

    const floor = await Floor.findById(id);
    if (!floor || floor.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tầng" });
    }

    const perm = await checkManageFloorPermission(req, floor);
    if (!perm.ok) {
      return res.status(perm.status).json({ message: perm.message });
    }

    if (!name || !type || !tuyaDeviceId) {
      return res
        .status(400)
        .json({ message: "Thiếu name, type hoặc tuyaDeviceId" });
    }

    if (!["washer", "dryer"].includes(type)) {
      return res
        .status(400)
        .json({ message: "type phải là washer hoặc dryer" });
    }

    const newDevice = {
      name: name.trim(),
      type,
      tuyaDeviceId: tuyaDeviceId.trim(),
    };

    floor.laundryDevices.push(newDevice);
    await floor.save();

    // phần tử mới nằm ở cuối mảng
    const created = floor.laundryDevices[floor.laundryDevices.length - 1];

    return res.status(201).json({
      message: "Thêm thiết bị giặt sấy thành công",
      device: created,
    });
  } catch (e) {
    console.error("createLaundryDevice error:", e);
    return res.status(500).json({ message: e.message || "Lỗi máy chủ" });
  }
};
// PATCH /floors/:id/laundry-devices/:deviceId
const updateLaundryDevice = async (req, res) => {
  try {
    const { id, deviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "floorId không hợp lệ" });
    }

    const floor = await Floor.findById(id);
    if (!floor || floor.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tầng" });
    }

    const perm = await checkManageFloorPermission(req, floor);
    if (!perm.ok) {
      return res.status(perm.status).json({ message: perm.message });
    }

    const dev = floor.laundryDevices.id(deviceId);
    if (!dev) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị" });
    }

    const { name, type, tuyaDeviceId } = req.body || {};

    if (name !== undefined) dev.name = String(name).trim();
    if (type !== undefined) {
      if (!["washer", "dryer"].includes(type)) {
        return res
          .status(400)
          .json({ message: "type phải là washer hoặc dryer" });
      }
      dev.type = type;
    }
    if (tuyaDeviceId !== undefined) {
      dev.tuyaDeviceId = String(tuyaDeviceId).trim();
    }

    await floor.save();

    return res.json({
      message: "Cập nhật thiết bị giặt sấy thành công",
      device: dev,
    });
  } catch (e) {
    console.error("updateLaundryDevice error:", e);
    return res.status(500).json({ message: e.message || "Lỗi máy chủ" });
  }
};
// DELETE /floors/:id/laundry-devices/:deviceId
const deleteLaundryDevice = async (req, res) => {
  try {
    const { id, deviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "floorId không hợp lệ" });
    }

    const floor = await Floor.findById(id);
    if (!floor || floor.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tầng" });
    }

    const perm = await checkManageFloorPermission(req, floor);
    if (!perm.ok) {
      return res.status(perm.status).json({ message: perm.message });
    }

    const dev = floor.laundryDevices.id(deviceId);
    if (!dev) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị" });
    }

    dev.deleteOne();
    await floor.save();

    return res.json({ message: "Xoá thiết bị giặt sấy thành công" });
  } catch (e) {
    console.error("deleteLaundryDevice error:", e);
    return res.status(500).json({ message: e.message || "Lỗi máy chủ" });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  quickCreate,
  softDelete,
  restore,
  updateStatus,
  getLaundryStatus,
  createLaundryDevice,
  updateLaundryDevice,
  deleteLaundryDevice,
  getLaundryStatusForFloor,
};
