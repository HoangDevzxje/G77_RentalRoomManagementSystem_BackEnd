const mongoose = require("mongoose");

const INVOICE_STATUS = [
  "draft", // mới tạo, landlord có thể chỉnh sửa
  "sent", // đã gửi cho tenant (email / in-app)
  "paid", // đã thanh toán
  "transfer_pending",
  "overdue", // quá hạn
  "cancelled", // hủy hóa đơn
  "replaced",
];

const PAYMENT_METHODS = ["cash", "online_gateway", null];
const paymentLogSchema = new mongoose.Schema(
  {
    gateway: { type: String }, // "momo"
    method: { type: String }, // "captureWallet"
    amount: { type: Number },
    currency: { type: String, default: "VND" },
    status: { type: String }, // "success", "fail"
    transId: { type: String }, // momoTransId hoặc orderId
    raw: { type: Object }, // full payload từ MoMo
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const invoiceItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["rent", "electric", "water", "service", "other"],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String, // mô tả thêm nếu cần
    },
    quantity: {
      type: Number,
      default: 1,
      min: 0,
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Link ngược về utilityReading nếu là dòng điện/nước
    utilityReadingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UtilityReading",
    },

    // Có thể lưu thêm meta khác nếu cần sau này
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    // Liên kết cơ bản
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    tenantId: {
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
      required: true,
      index: true,
    },

    // Phân loại hóa đơn để tránh xung đột kỳ (ví dụ: hóa đơn tiền cọc vs hóa đơn tháng)
    // - periodic: hóa đơn tiền nhà/điện/nước/dịch vụ theo kỳ
    // - deposit: hóa đơn tiền cọc hợp đồng
    invoiceKind: {
      type: String,
      enum: ["periodic", "deposit"],
      default: "periodic",
      index: true,
    },

    // Kỳ tính tiền
    periodMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    periodYear: {
      type: Number,
      required: true,
      min: 2000,
    },

    // Số hóa đơn (có thể unique theo landlordId + kỳ)
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Các dòng khoản thu
    items: {
      type: [invoiceItemSchema],
      default: [],
    },

    // Tổng tiền
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lateFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "VND",
    },

    // Thời gian
    issuedAt: { type: Date },
    dueDate: { type: Date },
    sentAt: { type: Date },
    paidAt: { type: Date },
    cancelledAt: { type: Date },

    // Trạng thái
    status: {
      type: String,
      enum: INVOICE_STATUS,
      default: "draft",
      index: true,
    },

    // Thông tin thanh toán
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: null,
    },
    paymentRef: { type: String },
    paymentNote: { type: String },

    transferProofImageUrl: {
      type: String, // URL ảnh chuyển khoản (đã upload lên Cloudinary/S3...)
    },
    transferRequestedAt: {
      type: Date, // thời điểm tenant gửi yêu cầu xác nhận
    },
    // Tham chiếu email
    // Email chính sẽ gửi đến tenant.email, field này chỉ là override nếu cần
    emailToOverride: {
      type: String,
      trim: true,
    },
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", null],
      default: null,
    },
    emailSentAt: { type: Date },
    emailLastError: { type: String },

    // Log nhắc nợ
    reminders: [
      {
        channel: {
          type: String,
          enum: ["email", "sms", "in_app"],
        },
        sentAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["sent", "failed"],
          default: "sent",
        },
        note: { type: String },
      },
    ],
    history: [
      {
        action: { type: String }, // "update_sent_invoice"
        itemsDiff: { type: mongoose.Schema.Types.Mixed }, // log thay đổi item
        metaDiff: { type: mongoose.Schema.Types.Mixed }, // log note/discount/lateFee
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
        },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // Thông tin nội bộ
    note: { type: String },
    internalNote: { type: String },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    replacedAt: { type: Date, default: null },
    replacedByInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    replacementOfInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },

    // Soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Index gợi ý
invoiceSchema.index(
  { landlordId: 1, periodYear: 1, periodMonth: 1, roomId: 1 },
  { name: "idx_landlord_period_room" }
);
invoiceSchema.index(
  { tenantId: 1, status: 1, dueDate: 1 },
  { name: "idx_tenant_status_due" }
);

// Không cho phép có 2 hoá đơn định kỳ cùng phòng + cùng kỳ ở trạng thái draft/sent
invoiceSchema.index(
  { landlordId: 1, roomId: 1, periodYear: 1, periodMonth: 1, invoiceKind: 1 },
  {
    unique: true,
    name: "uniq_periodic_room_period_draft_sent",
    partialFilterExpression: {
      isDeleted: false,
      invoiceKind: "periodic",
      status: { $in: ["draft", "sent"] },
    },
  }
);
// Helper tính toán lại tổng tiền từ items
invoiceSchema.methods.recalculateTotals = function () {
  const subtotal = (this.items || []).reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );
  this.subtotal = subtotal;
  const discount = this.discountAmount || 0;
  const lateFee = this.lateFee || 0;
  this.totalAmount = Math.max(0, subtotal - discount + lateFee);
};

// STATIC: sinh số hóa đơn theo landlordId + kỳ (YYYYMM-xxx)
invoiceSchema.statics.generateInvoiceNumber = async function ({
  landlordId,
  periodMonth,
  periodYear,
}) {
  const ym =
    String(periodYear).padStart(4, "0") + String(periodMonth).padStart(2, "0");

  const count = await this.countDocuments({
    landlordId,
    periodYear,
    periodMonth,
  });

  const seq = String(count + 1).padStart(3, "0");
  return `INV-${ym}-${seq}`;
};

module.exports = mongoose.model("Invoice", invoiceSchema);
