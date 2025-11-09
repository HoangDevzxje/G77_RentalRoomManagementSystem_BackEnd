const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    assignedBuildings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Building' }],
    permissions: [{ type: String }],
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

employeeSchema.index({ landlordId: 1, isDeleted: 1 });
employeeSchema.index({ accountId: 1 });

module.exports = mongoose.model('Employee', employeeSchema);