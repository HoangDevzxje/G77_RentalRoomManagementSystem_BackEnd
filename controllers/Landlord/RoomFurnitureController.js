const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const Furniture = require("../../models/Furniture");
const mongoose = require("mongoose");
// Tạo mới
exports.create = async (req, res) => {
  try {
    const { roomId, furnitureId } = req.body;
    if (!roomId) return res.status(400).json({ message: "roomId là bắt buộc" });
    if (!furnitureId) return res.status(400).json({ message: "furnitureId là bắt buộc" });
    const f = await Furniture.findById(furnitureId).lean();
    if (!f) return res.status(404).json({ message: "Không tìm thấy nội thất" });
    const room = await Room.findById(roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
    else if (req.user.role === "landlord") {
      // Landlord có thể thao tác nếu phòng thuộc tòa của họ
      const building = await Building.findOne({ _id: room.buildingId, landlordId: req.user._id });
      if (!building) return res.status(403).json({ message: "Không có quyền với phòng này" });
    }

    const data = await RoomFurniture.create(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Lấy danh sách theo phòng
exports.getAll = async (req, res) => {
  try {
    const { buildingId, floorId, roomId } = req.query;
    const filter = {};
    if (req.user.role === "staff") {

      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json([]);
      }
      const roomIds = await Room.find({
        buildingId: { $in: req.staff.assignedBuildingIds }
      }).distinct("_id");
      const furnitures = await RoomFurniture.find({
        roomId: { $in: roomIds }
      }).distinct("roomId");
      if (!furnitures.length) {
        return res.json([]);
      }

      filter.roomId = { $in: furnitures };
    }

    if (req.user.role === "landlord" && buildingId) {
      const building = await Building.findOne({
        _id: buildingId,
        landlordId: req.user._id
      }).lean();

      if (!building) {
        return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
      }

      const roomIds = await RoomFurniture.find({
        roomId: { $in: await Room.find({ buildingId }).distinct("_id") }
      }).distinct("roomId");

      if (!roomIds.length) return res.json([]);

      filter.roomId = { $in: roomIds };
    }

    if (roomId) {
      if (!mongoose.isValidObjectId(roomId)) {
        return res.status(400).json({ message: "roomId không hợp lệ" });
      }
      filter.roomId = roomId;
    }

    if (floorId) {
      if (!mongoose.isValidObjectId(floorId)) {
        return res.status(400).json({ message: "floorId không hợp lệ" });
      }

      const roomIdsInFloor = await Room.find({ floorId }).distinct("_id");
      const roomIdsWithFurniture = await RoomFurniture.find({
        roomId: { $in: roomIdsInFloor }
      }).distinct("roomId");

      if (!roomIdsWithFurniture.length) return res.json([]);

      filter.roomId = filter.roomId
        ? { $in: roomIdsWithFurniture.filter(id => filter.roomId.$in?.includes(id)) }
        : { $in: roomIdsWithFurniture };
    }

    const list = await RoomFurniture.find(filter)
      .populate({
        path: "roomId",
        select: "name",
        populate: [
          { path: "buildingId", select: "name address" },
          { path: "floorId", select: "name level" },
        ],
      })
      .populate("furnitureId", "name")
      .sort({ createdAt: -1 })
      .lean();

    if (!list.length) {
      return res.json({ message: "Không tìm thấy nội thất của phòng" });
    }

    res.json(list);

  } catch (err) {
    console.error("[RoomFurniture] Lỗi getAll:", err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

// Lấy 1
exports.getOne = async (req, res) => {
  try {
    const item = await RoomFurniture.findById(req.params.id)
      .populate({
        path: "roomId",
        populate: [
          { path: "buildingId", select: "name address" },
          { path: "floorId", select: "name level" },
        ],
      })
      .populate("furnitureId");

    if (!item) return res.status(404).json({ message: "Không tìm thấy" });

    const room = item.roomId;
    if (!room) return res.status(404).json({ message: "Phòng không tồn tại" });

    // === QUYỀN STAFF ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId?._id))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Cập nhật
exports.update = async (req, res) => {
  try {
    const doc = await RoomFurniture.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const room = await Room.findById(doc.roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Phòng không tồn tại" });

    // === QUYỀN STAFF ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
    // === QUYỀN LANDLORD ===
    else if (req.user.role === "landlord") {
      const building = await Building.findOne({ _id: room.buildingId, landlordId: req.user._id });
      if (!building) return res.status(403).json({ message: "Không có quyền" });
    }

    const updated = await RoomFurniture.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Xóa
exports.remove = async (req, res) => {
  try {
    const doc = await RoomFurniture.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const room = await Room.findById(doc.roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Phòng không tồn tại" });

    // === QUYỀN STAFF ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
    // === QUYỀN LANDLORD ===
    else if (req.user.role === "landlord") {
      const building = await Building.findOne({ _id: room.buildingId, landlordId: req.user._id });
      if (!building) return res.status(403).json({ message: "Không có quyền" });
    }

    await RoomFurniture.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};