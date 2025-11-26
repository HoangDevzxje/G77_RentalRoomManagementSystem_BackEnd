const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    floorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
      index: true,
    },
    roomNumber: { type: String, required: true, trim: true }, // "A501", "B201"...
    images: [String],
    area: Number,
    price: { type: Number, required: true },

    maxTenants: { type: Number, default: 1 },
    currentContractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
      index: true,
    },
    currentTenantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
      },
    ],
    status: {
      type: String,
      enum: ["available", "rented"],
      default: "available",
      index: true,
    },

    eStart: { type: Number, default: 0, min: 0 }, // chỉ số điện bắt đầu
    wStart: { type: Number, default: 0, min: 0 }, // chỉ số nước bắt đầu
    description: String,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    active: { type: Boolean, default: true, index: true },
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
    const sess = typeof this.$session === "function" ? this.$session() : null;

    let q = Floor.findById(this.floorId).select("buildingId").lean();
    if (sess) q = q.session(sess);

    const f = await q;
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
