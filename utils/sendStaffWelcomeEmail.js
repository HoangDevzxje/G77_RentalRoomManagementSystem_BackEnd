// utils/sendStaffWelcomeEmail.js
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const template = fs.readFileSync(path.join(__dirname, "staffWelcomeTemplate.html"), "utf8");

const sendStaffWelcomeEmail = async ({ to, fullName, tempPassword, loginUrl, changePasswordUrl }) => {
    const html = template
        .replace(/{{FULLNAME}}/g, fullName)
        .replace(/{{EMAIL}}/g, to)
        .replace(/{{PASSWORD}}/g, tempPassword)
        .replace(/{{CHANGE_PASSWORD_URL}}/g, changePasswordUrl);

    const mailOptions = {
        from: `"Rental Room" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Chào mừng bạn đến với Rental Room - Thông tin đăng nhập",
        html,
    };

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    await transporter.sendMail(mailOptions);
};

module.exports = sendStaffWelcomeEmail;