const crypto = require("crypto");
const Invoice = require("../../models/Invoice");
const { MOMO_ACCESS_KEY, MOMO_SECRET_KEY } = require("../../configs/momo");

// MoMo IPN callback
// POST /payment/momo/ipn
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
    } = req.body || {};

    // 1) Validate chữ ký
    const rawSignature =
      "accessKey=" +
      MOMO_ACCESS_KEY +
      "&amount=" +
      amount +
      "&extraData=" +
      (extraData || "") +
      "&ipnUrl=" +
      (ipnUrl || "") +
      "&orderId=" +
      (orderId || "") +
      "&orderInfo=" +
      (orderInfo || "") +
      "&partnerCode=" +
      (partnerCode || "") +
      "&redirectUrl=" +
      (redirectUrl || "") +
      "&requestId=" +
      (requestId || "") +
      "&requestType=" +
      (requestType || "");

    const expectedSignature = crypto
      .createHmac("sha256", MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("[MoMo IPN] Invalid signature", {
        orderId,
        requestId,
        transId,
      });

      return res.status(400).json({
        resultCode: 94000,
        message: "Invalid signature",
      });
    }

    // 2) Decode extraData → lấy invoiceId
    let invoiceId = null;
    try {
      if (extraData) {
        const jsonStr = Buffer.from(extraData, "base64").toString("utf8");
        const obj = JSON.parse(jsonStr);
        invoiceId = obj.invoiceId;
      }
    } catch (err) {
      console.error("[MoMo IPN] Decode extraData failed", err);
    }

    if (!invoiceId) {
      console.error("[MoMo IPN] Missing invoiceId in extraData");
      return res.status(400).json({
        resultCode: 94001,
        message: "Missing invoiceId in extraData",
      });
    }

    // 3) Tìm invoice
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      isDeleted: false,
    });

    if (!invoice) {
      console.error("[MoMo IPN] Invoice not found", { invoiceId });
      return res.status(404).json({
        resultCode: 94004,
        message: "Invoice not found",
      });
    }

    const paidAmountFromMomo = Number(amount || 0);

    // 4) Log payment trước (success/fail đều log)
    const paymentLog = {
      gateway: "momo",
      method: payType || requestType || "captureWallet",
      amount: paidAmountFromMomo,
      currency: "VND",
      status: resultCode === 0 ? "success" : "fail",
      transId: String(transId || orderId || ""),
      raw: req.body,
    };

    // Nếu chưa có mảng paymentLogs thì khởi tạo
    if (!Array.isArray(invoice.paymentLogs)) {
      invoice.paymentLogs = [];
    }
    invoice.paymentLogs.push(paymentLog);

    // 5) Nếu kết quả thanh toán thất bại → chỉ log, không đổi trạng thái invoice
    if (resultCode !== 0) {
      await invoice.save();

      console.warn("[MoMo IPN] Payment failed from gateway", {
        invoiceId,
        resultCode,
        message,
      });

      return res.json({
        resultCode: 0, // vẫn trả 0 để MoMo không retry IPN nữa
        message: "Received IPN - payment failed, logged only",
      });
    }

    // 6) Idempotent: nếu invoice đã paid → không set lại
    if (invoice.status === "paid") {
      await invoice.save(); // chỉ lưu thêm paymentLogs
      console.log("[MoMo IPN] Invoice already paid, ignore duplicate IPN", {
        invoiceId,
      });

      return res.json({
        resultCode: 0,
        message: "Invoice already paid - IPN processed before",
      });
    }

    // 7) Validate amount (có thể cho phép lệch nhẹ tùy config)
    const invoiceTotal = Number(invoice.totalAmount || 0);
    if (invoiceTotal <= 0) {
      console.error("[MoMo IPN] Invoice totalAmount invalid", {
        invoiceId,
        invoiceTotal,
      });

      // vẫn save log nhưng không set paid
      await invoice.save();

      return res.status(400).json({
        resultCode: 94002,
        message: "Invoice totalAmount invalid",
      });
    }

    if (paidAmountFromMomo !== invoiceTotal) {
      console.warn("[MoMo IPN] Amount mismatch", {
        invoiceId,
        invoiceTotal,
        paidAmountFromMomo,
      });

      // vẫn lưu log, nhưng không set paid
      await invoice.save();

      return res.status(400).json({
        resultCode: 94003,
        message: "Paid amount mismatch invoice totalAmount",
      });
    }

    // 8) Cập nhật invoice thành paid
    invoice.status = "paid";
    invoice.paidAt = new Date();
    invoice.paidAmount = paidAmountFromMomo;
    invoice.paymentMethod = "online_gateway"; // map với enum trong Invoice
    invoice.paymentRef = String(transId || orderId || "");
    invoice.paymentNote = `Paid via MoMo (${payType || requestType || ""})`;

    await invoice.save();

    console.log("[MoMo IPN] Payment success - Invoice marked as paid", {
      invoiceId,
      transId,
    });

    // 9) Trả về cho MoMo: rất quan trọng là resultCode = 0
    return res.json({
      resultCode: 0,
      message: "Confirm success",
    });
  } catch (e) {
    console.error("MoMo IPN error:", e);
    return res.status(500).json({
      resultCode: 95000,
      message: "Internal server error",
    });
  }
};
