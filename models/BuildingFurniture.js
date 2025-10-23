const mongoose = require("mongoose");

const buildingFurnitureSchema = new mongoose.Schema(
  {
    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    furnitureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Furniture",
      required: true,
    },
    quantityPerRoom: { type: Number, default: 1, min: 0 }, // số lượng áp cho mỗi phòng
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    notes: String,
  },
  { timestamps: true }
);

buildingFurnitureSchema.index(
  { buildingId: 1, furnitureId: 1 },
  { unique: true }
);

module.exports = mongoose.model("BuildingFurniture", buildingFurnitureSchema);
