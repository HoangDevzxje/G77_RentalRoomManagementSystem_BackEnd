const mongoose = require("mongoose");

const STATUS = ["open", "in_progress", "resolved", "rejected"];

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

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
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

    estimatedCost: { type: Number, min: 0 },
    actualCost: { type: Number, min: 0 },

    scheduledAt: Date,
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

maintenanceRequestSchema.statics.isFinal = function (st) {
  return ["resolved", "rejected"].includes(st);
};

module.exports = mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
