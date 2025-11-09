const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    code: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    group: { type: String, required: true },
    action: { type: String, enum: ['view', 'create', 'edit', 'delete'], required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);