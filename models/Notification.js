const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    createBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: true,
        index: true,
    },
    createByRole: {
        type: String,
        enum: ["landlord", "staff"],
        required: true,
    },

    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },

    type: {
        type: String,
        enum: ["general", "bill", "maintenance", "reminder", "event"],
        default: "general",
    },

    scope: {
        type: String,
        enum: ["all", "staff_buildings", "building", "floor", "room", "resident"],
        required: true,
    },

    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: "Building" },
    floorId: { type: mongoose.Schema.Types.ObjectId, ref: "Floor" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    residentId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    buildingIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Building" }],
    readBy: [{
        residentId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
        readAt: { type: Date, default: Date.now }
    }],

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
},
    { timestamps: true });
notificationSchema.index({ landlordId: 1, createdAt: -1 });
notificationSchema.index({ buildingId: 1 });
notificationSchema.index({ "buildingIds": 1 });
notificationSchema.index({ residentId: 1 });

notificationSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
    },
});
module.exports = mongoose.model("Notification", notificationSchema);
