// controllers/BuildingController.js
const mongoose = require("mongoose");
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");

const list = async (req, res) => {
  try {
    const { q, page = 1, limit = 20, includeDeleted = "false" } = req.query;
    const filter = {};
    if (includeDeleted !== "true") filter.isDeleted = false;
    if (q) filter.name = { $regex: q, $options: "i" };
    if (req.user.role === "landlord") filter.landlordId = req.user._id;

    const data = await Building.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .populate({
        path: "landlordId",
        select: "email role userInfo fullName",
        populate: { path: "userInfo", select: "fullName phone" },
      })
      .lean(); // để trả về object thuần, dễ map

    // Tuỳ ý: flatten thông tin landlord cho FE dễ dùng
    const items = data.map((b) => ({
      ...b,
      landlord: {
        id: b.landlordId?._id,
        email: b.landlordId?.email,
        role: b.landlordId?.role,
        fullName: b.landlordId?.userInfo?.fullName,
        phone: b.landlordId?.userInfo?.phone,
      },
    }));

    const total = await Building.countDocuments(filter);
    res.json({ data: items, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id)
      .populate({
        path: "landlordId",
        select: "email role userInfo fullName",
        populate: { path: "userInfo", select: "fullName phone" },
      })
      .lean();
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    if (
      req.user.role === "landlord" &&
      String(doc.landlordId?._id) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const result = {
      ...doc,
      landlord: {
        id: doc.landlordId?._id,
        email: doc.landlordId?.email,
        role: doc.landlordId?.role,
        fullName: doc.landlordId?.userInfo?.fullName,
        phone: doc.landlordId?.userInfo?.phone,
      },
    };

    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    const {
      name,
      address,
      eIndexType,
      ePrice,
      wIndexType,
      wPrice,
      description,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Thiếu tên tòa nhà" });
    }

    if (!address) {
      return res.status(400).json({ message: "Thiếu địa chỉ tòa nhà" });
    }

    if (ePrice !== undefined && ePrice !== null) {
      if (isNaN(ePrice)) {
        return res.status(400).json({ message: "Tiền điện không hợp lệ" });
      }
      if (Number(ePrice) < 0) {
        return res.status(400).json({ message: "Tiền điện không hợp lệ" });
      }
    }

    if (wPrice !== undefined && wPrice !== null) {
      if (isNaN(wPrice)) {
        return res.status(400).json({ message: "Tiền nước không hợp lệ" });
      }
      if (Number(wPrice) < 0) {
        return res.status(400).json({ message: "Tiền nước không hợp lệ" });
      }
    }

    const building = new Building({
      name,
      address,
      eIndexType,
      ePrice,
      wIndexType,
      wPrice,
      description,
      landlordId: req.user._id,
    });

    await building.save();

    res.status(201).json({ success: true, data: building });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// helper render room number
function renderRoomNumber(tpl, { block, floorLevel, seq }) {
  const floorStr = floorLevel != null ? String(floorLevel) : "";
  let out = String(tpl);
  out = out.replace(/\{block\}/g, block ?? "");
  out = out.replace(/\{floorLevel\}/g, floorStr);
  out = out.replace(/\{floor\}/g, floorStr);
  out = out.replace(/\{seq(?::(\d+))?\}/g, (_m, p1) => {
    const pad = p1 ? parseInt(p1, 10) : 0;
    const s = String(seq ?? "");
    return pad ? s.padStart(pad, "0") : s;
  });
  return out;
}

const quickSetup = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      name,
      address,
      landlordId: landlordIdInput,
      floors,
      rooms,
      dryRun = false,
    } = req.body;

    // Xác định landlordId
    const landlordId =
      req.user.role === "landlord"
        ? req.user._id
        : landlordIdInput || req.user._id;

    // 1) Tạo Building
    const building = new Building({ name, address, landlordId });
    if (!dryRun) await building.save({ session });

    // 2) Tạo Floors
    let createdFloors = [];
    if (floors?.count && floors?.startLevel != null) {
      const levels = Array.from(
        { length: +floors.count },
        (_, i) => +floors.startLevel + i
      );
      const existing = await Floor.find({ buildingId: building._id })
        .select("level")
        .lean();
      const existSet = new Set(existing.map((x) => x.level));

      const toInsert = levels
        .filter((lv) => !existSet.has(lv))
        .map((lv) => ({
          buildingId: building._id,
          level: lv,
          description: floors.description,
        }));

      if (!dryRun && toInsert.length) {
        createdFloors = await Floor.insertMany(toInsert, { session });
      } else {
        createdFloors = toInsert.map((x) => ({
          ...x,
          _id: new mongoose.Types.ObjectId(),
        })); // giả lập khi dryRun
      }
    }

    // 3) Tạo Rooms mỗi tầng
    let createdRooms = [];
    if (rooms?.perFloor && createdFloors.length) {
      const {
        perFloor,
        seqStart = 1,
        roomNumberTemplate = "{floor}{seq:02}",
        defaults = {},
        templateVars = {},
      } = rooms;

      // tập roomNumber đã có (mới tạo building → rỗng; nhưng để an toàn)
      const existRooms = await Room.find({ buildingId: building._id })
        .select("roomNumber")
        .lean();
      const existSet = new Set(existRooms.map((x) => x.roomNumber));

      const roomDocs = [];
      for (const f of createdFloors) {
        for (let i = 0; i < perFloor; i++) {
          const seq = seqStart + i;
          const roomNumber = renderRoomNumber(roomNumberTemplate, {
            block: templateVars.block,
            floorLevel: f.level,
            seq,
          });
          if (existSet.has(roomNumber)) continue;
          roomDocs.push({
            buildingId: building._id,
            floorId: f._id,
            roomNumber,
            area: defaults.area ?? undefined,
            price: defaults.price ?? undefined,
            maxTenants: defaults.maxTenants ?? 1,
            status: defaults.status ?? "available",
            description: defaults.description,
          });
          existSet.add(roomNumber);
        }
      }
      if (!dryRun && roomDocs.length) {
        createdRooms = await Room.insertMany(roomDocs, { session });
      } else {
        createdRooms = roomDocs.map((x) => ({
          ...x,
          _id: new mongoose.Types.ObjectId(),
        })); // giả lập khi dryRun
      }
    }

    if (dryRun) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        dryRun: true,
        preview: {
          building,
          floors: createdFloors,
          rooms: createdRooms,
        },
      });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({
      message: "Tạo tòa + tầng + phòng thành công",
      building,
      floors: createdFloors,
      rooms: createdRooms,
    });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    if (e.code === 11000) {
      return res.status(409).json({
        message: "Trùng dữ liệu (unique index). Vui lòng kiểm tra.",
        error: e.message,
      });
    }
    return res.status(400).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role !== "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }
    Object.assign(building, req.body);
    await building.save();
    res.json({ success: true, data: building });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const softDelete = async (req, res) => {
  try {
    const { force } = req.query;
    const id = req.params.id;

    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (force === "true" && req.user.role === "admin") {
      await Promise.all([
        Room.deleteMany({ buildingId: id }),
        Floor.deleteMany({ buildingId: id }),
        Building.deleteOne({ _id: id }),
      ]);
      return res.json({ message: "Đã xóa vĩnh viễn (force)" });
    }

    // Soft delete + cascade mềm xuống Floor/Room
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const now = new Date();
      await Building.updateOne(
        { _id: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await Floor.updateMany(
        { buildingId: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await Room.updateMany(
        { buildingId: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã xóa mềm tòa nhà (cascade floor/room)" });
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
    const id = req.params.id;
    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || !doc.isDeleted)
      return res
        .status(404)
        .json({ message: "Không tìm thấy hoặc chưa bị xóa" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await Building.updateOne(
        { _id: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await Floor.updateMany(
        { buildingId: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await Room.updateMany(
        { buildingId: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã khôi phục tòa nhà (cascade floor/room)" });
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
    const id = req.params.id;
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Giá trị status không hợp lệ" });
    }

    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    await Building.updateOne({ _id: id }, { $set: { status } });
    res.json({ message: "Cập nhật trạng thái thành công" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const remove = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(doc.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const floorCount = await Floor.countDocuments({ buildingId: doc._id });
    const roomCount = await Room.countDocuments({ buildingId: doc._id });
    if (floorCount > 0 || roomCount > 0) {
      return res.status(409).json({
        message: "Hãy xoá/di chuyển Floors & Rooms trước khi xoá Building",
      });
    }
    await doc.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

module.exports = {
  list,
  getById,
  create,
  quickSetup,
  update,
  softDelete,
  restore,
  updateStatus,
  remove,
};
