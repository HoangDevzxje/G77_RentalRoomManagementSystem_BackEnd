const RoomFurniture = require("../../models/RoomFurniture");
const Room = require("../../models/Room");
const Building = require("../../models/Building");

// Tạo mới
exports.create = async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "roomId là bắt buộc" });

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

    if (roomId) filter.roomId = roomId;

    let query = RoomFurniture.find(filter)
      .populate({
        path: "roomId",
        populate: [
          { path: "buildingId", select: "name address" },
          { path: "floorId", select: "name level" },
        ],
      })
      .populate("furnitureId");

    const list = await query;

    const filtered = list.filter((item) => {
      const r = item.roomId;
      if (!r) return false;
      if (buildingId && String(r.buildingId?._id) !== buildingId) return false;
      if (floorId && String(r.floorId?._id) !== floorId) return false;
      return true;
    });

    if (req.user.role === "staff") {
      const allowedBuildingIds = req.staff.assignedBuildingIds.map(String);
      const staffFiltered = filtered.filter(item =>
        item.roomId?.buildingId && allowedBuildingIds.includes(String(item.roomId.buildingId._id))
      );
      return res.json(staffFiltered);
    }
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
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