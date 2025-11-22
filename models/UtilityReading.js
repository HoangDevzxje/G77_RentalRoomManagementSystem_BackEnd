const mongoose = require("mongoose");

const UTILITY_TYPES = ["electricity", "water"];
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

    type: {
      type: String,
      enum: UTILITY_TYPES, // 'electricity' | 'water'
      required: true,
      index: true,
    },

    // Tháng/năm dùng để nhóm kỳ tính tiền
    periodMonth: { type: Number, min: 1, max: 12, required: true, index: true },
    periodYear: { type: Number, min: 2000, required: true, index: true },

    // Ngày thực tế đọc số
    readingDate: { type: Date, default: Date.now, index: true },

    previousIndex: { type: Number, min: 0, default: 0 },
    currentIndex: { type: Number, min: 0, required: true },
    consumption: { type: Number, min: 0, default: 0 },

    unitPrice: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },

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

// Không cho trùng 1 phòng – 1 loại – 1 kỳ (khi chưa bị soft delete)
utilityReadingSchema.index(
  {
    landlordId: 1,
    roomId: 1,
    type: 1,
    periodYear: 1,
    periodMonth: 1,
    isDeleted: 1,
  },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

utilityReadingSchema.pre("validate", function (next) {
  if (this.currentIndex < this.previousIndex) {
    return next(new Error("currentIndex phải lớn hơn hoặc bằng previousIndex"));
  }
  this.consumption = this.currentIndex - this.previousIndex;
  if (this.unitPrice != null) {
    this.amount = this.consumption * this.unitPrice;
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
