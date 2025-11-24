const crypto = require("crypto");
const Invoice = require("../../models/Invoice");
const { MOMO_ACCESS_KEY, MOMO_SECRET_KEY } = require("../../configs/momo");

exports.momoIpn = async (req, res) => {
  try {
    const {
      partnerCode,
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature,
      ipnUrl,
      redirectUrl,
      requestType,
    } = req.body;

    const rawSignature =
      "accessKey=" +
      MOMO_ACCESS_KEY +
      "&amount=" +
      amount +
      "&extraData=" +
      extraData +
      "&ipnUrl=" +
      ipnUrl +
      "&orderId=" +
      orderId +
      "&orderInfo=" +
      orderInfo +
      "&partnerCode=" +
      partnerCode +
      "&redirectUrl=" +
      redirectUrl +
      "&requestId=" +
      requestId +
      "&requestType=" +
      requestType;

    const expectedSignature = crypto
      .createHmac("sha256", MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("MoMo IPN - invalid signature");
      return res.status(400).json({
        resultCode: 94000,
        message: "Invalid signature",
      });
    }

    // ... phần decode extraData, tìm invoice, log payment, update status như mình đã viết ...
  } catch (e) {
    console.error("MoMo IPN error:", e);
    return res.status(500).json({
      resultCode: 95000,
      message: "Internal server error",
    });
  }
};
