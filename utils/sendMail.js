const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const otpTemplatePath = path.join(__dirname, "otpTemplate.html");
const invoiceTemplatePath = path.join(
  __dirname,

  "invoiceTemplate.html"
);

let otpTemplate = "";
let invoiceTemplate = "";

try {
  otpTemplate = fs.readFileSync(otpTemplatePath, "utf8");
} catch (err) {
  console.error("Không tìm thấy file otpTemplate.html:", err);
}

try {
  invoiceTemplate = fs.readFileSync(invoiceTemplatePath, "utf8");
} catch (err) {
  console.error("Không tìm thấy file invoiceTemplate.html:", err);
}

/**
 * @param {string} toEmail
 * @param {*} payload
 *   - Với type = 'register' | 'reset-password' => payload là OTP (string)
 *   - Với type = 'invoice' => payload là object { tenantName, invoiceNumber, ... }
 * @param {'register'|'reset-password'|'invoice'|'generic_otp'} type
 */
const sendEmail = async (toEmail, payload, type = "register") => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App Password nếu bật 2FA
      },
    });

    let title = "";
    let subject = "";
    let html = "";

    if (type === "register") {
      title = "Xác nhận đăng ký tài khoản";
      subject = "🔐 Mã OTP xác nhận đăng ký";

      const otp = String(payload || "");
      html = otpTemplate.replace(/{{TITLE}}/g, title).replace(/{{OTP}}/g, otp);
    } else if (type === "reset-password") {
      title = "Xác nhận đặt lại mật khẩu";
      subject = "🔐 Mã OTP đặt lại mật khẩu";

      const otp = String(payload || "");
      html = otpTemplate.replace(/{{TITLE}}/g, title).replace(/{{OTP}}/g, otp);
    } else if (type === "invoice") {
      title = "Thông báo hóa đơn tiền phòng";
      subject = "🧾 Hóa đơn tiền phòng / điện nước";

      const data = payload || {};
      html = invoiceTemplate
        .replace(/{{TITLE}}/g, title)
        .replace(/{{TENANT_NAME}}/g, data.tenantName || "Anh/Chị")
        .replace(/{{INVOICE_NUMBER}}/g, data.invoiceNumber || "")
        .replace(/{{PERIOD}}/g, data.period || "")
        .replace(/{{ROOM_NUMBER}}/g, data.roomNumber || "")
        .replace(/{{TOTAL_AMOUNT}}/g, data.totalAmount || "0")
        .replace(/{{CURRENCY}}/g, data.currency || "VND")
        .replace(/{{DUE_DATE}}/g, data.dueDate || "")
        .replace(/{{NOTE}}/g, data.note || "Không có ghi chú.")
        .replace(
          /{{APP_URL}}/g,
          data.appUrl || process.env.APP_URL || "https://example.com"
        );
    } else {
      // fallback generic OTP
      title = "Mã xác thực OTP";
      subject = "🔐 Mã OTP của bạn";
      const otp = String(payload || "");
      html = otpTemplate.replace(/{{TITLE}}/g, title).replace(/{{OTP}}/g, otp);
    }

    const mailOptions = {
      from: `"Rental Room Management System" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email đã được gửi thành công:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Lỗi khi gửi email:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendEmail;
