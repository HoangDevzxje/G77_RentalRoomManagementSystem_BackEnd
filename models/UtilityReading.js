const mongoose = require("mongoose");

const READING_STATUS = ["draft", "confirmed", "billed"];

const utilityReadingSchema = new mongoose.Schema(
  {
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },

    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    contractId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
      index: true,
    },

    // Kỳ tính
    periodMonth: { type: Number, min: 1, max: 12, required: true, index: true },
    periodYear: { type: Number, min: 2000, required: true, index: true },

    // Ngày thực tế đọc số (auto = lúc nhập)
    readingDate: { type: Date, default: Date.now, index: true },

    // --- Điện ---
    ePreviousIndex: { type: Number, min: 0, default: 0 },
    eCurrentIndex: { type: Number, min: 0 },
    eConsumption: { type: Number, min: 0, default: 0 },

    eUnitPrice: { type: Number, min: 0, default: 0 },
    eAmount: { type: Number, min: 0, default: 0 },

    // --- Nước ---
    wPreviousIndex: { type: Number, min: 0, default: 0 },
    wCurrentIndex: { type: Number, min: 0 },
    wConsumption: { type: Number, min: 0, default: 0 },

    wUnitPrice: { type: Number, min: 0, default: 0 },
    wAmount: { type: Number, min: 0, default: 0 },

    status: {
      type: String,
      enum: READING_STATUS,
      default: "draft",
      index: true,
    },

    note: { type: String },

    createdById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    confirmedAt: { type: Date },
    confirmedById: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
      index: true,
    },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Không cho trùng 1 phòng – 1 kỳ (khi chưa bị soft delete)
utilityReadingSchema.index(
  {
    landlordId: 1,
    roomId: 1,
    periodYear: 1,
    periodMonth: 1,
    isDeleted: 1,
  },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

utilityReadingSchema.pre("validate", function (next) {
  // Điện
  if (this.eCurrentIndex != null && this.ePreviousIndex != null) {
    if (this.eCurrentIndex < this.ePreviousIndex) {
      return next(
        new Error("eCurrentIndex phải >= ePreviousIndex (chỉ số điện kỳ trước)")
      );
    }
    this.eConsumption = this.eCurrentIndex - this.ePreviousIndex;
    if (this.eUnitPrice != null) {
      this.eAmount = this.eConsumption * this.eUnitPrice;
    }
  }

  // Nước
  if (this.wCurrentIndex != null && this.wPreviousIndex != null) {
    if (this.wCurrentIndex < this.wPreviousIndex) {
      return next(
        new Error("wCurrentIndex phải >= wPreviousIndex (chỉ số nước kỳ trước)")
      );
    }
    this.wConsumption = this.wCurrentIndex - this.wPreviousIndex;
    if (this.wUnitPrice != null) {
      this.wAmount = this.wConsumption * this.wUnitPrice;
    }
  }

  next();
});

utilityReadingSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = mongoose.model("UtilityReading", utilityReadingSchema);
