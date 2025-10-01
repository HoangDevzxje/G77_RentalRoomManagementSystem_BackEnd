const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  buildingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Building",
    required: true,
  },
  floorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Floor",
    required: true,
  },
  roomNumber: { type: String, required: true }, // Số phòng (vd: 501)
  area: { type: Number }, // Diện tích m2
  price: { type: Number, required: true }, // Giá thuê phòng
  maxTenants: { type: Number, default: 1 }, // Số người tối đa
  status: {
    // Trạng thái phòng
    type: String,
    enum: ["available", "rented", "maintenance"],
    default: "available",
  },
  description: { type: String }, // Ghi chú thêm (optional)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", roomSchema);
