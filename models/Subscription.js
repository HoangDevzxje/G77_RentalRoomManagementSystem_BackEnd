const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'pending_payment'], default: 'active' },
    paymentId: { type: String },
    transactionRef: { type: String, unique: true },
    amount: { type: Number },
    paymentMethod: { type: String, enum: ['vnpay', 'momo', 'manual'], default: 'vnpay' },
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);