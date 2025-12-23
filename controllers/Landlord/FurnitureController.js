const Furniture = require("../../models/Furniture");

exports.create = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

    const furniture = await Furniture.create({
      ...req.body,
      landlordId,
    });

    res.status(201).json(furniture);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

    const list = await Furniture.find({
      landlordId,
      isDeleted: false,
    });

    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

    const item = await Furniture.findOne({
      _id: req.params.id,
      landlordId,
      isDeleted: false,
    });

    if (!item)
      return res.status(404).json({ message: "Không tìm thấy nội thất" });

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

    const updated = await Furniture.findOneAndUpdate(
      {
        _id: req.params.id,
        landlordId,
        isDeleted: false,
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated)
      return res.status(404).json({ message: "Không tìm thấy nội thất" });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

    const deleted = await Furniture.findOneAndUpdate(
      {
        _id: req.params.id,
        landlordId,
      },
      { isDeleted: true },
      { new: true }
    );

    if (!deleted)
      return res.status(404).json({ message: "Không tìm thấy nội thất" });

    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
