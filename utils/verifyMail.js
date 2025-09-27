const axios = require("axios");

const verifyEmail = async (email) => {
    const apiKey = process.env.ABSTRACT_API_KEY; // Lấy API key từ AbstractAPI
    const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${email}`;

    const response = await axios.get(url);
    return response.data.deliverability === "DELIVERABLE";
};

module.exports = verifyEmail;