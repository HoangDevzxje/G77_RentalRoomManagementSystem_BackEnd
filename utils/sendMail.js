const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const templatePath = path.join(process.cwd(), "utils", "otpTemplate.html");
const emailTemplate = fs.readFileSync(templatePath, "utf8");

const sendEmail = async (email, otp, type) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        let emailHtml = emailTemplate.replace("{{OTP}}", otp);
        if (type === "register") {
            emailHtml = emailHtml.replace("{{TITLE}}", "Xác nhận đăng ký tài khoản");
        }
        else if (type === "reset-password") {
            emailHtml = emailHtml.replace("{{TITLE}}", "Xác nhận đặt lại mật khẩu");
        }
        const mailOptions = {
            from: `"Rental Room Management System " <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "🔐 Xác nhận đăng ký - Mã OTP của bạn",
            html: emailHtml,
        };


        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.log("Lỗi khi gửi email:", error);
    }
};

module.exports = sendEmail;