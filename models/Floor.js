const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    level: { type: Number, required: true }, // ví dụ: 1, 2, 3...
    description: String,
  },
  { timestamps: true }
);

// mỗi tòa chỉ có 1 level cụ thể
floorSchema.index({ buildingId: 1, level: 1 }, { unique: true });

// floorSchema.index({ buildingId: 1, label: 1 }, { unique: true });

floorSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = mongoose.model("Floor", floorSchema);
