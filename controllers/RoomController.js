const mongoose = require("mongoose");
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

// helper render template
function renderRoomNumber(tpl, { block, floorLevel, seq }) {
  // hỗ trợ {block} {floor} {seq} {seq:02}
  let out = tpl.replace("{block}", block ?? "");
  out = out.replace("{floor}", floorLevel != null ? String(floorLevel) : "");
  // padding cho seq
  out = out.replace(/\{seq(?::(\d+))?\}/g, (_m, p1) => {
    const pad = p1 ? parseInt(p1, 10) : 0;
    let s = String(seq);
    return pad ? s.padStart(pad, "0") : s;
  });
  return out;
}

const quickCreate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      buildingId,
      floorId,
      floorIds,
      perFloor = 1,
      seqStart = 1,
      roomNumberTemplate = "{floor}{seq:02}",
      templateVars = {},
      defaults = {},
      skipExisting = true,
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

    // Xác định danh sách floors
    let floors = [];
    if (floorId) {
      const f = await Floor.findById(floorId);
      if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
      if (String(f.buildingId) !== String(buildingId))
        return res
          .status(400)
          .json({ message: "floorId không thuộc buildingId" });
      floors = [f];
    } else if (Array.isArray(floorIds) && floorIds.length) {
      floors = await Floor.find({ _id: { $in: floorIds }, buildingId });
      if (floors.length !== floorIds.length)
        return res.status(400).json({ message: "Có floorId không hợp lệ" });
    } else {
      return res.status(400).json({ message: "Cần floorId hoặc floorIds" });
    }

    // Tập roomNumber đã tồn tại để tránh trùng (theo building)
    const existRooms = await Room.find({ buildingId })
      .select("roomNumber")
      .lean();
    const existSet = new Set(existRooms.map((x) => x.roomNumber));

    const docs = [];
    for (const f of floors) {
      for (let i = 0; i < perFloor; i++) {
        const seq = seqStart + i;
        const roomNumber = renderRoomNumber(roomNumberTemplate, {
          block: templateVars.block,
          floorLevel: f.level,
          seq,
        });

        if (skipExisting && existSet.has(roomNumber)) continue;

        docs.push({
          buildingId,
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

    const created = docs.length ? await Room.insertMany(docs, { session }) : [];
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
