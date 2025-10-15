const mongoose = require("mongoose");

const regulationSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    title: { type: String, required: true }, // ví dụ: “Giờ ra vào”
    description: { type: String, required: true }, // nội dung chi tiết
    type: {
      type: String,
      enum: ["entry_exit", "pet_policy", "common_area", "other"],
      default: "other",
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    effectiveFrom: { type: Date },
    effectiveTo: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Regulation", regulationSchema);
