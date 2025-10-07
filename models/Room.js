const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
      index: true,
    },
    roomNumber: { type: String, required: true, trim: true }, // "A501", "B201"...
    area: Number,
    price: { type: Number, required: true },
    maxTenants: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ["available", "rented", "maintenance"],
      default: "available",
      index: true,
    },
    description: String,
  },
  { timestamps: true }
);

// tránh trùng số phòng trong cùng 1 tòa
roomSchema.index({ buildingId: 1, roomNumber: 1 }, { unique: true });

// Validator: floorId phải thuộc đúng buildingId
roomSchema.pre("validate", async function (next) {
  try {
    if (!this.isModified("floorId") && !this.isModified("buildingId"))
      return next();
    const Floor = this.model("Floor");
    const f = await Floor.findById(this.floorId).select("buildingId").lean();
    if (!f) return next(new Error("floorId không tồn tại"));
    if (String(f.buildingId) !== String(this.buildingId)) {
      return next(new Error("floorId không thuộc buildingId đã chọn"));
    }
    next();
  } catch (err) {
    next(err);
  }
});

roomSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = mongoose.model("Room", roomSchema);
