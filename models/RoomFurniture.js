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
    quantity: { type: Number, default: 1 },
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

module.exports = mongoose.model("RoomFurniture", roomFurnitureSchema);
