const mongoose = require("mongoose");
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");

const list = async (req, res) => {
  try {
    const { buildingId } = req.query;
    const filter = {};
    if (buildingId) filter.buildingId = buildingId;
    const data = await Floor.find(filter).sort({ level: 1 });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await Floor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy tầng" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    const { buildingId, label, level, description } = req.body;
    const b = await Building.findById(buildingId);
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const doc = await Floor.create({ buildingId, label, level, description });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const doc = await Floor.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy tầng" });

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const { label, level, description } = req.body;
    if (label !== undefined) doc.label = label;
    if (level !== undefined) doc.level = level;
    if (description !== undefined) doc.description = description;
    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
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
      labelTemplate = "Tầng {level}",
      description,
    } = req.body;

    if (!buildingId)
      return res.status(400).json({ message: "buildingId là bắt buộc" });
    const b = await Building.findById(buildingId);
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // Xác định danh sách level cần tạo
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

    // Lấy level đã tồn tại
    const existing = await Floor.find({ buildingId }).select("level").lean();
    const existSet = new Set(existing.map((x) => x.level));

    const toInsert = levels
      .filter((lv) => !existSet.has(lv))
      .map((lv) => ({
        buildingId,
        level: lv,
        label: labelTemplate.replace("{level}", String(lv)),
        description,
      }));

    let created = [];
    if (toInsert.length) {
      created = await Floor.insertMany(toInsert, { session });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({ createdCount: created.length, created });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: e.message });
  }
};

module.exports = { list, getById, create, update, remove, quickCreate };
