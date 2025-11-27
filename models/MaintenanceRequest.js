const mongoose = require("mongoose");

const STATUS = ["open", "in_progress", "resolved", "rejected"];

const CATEGORY = [
  "furniture",        // đồ nội thất
  "electrical",       // điện, ổ cắm, đèn
  "plumbing",         // nước, vòi, bồn rửa, toilet
  "air_conditioning", // điều hòa
  "door_lock",        // khóa cửa, chìa khóa
  "wall_ceiling",     // tường, trần nhà, sơn, nứt
  "flooring",         // sàn gỗ, gạch
  "windows",          // cửa sổ, kính
  "appliances",       // tủ lạnh, máy giặt, lò vi sóng...
  "internet_wifi",    // mạng internet
  "pest_control",     // diệt côn trùng
  "cleaning",         // vệ sinh (ổng thoát nước, bồn cầu bẩn...)
  "safety",           // bình chữa cháy, chuông báo khói
  "other"             // khác
];

const maintenanceRequestSchema = new mongoose.Schema(
  {
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
    furnitureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Furniture",
    },
    category: {
      type: String,
      enum: CATEGORY,
      required: true,
    },

    reporterAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    assigneeAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

    title: { type: String, required: true },
    description: String,
    photos: [{ url: String, note: String }],

    status: { type: String, enum: STATUS, default: "open" },

    affectedQuantity: { type: Number, default: 1, min: 1 },

    timeline: [
      {
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
        action: String, // created/updated/comment/...
        note: String,
      },
    ],

    repairCost: {
      type: Number,
      min: 0,
      default: null,
    },
    images: [{ type: String }],
    resolvedAt: Date,
  },
  { timestamps: true }
);

maintenanceRequestSchema.index({
  buildingId: 1,
  roomId: 1,
  furnitureId: 1,
  status: 1,
  createdAt: -1,
});

maintenanceRequestSchema.methods.pushEvent = function (by, action, note = "") {
  this.timeline.push({ by, action, note });
};
maintenanceRequestSchema.index({ buildingId: 1, roomId: 1, category: 1, status: 1, createdAt: -1 });
maintenanceRequestSchema.index({ reporterAccountId: 1, createdAt: -1 });
maintenanceRequestSchema.statics.isFinal = function (st) {
  return ["resolved", "rejected"].includes(st);
};

module.exports = mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
