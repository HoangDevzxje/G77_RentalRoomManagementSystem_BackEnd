const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const template = fs.readFileSync(path.join(__dirname, "trialWelcomeTemplate.html"), "utf8");

const sendTrialWelcomeEmail = async ({ to, fullName, durationDays, startDate, endDate, maxRooms }) => {
    const formattedStart = startDate.toLocaleDateString("vi-VN");
    const formattedEnd = endDate.toLocaleDateString("vi-VN");

    const html = template
        .replace(/{{FULLNAME}}/g, fullName)
        .replace(/{{DURATION_DAYS}}/g, durationDays)
        .replace(/{{START_DATE}}/g, formattedStart)
        .replace(/{{END_DATE}}/g, formattedEnd)
        .replace(/{{MAX_ROOMS}}/g, maxRooms)
        .replace(/{{DASHBOARD_URL}}/g, `${process.env.CLIENT_URL}`);

    const mailOptions = {
        from: `"Rental Room" <${process.env.EMAIL_USER}>`,
        to,
        subject: `🎉 Chúc mừng ${fullName} - Gói dùng thử ${durationDays} ngày đã được kích hoạt!`,
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

module.exports = sendTrialWelcomeEmail;