const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Tên tòa nhà (Toà A, Toà B)
  address: { type: String, required: true }, // Địa chỉ
  landlordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  }, // Chủ trọ sở hữu
  eIndexType: {
    type: String,
    enum: ["byNumber", "byPerson", "included"],
    default: "byNumber",
    description: "byNumber: theo chỉ số, byPerson: theo đầu người, included: đã bao gồm trong giá thuê"
  },
  ePrice: { type: Number, default: 0 }, // giá điện trên 1kWh hoặc 1 người

  wIndexType: {
    type: String,
    enum: ["byNumber", "byPerson", "included"],
    default: "byNumber"
  },
  wPrice: { type: Number, default: 0 }, // giá nước trên 1m3 hoặc 1 người
  description: { type: String }, // Mô tả thêm (optional)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Building", buildingSchema);
