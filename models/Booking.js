const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building", required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },

    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },

    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },

    status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "cancelled"],
        default: "pending"
    },

    tenantNote: { type: String },
    landlordNote: { type: String },

    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
