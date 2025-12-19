const mongoose = require('mongoose');
const crypto = require('crypto');
const accountSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },

    userInfo: { type: mongoose.Schema.Types.ObjectId, ref: 'UserInformation' },

    role: {
        type: String,
        enum: ["resident", "landlord", "admin", "staff"],
        default: "resident",
    },
    isActivated: { type: Boolean, default: true },
    mustChangePassword: {
        type: Boolean,
        default: false
    },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null }
}, { timestamps: true });
accountSchema.methods.createPasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    this.passwordResetExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 giờ

    return resetToken;
};

// Xóa token sau khi dùng xong hoặc hết hạn
accountSchema.methods.clearPasswordReset = function () {
    this.passwordResetToken = undefined;
    this.passwordResetExpires = undefined;
};

// Kiểm tra xem có bắt buộc đổi mật khẩu không
accountSchema.methods.requiresPasswordChange = function () {
    return this.mustChangePassword === true;
};
module.exports = mongoose.model('Account', accountSchema);