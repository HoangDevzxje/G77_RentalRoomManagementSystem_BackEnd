const mongoose = require("mongoose");

const roomFurnitureSchema = new mongoose.Schema(
  {
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
    quantity: { type: Number, default: 1, min: 0 },
    damageCount: { type: Number, default: 0, min: 0 },
    condition: {
      type: String,
      enum: ["good", "damaged", "under_repair"],
      default: "good",
    },
    notes: String,
  },
  { timestamps: true }
);

roomFurnitureSchema.index({ roomId: 1, furnitureId: 1 }, { unique: true });
roomFurnitureSchema.methods.syncConditionFromDamage = function () {
  if (this.damageCount > 0) this.condition = "damaged";
  else if (this.condition !== "under_repair") this.condition = "good";
};

module.exports = mongoose.model("RoomFurniture", roomFurnitureSchema);
