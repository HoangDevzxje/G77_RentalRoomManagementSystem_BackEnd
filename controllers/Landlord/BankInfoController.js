const Account = require("../../models/Account");
const UserInformation = require("../../models/UserInformation");

// GET /landlords/bank-info
exports.getMyBankInfo = async (req, res) => {
  try {
    const landlordId = req.user?._id;

    // Lấy account để check role + link sang userInfo
    const account = await Account.findById(landlordId)
      .select("role userInfo")
      .lean();

    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được xem thông tin ngân hàng" });
    }

    let bankInfo = {
      bankName: "",
      accountNumber: "",
      accountName: "",
      qrImageUrl: "",
    };

    if (account.userInfo) {
      const userInfo = await UserInformation.findById(account.userInfo)
        .select("bankInfo")
        .lean();

      if (userInfo && userInfo.bankInfo) {
        bankInfo = userInfo.bankInfo;
      }
    }

    return res.json({
      message: "Lấy thông tin ngân hàng thành công",
      bankInfo,
    });
  } catch (e) {
    console.error("getMyBankInfo error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};

// PATCH /landlords/bank-info
exports.updateMyBankInfo = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { bankName, accountNumber, accountName, qrImageUrl } = req.body || {};

    const account = await Account.findById(landlordId).select("role userInfo");

    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được cập nhật thông tin ngân hàng" });
    }

    let userInfoDoc;

    // Nếu chưa có userInfo, tạo mới
    if (!account.userInfo) {
      userInfoDoc = new UserInformation({});
      await userInfoDoc.save();

      account.userInfo = userInfoDoc._id;
      await account.save();
    } else {
      userInfoDoc = await UserInformation.findById(account.userInfo);
      if (!userInfoDoc) {
        userInfoDoc = new UserInformation({});
        await userInfoDoc.save();
        account.userInfo = userInfoDoc._id;
        await account.save();
      }
    }

    if (!userInfoDoc.bankInfo) {
      userInfoDoc.bankInfo = {};
    }

    if (typeof bankName === "string") {
      userInfoDoc.bankInfo.bankName = bankName.trim();
    }
    if (typeof accountNumber === "string") {
      userInfoDoc.bankInfo.accountNumber = accountNumber.trim();
    }
    if (typeof accountName === "string") {
      userInfoDoc.bankInfo.accountName = accountName.trim();
    }
    if (typeof qrImageUrl === "string") {
      userInfoDoc.bankInfo.qrImageUrl = qrImageUrl.trim();
    }

    await userInfoDoc.save();

    return res.json({
      message: "Cập nhật thông tin ngân hàng thành công",
      bankInfo: userInfoDoc.bankInfo,
    });
  } catch (e) {
    console.error("updateMyBankInfo error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};

exports.uploadBankQr = async (req, res) => {
  try {
    const landlordId = req.user?._id;

    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "Không nhận được file ảnh QR" });
    }

    const qrUrl = req.file.path;

    const account = await Account.findById(landlordId).select("role userInfo");
    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được cập nhật QR ngân hàng" });
    }

    let userInfoDoc;

    if (!account.userInfo) {
      userInfoDoc = new UserInformation({});
      await userInfoDoc.save();

      account.userInfo = userInfoDoc._id;
      await account.save();
    } else {
      userInfoDoc = await UserInformation.findById(account.userInfo);
      if (!userInfoDoc) {
        userInfoDoc = new UserInformation({});
        await userInfoDoc.save();
        account.userInfo = userInfoDoc._id;
        await account.save();
      }
    }

    if (!userInfoDoc.bankInfo) {
      userInfoDoc.bankInfo = {};
    }

    userInfoDoc.bankInfo.qrImageUrl = qrUrl;
    await userInfoDoc.save();

    return res.json({
      message: "Upload QR thành công",
      bankInfo: userInfoDoc.bankInfo,
    });
  } catch (e) {
    console.error("uploadBankQr error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
