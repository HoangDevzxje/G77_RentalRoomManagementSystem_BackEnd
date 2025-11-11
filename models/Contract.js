const mongoose = require("mongoose");

const contractPartySchema = new mongoose.Schema(
  {
    name: String,
    dob: Date,
    address: String,
    idNo: String,
    idIssuedDate: Date,
    idIssuedPlace: String,
    phone: String,
  },
  { _id: false }
);

const contractFieldValueSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const contractSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
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
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractTemplate",
      required: true,
    },

    // Dữ liệu hợp đồng
    A: contractPartySchema, // Bên A (chủ trọ/đại diện)
    B: contractPartySchema, // Bên B (người thuê)

    contract: {
      no: String,
      signPlace: String,
      signDate: { day: Number, month: Number, year: Number },
      price: Number,
      deposit: Number,
      startDate: Date,
      endDate: Date,
    },

    room: {
      number: String,
    },

    // Cho phép override nhanh theo key
    fieldValues: [contractFieldValueSchema],

    // Snapshot điều khoản & quy định lúc tạo (tránh lệ thuộc thay đổi template sau này)
    termIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Term" }],
    regulationIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Regulation" },
    ],

    // Chữ ký
    landlordSignatureUrl: String,
    tenantSignatureUrl: String, // nếu có ký đôi

    // Theo dõi quy trình
    status: {
      type: String,
      enum: ["draft", "ready_for_sign", "signed_by_landlord", "sent_to_tenant"],
      default: "draft",
      index: true,
    },
    sentToTenantAt: Date,
    tenantSeenAt: Date,
    pdfUrl: String, // optional
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contract", contractSchema);
