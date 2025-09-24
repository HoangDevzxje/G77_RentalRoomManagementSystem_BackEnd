const mongoose = require('mongoose');

const userInformationSchema = new mongoose.Schema({
    firstName: { type: String },
    lastName: { type: String },
    phoneNumber: { type: String },
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },

    address: [
        {
            address: { type: String, required: true },
            provinceName: { type: String, required: true },
            districtName: { type: String, required: true },
            wardName: { type: String, required: true },
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('UserInformation', userInformationSchema);
