const mongoose = require("mongoose");

const revenueExpenditureSchema = new mongoose.Schema({
    createBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true
    },
    landlordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true
    },
    buildingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Building",
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ["revenue", "expenditure"],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    recordedAt: {
        type: Date,
        default: Date.now
    },
    images: {
        type: [String],
        default: []
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

revenueExpenditureSchema.index({ buildingId: 1, isDeleted: false });
revenueExpenditureSchema.index({ createBy: 1 });
revenueExpenditureSchema.index({ recordedAt: -1 });

module.exports = mongoose.model("RevenueExpenditures", revenueExpenditureSchema);