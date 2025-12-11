const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const Furniture = require("../../models/Furniture");
const mongoose = require("mongoose");

exports.create = async (req, res) => {
  try {
    const { roomId, furnitureId } = req.body;
    if (!roomId) return res.status(400).json({ message: "roomId là bắt buộc" });
    if (!furnitureId)
      return res.status(400).json({ message: "furnitureId là bắt buộc" });

    const f = await Furniture.findById(furnitureId).lean();
    if (!f) return res.status(404).json({ message: "Không tìm thấy nội thất" });

    const room = await Room.findById(roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    // === CHECK QUYỀN ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (req.user.role === "landlord") {
      const building = await Building.findOne({
        _id: room.buildingId,
        landlordId: req.user._id,
      });
      if (!building)
        return res
          .status(403)
          .json({ message: "Không có quyền với phòng này" });
    }

    const data = await RoomFurniture.create(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { buildingId, floorId, roomId } = req.query;
    const filter = {};

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json([]);
      }
      const roomIds = await Room.find({
        buildingId: { $in: req.staff.assignedBuildingIds },
      }).distinct("_id");

      if (roomId) {
        if (!roomIds.map(String).includes(roomId)) return res.json([]);
        filter.roomId = roomId;
      } else {
        filter.roomId = { $in: roomIds };
      }
    }

    if (req.user.role === "landlord") {
      if (buildingId) {
        const building = await Building.findOne({
          _id: buildingId,
          landlordId: req.user._id,
        }).lean();
        if (!building)
          return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

        const roomIds = await Room.find({ buildingId }).distinct("_id");
        if (roomId) {
          if (!roomIds.map(String).includes(roomId)) return res.json([]);
          filter.roomId = roomId;
        } else {
          filter.roomId = { $in: roomIds };
        }
      } else {
        if (roomId) filter.roomId = roomId;
      }
    }

    if (roomId && !filter.roomId) {
      if (!mongoose.isValidObjectId(roomId))
        return res.status(400).json({ message: "roomId không hợp lệ" });
      filter.roomId = roomId;
    }

    if (floorId) {
      if (!mongoose.isValidObjectId(floorId))
        return res.status(400).json({ message: "floorId không hợp lệ" });
      const roomIdsInFloor = await Room.find({ floorId }).distinct("_id");

      if (filter.roomId) {
        if (
          typeof filter.roomId === "string" ||
          filter.roomId instanceof mongoose.Types.ObjectId
        ) {
          if (!roomIdsInFloor.map(String).includes(String(filter.roomId)))
            return res.json([]);
        } else if (filter.roomId.$in) {
          const intersection = filter.roomId.$in.filter((id) =>
            roomIdsInFloor.map(String).includes(String(id))
          );
          if (!intersection.length) return res.json([]);
          filter.roomId = { $in: intersection };
        }
      } else {
        filter.roomId = { $in: roomIdsInFloor };
      }
    }

    // --- QUERY ---
    const list = await RoomFurniture.find(filter)
      .populate({
        path: "roomId",
        select: "roomNumber area maxTenants buildingId floorId",
        populate: [
          { path: "buildingId", select: "name address" },
          { path: "floorId", select: "name level" },
        ],
      })
      .populate("furnitureId", "name price category image")
      .sort({ createdAt: -1 })
      .lean();
    const cleanList = list.filter((item) => item.roomId && item.furnitureId);

    res.json(cleanList);
  } catch (err) {
    console.error("[RoomFurniture] Lỗi getAll:", err.message);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

exports.getOne = async (req, res) => {
  try {
    const item = await RoomFurniture.findById(req.params.id)
      .populate({
        path: "roomId",
        select: "roomNumber area maxTenants buildingId floorId",
        populate: [
          { path: "buildingId", select: "name address" },
          { path: "floorId", select: "name level" },
        ],
      })
      .populate("furnitureId", "name price category image");

    if (!item) return res.status(404).json({ message: "Không tìm thấy" });

    const room = item.roomId;
    if (!room)
      return res.status(404).json({ message: "Phòng liên kết không tồn tại" });

    // === CHECK QUYỀN STAFF ===
    if (req.user.role === "staff") {
      const bId = room.buildingId?._id || room.buildingId;
      if (!req.staff?.assignedBuildingIds.includes(String(bId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const doc = await RoomFurniture.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const room = await Room.findById(doc.roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Phòng không tồn tại" });

    // === CHECK QUYỀN ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (req.user.role === "landlord") {
      const building = await Building.findOne({
        _id: room.buildingId,
        landlordId: req.user._id,
      });
      if (!building) return res.status(403).json({ message: "Không có quyền" });
    }

    const updated = await RoomFurniture.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await RoomFurniture.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy" });

    const room = await Room.findById(doc.roomId).select("buildingId").lean();
    if (!room) return res.status(404).json({ message: "Phòng không tồn tại" });

    // === CHECK QUYỀN ===
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(room.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    } else if (req.user.role === "landlord") {
      const building = await Building.findOne({
        _id: room.buildingId,
        landlordId: req.user._id,
      });
      if (!building) return res.status(403).json({ message: "Không có quyền" });
    }

    await RoomFurniture.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
