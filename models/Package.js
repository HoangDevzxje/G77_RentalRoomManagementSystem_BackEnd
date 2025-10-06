const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    roomLimit: { type: Number, required: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Package', packageSchema);