const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },

    createBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    createByRole: { type: String, enum: ["landlord", "staff", "resident", "system"], required: true },

    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },

    type: { type: String, enum: ["general", "bill", "maintenance", "reminder", "event"], default: "general" },

    target: {
        buildings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Building" }],     // nhiều tòa
        floors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Floor" }],        // nhiều tầng
        rooms: [{ type: mongoose.Schema.Types.ObjectId, ref: "Room" }],         // nhiều phòng
        residents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Account" }],     // nhiều người cụ thể
    },

    images: [{ type: String }],
    readBy: [{
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
        readAt: { type: Date, default: Date.now }
    }],
    link: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
}, { timestamps: true });

notificationSchema.index({ landlordId: 1, createdAt: -1 });
notificationSchema.index({ "target.buildings": 1 });
notificationSchema.index({ "target.rooms": 1 });
notificationSchema.index({ "target.residents": 1 });
notificationSchema.index({ "readBy.residentId": 1 });
module.exports = mongoose.model("Notification", notificationSchema);
