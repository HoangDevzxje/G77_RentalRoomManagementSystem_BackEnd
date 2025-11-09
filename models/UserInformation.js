const mongoose = require('mongoose');

const userInformationSchema = new mongoose.Schema({
    fullName: { type: String },
    phoneNumber: { type: String },
    dob: { type: Date },
    gender: { type: String },
    address: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('UserInformation', userInformationSchema);
