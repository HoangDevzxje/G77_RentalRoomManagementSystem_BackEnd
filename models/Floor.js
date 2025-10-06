const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema({
  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true,
  },
  label: { type: String, required: true }, // Tên tầng hiển thị (ví dụ: "Tầng 5")
  level: { type: Number, required: true }, // Số tầng (để sort)
  description: { type: String }, // Ghi chú: khu vực thang máy, block A,...
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Floor", floorSchema);
