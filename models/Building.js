const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    eIndexType: {
      type: String,
      enum: ["byNumber"],
      default: "byNumber",
      description: "byNumber: theo chỉ số công tơ",
    },
    ePrice: { type: Number, default: 0 }, // giá điện trên 1kWh hoặc 1 người

    wIndexType: {
      type: String,
      enum: ["byNumber"],
      default: "byNumber",
    },
    wPrice: { type: Number, default: 0 }, // giá nước trên 1m3 hoặc 1 người
    description: { type: String }, // Mô tả thêm (optional)
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);
buildingSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

buildingSchema.index(
  { landlordId: 1, name: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
module.exports = mongoose.model("Building", buildingSchema);
