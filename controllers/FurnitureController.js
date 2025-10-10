const Furniture = require("../models/Furniture");

// Tạo mới
exports.create = async (req, res) => {
  try {
    const f = await Furniture.create(req.body);
    res.status(201).json(f);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Lấy danh sách
exports.getAll = async (req, res) => {
  try {
    const list = await Furniture.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lấy 1 nội thất
exports.getOne = async (req, res) => {
  try {
    const item = await Furniture.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Cập nhật
exports.update = async (req, res) => {
  try {
    const updated = await Furniture.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Xóa
exports.remove = async (req, res) => {
  try {
    await Furniture.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
