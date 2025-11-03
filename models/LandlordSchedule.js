const mongoose = require("mongoose");

const landlordScheduleSchema = new mongoose.Schema({
    landlordId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true,
    },
    buildingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Building",
        required: true,
    },

    defaultSlots: [
        {
            dayOfWeek: {
                type: Number,
                enum: [0, 1, 2, 3, 4, 5, 6],
                required: true,
            },
            isAvailable: { type: Boolean, default: false },
            startTime: { type: String },
            endTime: { type: String },
        },
    ],

    overrides: [
        {
            date: { type: Date, required: true },
            isAvailable: { type: Boolean, default: true },
            startTime: { type: String },
            endTime: { type: String },
            note: { type: String },
        },
    ],
}, { timestamps: true });

module.exports = mongoose.model("LandlordSchedule", landlordScheduleSchema);
