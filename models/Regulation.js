const mongoose = require("mongoose");

const regulationSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true }, // nội dung chi tiết

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    effectiveFrom: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Regulation", regulationSchema);
