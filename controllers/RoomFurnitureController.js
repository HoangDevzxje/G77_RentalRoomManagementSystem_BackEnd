const RoomFurniture = require("../models/RoomFurniture");

// Tạo mới
exports.create = async (req, res) => {
  try {
    const data = await RoomFurniture.create(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Lấy danh sách theo phòng
exports.getAll = async (req, res) => {
  try {
    const { roomId } = req.query;
    const filter = roomId ? { roomId } : {};
    const list = await RoomFurniture.find(filter).populate(
      "roomId furnitureId"
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lấy 1
exports.getOne = async (req, res) => {
  try {
    const item = await RoomFurniture.findById(req.params.id).populate(
      "roomId furnitureId"
    );
    if (!item) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Cập nhật
exports.update = async (req, res) => {
  try {
    const updated = await RoomFurniture.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Xóa
exports.remove = async (req, res) => {
  try {
    await RoomFurniture.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
