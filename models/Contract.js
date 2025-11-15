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

// Hợp đồng hiện tại
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
      type: [personSchema],
      default: [],
    },

    // Danh sách xe của người thuê (và roommate nếu muốn gom chung)
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
        min: 1, // tối thiểu 1 tháng
      },
    },

    // Term/Regulation áp dụng
    terms: {
      type: [termSnapshotSchema],
      default: [],
    },

    regulations: {
      type: [regulationSnapshotSchema],
      default: [],
    },

    // Chữ ký
    landlordSignatureUrl: { type: String },
    tenantSignatureUrl: { type: String },

    status: {
      type: String,
      enum: [
        "draft",
        "sent_to_tenant", // đã gửi cho người thuê để xem / điền / ký
        "signed_by_tenant", // người thuê đã ký
        "signed_by_landlord", // chủ trọ đã ký
        "completed", // hai bên đã ký xong
      ],
      default: "draft",
      index: true,
    },
    sentToTenantAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
