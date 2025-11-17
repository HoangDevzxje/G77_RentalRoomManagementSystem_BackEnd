const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: {
        type: String,
        enum: ['pending_payment', 'upcoming', 'active', 'expired', 'cancelled'],
        default: 'pending_payment'
    },
    paymentId: { type: String },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['vnpay', 'momo', 'free'], default: 'vnpay' },
    vnp_ExpireDate: { type: Date },
    isTrial: { type: Boolean, default: false }, // đánh dấu gói dùng thử
    isRenewal: { type: Boolean, default: false },     // đánh dấu là gia hạn
    renewedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    renewedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    paymentUrl: { type: String },
}, { timestamps: true });

subscriptionSchema.index({ status: 1, endDate: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);