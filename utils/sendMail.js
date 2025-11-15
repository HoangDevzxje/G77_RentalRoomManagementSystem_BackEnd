const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const templatePath = path.join(__dirname, "otpTemplate.html"); // chú ý __dirname thay vì process.cwd()
let emailTemplate = "";

try {
    emailTemplate = fs.readFileSync(templatePath, "utf8");
} catch (err) {
    console.error("Không tìm thấy file template email:", err);
    process.exit(1);
}

const sendEmail = async (toEmail, otp, type = "register") => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS, // nên dùng App Password nếu bật 2FA
            },
        });

        let title = "";
        let subject = "";

        if (type === "register") {
            title = "Xác nhận đăng ký tài khoản";
            subject = "🔐 Mã OTP xác nhận đăng ký";
        } else if (type === "reset-password") {
            title = "Xác nhận đặt lại mật khẩu";
            subject = "🔐 Mã OTP đặt lại mật khẩu";
        } else {
            title = "Mã xác thực OTP";
            subject = "🔐 Mã OTP của bạn";
        }

        let html = emailTemplate
            .replace(/{{TITLE}}/g, title)
            .replace(/{{OTP}}/g, otp);

        const mailOptions = {
            from: `"Rental Room Management System" <${process.env.EMAIL_USER}>`,
            to: toEmail,
            subject: subject,
            html: html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email OTP đã được gửi thành công:", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("Lỗi khi gửi email OTP:", error.message);
        return { success: false, error: error.message };
    }
};

module.exports = sendEmail;