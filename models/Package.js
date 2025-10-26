const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 1 },
    roomLimit: { type: Number, required: true, min: 1 },
    description: { type: String },
    type: {
        type: String,
        enum: ['trial', 'paid'],
        default: 'paid',
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Package', packageSchema);