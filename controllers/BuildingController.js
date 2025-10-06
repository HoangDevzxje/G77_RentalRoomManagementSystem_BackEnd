// controllers/BuildingController.js
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");

const list = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (q) filter.name = { $regex: q, $options: "i" };
    if (req.user.role === "landlord") filter.landlordId = req.user._id;

    const data = await Building.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);
    const total = await Building.countDocuments(filter);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    const { name, address, description, landlordId } = req.body;
    const ownerId =
      req.user.role === "landlord" ? req.user._id : landlordId || req.user._id;
    const doc = await Building.create({
      name,
      address,
      description,
      landlordId: ownerId,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(doc.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const { name, address, description } = req.body;
    if (name !== undefined) doc.name = name;
    if (address !== undefined) doc.address = address;
    if (description !== undefined) doc.description = description;
    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
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

module.exports = { list, getById, create, update, remove };
