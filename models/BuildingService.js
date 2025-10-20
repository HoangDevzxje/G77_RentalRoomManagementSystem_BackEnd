const mongoose = require("mongoose");

const buildingServiceSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      enum: ["internet", "parking", "cleaning", "security", "other"],
    },

    // Nhãn hiển thị đẹp (ví dụ: "Internet cáp quang 150Mbps")
    label: { type: String, trim: true },

    description: { type: String, trim: true },

    // Cách tính phí
    chargeType: {
      type: String,
      enum: ["perRoom", "perPerson", "included", "fixed"],
      //included: đã bao gồm trong tiền thuê phòng
      //fixed: Phí cố định toàn tòa nhà
      default: "fixed",
    },

    // Đơn giá theo tháng (VND); nếu included sẽ tự set 0
    fee: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "VND" },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Không cho trùng (buildingId + name) khi chưa xóa
buildingServiceSchema.index(
  { buildingId: 1, name: 1, isDeleted: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Auto fee = 0 nếu included
buildingServiceSchema.pre("save", function (next) {
  if (this.chargeType === "included") this.fee = 0;
  next();
});

module.exports = mongoose.model("BuildingService", buildingServiceSchema);
