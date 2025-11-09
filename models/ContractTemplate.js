const mongoose = require("mongoose");

const pdfFieldMapSchema = new mongoose.Schema(
  {
    pdfField: { type: String, required: true }, // tên field trong AcroForm
    key: { type: String, required: true }, // key dữ liệu (A.name, contract.price, ...)
    type: { type: String, enum: ["text", "number", "date"], default: "text" },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const contractTemplateSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },

    // Chủ sở hữu mẫu (landlord)
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    // Tên hiển thị để landlord nhận biết
    name: {
      type: String,
      required: true,
      trim: true,
      default: "Mẫu Hợp Đồng Thuê Phòng",
    },

    /**
     * Mapping field cố định tương ứng với PDF nền.
     */
    fields: {
      type: [pdfFieldMapSchema],
      default: [
        {
          pdfField: "contractNo",
          key: "contract.no",
          type: "text",
          required: false,
        },
        {
          pdfField: "signPlace",
          key: "contract.signPlace",
          type: "text",
          required: false,
        },
        {
          pdfField: "signDate_day",
          key: "contract.signDate.day",
          type: "number",
          required: true,
        },
        {
          pdfField: "signDate_month",
          key: "contract.signDate.month",
          type: "number",
          required: true,
        },
        {
          pdfField: "signDate_year",
          key: "contract.signDate.year",
          type: "number",
          required: true,
        },

        { pdfField: "A_name", key: "A.name", type: "text", required: true },
        { pdfField: "A_dob", key: "A.dob", type: "date", required: false },
        {
          pdfField: "A_address",
          key: "A.address",
          type: "text",
          required: false,
        },
        { pdfField: "A_idNo", key: "A.idNo", type: "text", required: true },
        {
          pdfField: "A_idIssuedDate",
          key: "A.idIssuedDate",
          type: "date",
          required: false,
        },
        {
          pdfField: "A_idIssuedPlace",
          key: "A.idIssuedPlace",
          type: "text",
          required: false,
        },
        { pdfField: "A_phone", key: "A.phone", type: "text", required: false },

        { pdfField: "B_name", key: "B.name", type: "text", required: true },
        { pdfField: "B_dob", key: "B.dob", type: "date", required: false },
        {
          pdfField: "B_address",
          key: "B.address",
          type: "text",
          required: false,
        },
        { pdfField: "B_idNo", key: "B.idNo", type: "text", required: true },
        {
          pdfField: "B_idIssuedDate",
          key: "B.idIssuedDate",
          type: "date",
          required: false,
        },
        {
          pdfField: "B_idIssuedPlace",
          key: "B.idIssuedPlace",
          type: "text",
          required: false,
        },
        { pdfField: "B_phone", key: "B.phone", type: "text", required: false },

        {
          pdfField: "roomNumber",
          key: "room.number",
          type: "text",
          required: true,
        },
        {
          pdfField: "price",
          key: "contract.price",
          type: "number",
          required: true,
        },
        {
          pdfField: "deposit",
          key: "contract.deposit",
          type: "number",
          required: false,
        },
        {
          pdfField: "startDate",
          key: "contract.startDate",
          type: "date",
          required: true,
        },
        {
          pdfField: "endDate",
          key: "contract.endDate",
          type: "date",
          required: true,
        },
      ],
    },

    /**
     * Chủ trọ chọn sẵn Term/Regulation mặc định (auto add khi tạo hợp đồng, vẫn có thể override lúc tạo).
     */
    defaultTermIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Term" }],
    defaultRegulationIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Regulation" },
    ],

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

// Ràng buộc: 1 template duy nhất cho mỗi building
contractTemplateSchema.index({ buildingId: 1 }, { unique: true });

module.exports = mongoose.model("ContractTemplate", contractTemplateSchema);
