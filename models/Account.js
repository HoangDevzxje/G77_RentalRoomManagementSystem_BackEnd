const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const accountSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  userInfo: { type: mongoose.Schema.Types.ObjectId, ref: "UserInformation" },
  role: {
    type: String,
    enum: ["resident", "landlord", "admin"],
    default: "resident",
  },
  isActivated: { type: Boolean, default: true },
  accessToken: { type: String, default: null },
  refreshToken: { type: String, default: null },
}, { timestamps: true });

const Account = mongoose.model("Account", accountSchema);

const initializeAdmin = async () => {
  try {
    const adminCount = await Account.countDocuments({ role: "admin" });
    if (adminCount === 0) {
      console.log("⚙️  No admin account found. Creating default admin...");

      const hashedPassword = await bcrypt.hash("admin123", 10);
      const adminAccount = new Account({
        email: "admin@system.com",
        password: hashedPassword,
        role: "admin",
        isActivated: true,
      });

      await adminAccount.save();
      console.log("✅ Default admin account created successfully!");
    } else {
      console.log("✅ Admin account already exists.");
    }
  } catch (error) {
    console.error("❌ Error initializing admin account:", error);
  }
};

module.exports = { Account, initializeAdmin };
