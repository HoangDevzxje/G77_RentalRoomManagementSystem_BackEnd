const mongoose = require("mongoose");

const personSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Họ tên
    dob: { type: Date }, // Ngày sinh
    cccd: { type: String }, // CCCD / CMND
    cccdIssuedDate: { type: Date }, // Cấp ngày
    cccdIssuedPlace: { type: String }, // Nơi cấp
    permanentAddress: { type: String }, // Hộ khẩu thường trú
    phone: { type: String }, // Điện thoại
    email: { type: String }, // Email (tiện map với Account)
  },
  { _id: false }
);

const bikeSchema = new mongoose.Schema(
  {
    bikeNumber: { type: String, required: true }, // Biển số xe / mã xe
    color: { type: String },
    brand: { type: String },
  },
  { _id: true }
);

const termSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // tên điều khoản tại thời điểm ký
    description: { type: String, required: true }, // nội dung điều khoản
    order: { type: Number }, // thứ tự hiển thị
  },
  { _id: false }
);

const regulationSnapshotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // tiêu đề nội quy
    description: { type: String, required: true }, // nội dung chi tiết
    effectiveFrom: { type: Date }, // nếu muốn lưu luôn mốc hiệu lực
    order: { type: Number }, // thứ tự
  },
  { _id: false }
);

// Lịch sử gia hạn
const extensionSchema = new mongoose.Schema(
  {
    oldEndDate: { type: Date, required: true },
    newEndDate: { type: Date, required: true },
    note: { type: String },
    extendedAt: { type: Date, default: Date.now },
    extendedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    extendedByRole: {
      type: String,
      enum: ["landlord", "resident", "system"],
      default: "landlord",
    },
  },
  { _id: false }
);

// Yêu cầu gia hạn hiện tại
const renewalRequestSchema = new mongoose.Schema(
  {
    months: { type: Number, required: true }, // muốn gia hạn thêm bao nhiêu tháng
    requestedEndDate: { type: Date, required: true }, // ngày kết thúc mới dự kiến
    note: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },

    requestedAt: { type: Date, default: Date.now },
    requestedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    requestedByRole: {
      type: String,
      enum: ["resident"],
      default: "resident",
    },

    processedAt: { type: Date },
    processedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    processedByRole: {
      type: String,
      enum: ["landlord", "system"],
    },
    rejectedReason: { type: String },
  },
  { _id: false }
);

const contractSchema = new mongoose.Schema(
  {
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
      index: true, // người thuê chính
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

    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
    },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractTemplate",
    },

    // Thông tin hai bên
    A: personSchema, // Bên A – chủ nhà
    B: personSchema, // Bên B – người thuê chính

    roommates: {
      type: [personSchema], // chỉ lưu info, không link account
      default: [],
    },

    // Danh sách xe
    bikes: {
      type: [bikeSchema],
      default: [],
    },

    // Thông tin hợp đồng chung
    contract: {
      no: { type: String }, // Số HĐ
      price: { type: Number }, // Tiền thuê / tháng
      deposit: { type: Number }, // Tiền cọc
      signDate: { type: Date }, // Ngày ký
      startDate: { type: Date }, // Ngày bắt đầu thuê
      endDate: { type: Date }, // Ngày kết thúc
      signPlace: { type: String }, // Địa điểm ký
      paymentCycleMonths: {
        type: Number,
        default: 1, // 1 tháng / lần
        min: 1,
      },
    },

    // Term/Regulation snapshot
    terms: {
      type: [termSnapshotSchema],
      default: [],
    },

    regulations: {
      type: [regulationSnapshotSchema],
      default: [],
    },

    // Lịch sử gia hạn
    extensions: {
      type: [extensionSchema],
      default: [],
    },

    // Yêu cầu gia hạn hiện tại (tối đa 1)
    renewalRequest: renewalRequestSchema,

    // Chữ ký
    landlordSignatureUrl: { type: String },
    tenantSignatureUrl: { type: String },

    status: {
      type: String,
      enum: [
        "draft",
        "sent_to_tenant",
        "signed_by_tenant",
        "signed_by_landlord",
        "completed",
        "voided", // Hợp đồng bị vô hiệu (nhập sai / không sử dụng)
        "terminated", // Hợp đồng kết thúc sớm
      ],
      default: "draft",
      index: true,
    },
    sentToTenantAt: { type: Date },
    completedAt: { type: Date },

    // Đánh dấu đã confirm move in (để không cho void nữa)
    moveInConfirmedAt: { type: Date },

    // Lưu thông tin huỷ / chấm dứt
    voidReason: { type: String },
    voidedAt: { type: Date },
    terminationType: {
      type: String,
      enum: ["normal_expiry", "early_termination", null],
      default: null,
    },
    terminatedAt: { type: Date },
    terminationNote: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
