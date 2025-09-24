const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },

    userInfo: { type: mongoose.Schema.Types.ObjectId, ref: 'UserInformation' },

    role: {
        type: String,
        enum: ["resident", "landlord", "admin"],
        default: "resident",
    },
    isActivated: { type: Boolean, default: true },

    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Account', accountSchema);
