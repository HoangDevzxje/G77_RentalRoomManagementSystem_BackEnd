const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
    {
        accountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
            required: true,
        },
        landlordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account",
            required: true,
        },
        assignedBuildings: [
            { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
        ],
        permissions: [{ type: String }],
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

staffSchema.index({ landlordId: 1, isDeleted: 1 });

module.exports = mongoose.model("Staff", staffSchema);
