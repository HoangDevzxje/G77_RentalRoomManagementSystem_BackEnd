// controllers/RoomController.js
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");

const list = async (req, res) => {
  try {
    const { buildingId, floorId, status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (buildingId) filter.buildingId = buildingId;
    if (floorId) filter.floorId = floorId;
    if (status) filter.status = status;
    if (q) filter.roomNumber = { $regex: q, $options: "i" };

    if (req.user.role === "landlord") {
      const blds = await Building.find({ landlordId: req.user._id }).select(
        "_id"
      );
      const ids = blds.map((b) => b._id);
      filter.buildingId = filter.buildingId || { $in: ids };
    }

    const data = await Room.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);
    const total = await Room.countDocuments(filter);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    const {
      buildingId,
      floorId,
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
    } = req.body;
    const [b, f] = await Promise.all([
      Building.findById(buildingId),
      Floor.findById(floorId),
    ]);
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
    if (String(f.buildingId) !== String(b._id)) {
      return res
        .status(400)
        .json({ message: "floorId không thuộc buildingId đã chọn" });
    }

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const doc = await Room.create({
      buildingId,
      floorId,
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const {
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
      floorId,
    } = req.body;

    if (floorId) {
      const f = await Floor.findById(floorId);
      if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
      if (String(f.buildingId) !== String(doc.buildingId)) {
        return res
          .status(400)
          .json({ message: "Tầng mới không thuộc cùng tòa nhà" });
      }
      doc.floorId = floorId;
    }

    if (roomNumber !== undefined) doc.roomNumber = roomNumber;
    if (area !== undefined) doc.area = area;
    if (price !== undefined) doc.price = price;
    if (maxTenants !== undefined) doc.maxTenants = maxTenants;
    if (status !== undefined) doc.status = status;
    if (description !== undefined) doc.description = description;

    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const remove = async (req, res) => {
  try {
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    await doc.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

module.exports = { list, getById, create, update, remove };
