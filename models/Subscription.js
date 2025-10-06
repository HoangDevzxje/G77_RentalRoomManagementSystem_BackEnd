const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'pending_payment'], default: 'active' },
    paymentId: { type: String },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Subscription', subscriptionSchema);