const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
    {
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
        landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
        buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", required: true },
        postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" }, // optional
        roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

        contactName: { type: String, required: true },
        contactPhone: { type: String, required: true },
        tenantNote: { type: String },
        landlordNote: { type: String },

        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "cancelled"],
            default: "pending",
        },

        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
