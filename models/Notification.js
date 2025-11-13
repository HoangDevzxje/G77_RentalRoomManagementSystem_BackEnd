const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    sendFrom: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    sendTo: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    slug: { type: Date, required: true },
    status: {
        type: String,
    },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
