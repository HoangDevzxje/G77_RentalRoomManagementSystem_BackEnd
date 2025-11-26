const mongoose = require("mongoose");

const userInformationSchema = new mongoose.Schema(
  {
    fullName: { type: String },
    phoneNumber: { type: String },
    dob: { type: Date },
    gender: { type: String },
    address: { type: String },
    bankInfo: {
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      accountName: { type: String, default: "" },
      qrImageUrl: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserInformation", userInformationSchema);
