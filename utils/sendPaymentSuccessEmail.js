const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const template = fs.readFileSync(path.join(__dirname, "paymentSuccessTemplate.html"), "utf8");

const sendPaymentSuccessEmail = async ({
    to,
    fullName,
    action,
    packageName,
    durationDays,
    amount,
    startDate,
    endDate,
    transactionNo
}) => {
    const html = template
        .replace(/{{FULLNAME}}/g, fullName)
        .replace(/{{ACTION}}/g, action)
        .replace(/{{PACKAGE_NAME}}/g, packageName)
        .replace(/{{DURATION_DAYS}}/g, durationDays)
        .replace(/{{AMOUNT}}/g, amount.toLocaleString("vi-VN"))
        .replace(/{{START_DATE}}/g, startDate.toLocaleDateString("vi-VN"))
        .replace(/{{END_DATE}}/g, endDate.toLocaleDateString("vi-VN"))
        .replace(/{{TRANSACTION_NO}}/g, transactionNo || "N/A")
        .replace(/{{DASHBOARD_URL}}/g, `${process.env.CLIENT_URL}/dashboard`);

    const mailOptions = {
        from: `"Rental Room" <${process.env.EMAIL_USER}>`,
        to,
        subject: `Thanh toán thành công – ${action} ${packageName}`,
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

module.exports = sendPaymentSuccessEmail;