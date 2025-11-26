const Account = require("../../models/Account");

// GET /landlords/bank-info
exports.getMyBankInfo = async (req, res) => {
  try {
    const landlordId = req.user?._id;

    const account = await Account.findById(landlordId)
      .select("role bankInfo")
      .lean();

    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được xem thông tin ngân hàng" });
    }

    const bankInfo = account.bankInfo || {
      bankName: "",
      accountNumber: "",
      accountName: "",
      qrImageUrl: "",
    };

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

    const account = await Account.findById(landlordId);

    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được cập nhật thông tin ngân hàng" });
    }

    // Đảm bảo luôn có object bankInfo
    if (!account.bankInfo) {
      account.bankInfo = {};
    }

    if (typeof bankName === "string") {
      account.bankInfo.bankName = bankName.trim();
    }
    if (typeof accountNumber === "string") {
      account.bankInfo.accountNumber = accountNumber.trim();
    }
    if (typeof accountName === "string") {
      account.bankInfo.accountName = accountName.trim();
    }
    if (typeof qrImageUrl === "string") {
      account.bankInfo.qrImageUrl = qrImageUrl.trim();
    }

    await account.save();

    return res.json({
      message: "Cập nhật thông tin ngân hàng thành công",
      bankInfo: account.bankInfo,
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
    const account = await Account.findById(landlordId);
    if (!account) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    }

    if (account.role !== "landlord") {
      return res
        .status(403)
        .json({ message: "Chỉ chủ trọ mới được cập nhật QR ngân hàng" });
    }

    if (!account.bankInfo) {
      account.bankInfo = {};
    }

    account.bankInfo.qrImageUrl = qrUrl;
    await account.save();

    return res.json({
      message: "Upload QR thành công",
      qrImageUrl: qrUrl,
      bankInfo: account.bankInfo,
    });
  } catch (e) {
    console.error("uploadBankQr error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
