const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Tên tòa nhà (Toà A, Toà B)
  address: { type: String, required: true }, // Địa chỉ
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  }, // Chủ trọ sở hữu
  description: { type: String }, // Mô tả thêm (optional)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Building", buildingSchema);
