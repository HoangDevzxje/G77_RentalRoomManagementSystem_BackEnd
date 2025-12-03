const axios = require("axios");

const verifyEmail = async (email) => {
  const apiKey = process.env.ABSTRACT_API_KEY;
  const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${email}`;

  try {
    const response = await axios.get(url);

    // Cấu trúc response của AbstractAPI
    // { deliverability: "DELIVERABLE" | "UNDELIVERABLE" | "RISKY" }
    const deliverability = response.data?.deliverability;

    if (deliverability === "DELIVERABLE") return true;

    // Cho phép "RISKY" để tránh block những email vẫn dùng được
    if (deliverability === "RISKY") return true;

    return false;
  } catch (err) {
    console.error(
      "verifyEmail API error:",
      err.response?.status,
      err.response?.data || err.message
    );

    // QUAN TRỌNG:
    // Không được throw error ra ngoài vì sẽ làm sendOtp → 500 "Lỗi hệ thống!"
    // Hãy cho pass để user vẫn nhận được OTP và đăng ký.
    return true;
  }
};

module.exports = verifyEmail;
