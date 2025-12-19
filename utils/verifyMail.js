const axios = require("axios");

const verifyEmail = async (email) => {
  const apiKey = process.env.ABSTRACT_API_KEY;
  const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${email}`;

  try {
    const response = await axios.get(url);

    const deliverability = response.data?.deliverability;

    if (deliverability === "DELIVERABLE") return true;

    if (deliverability === "RISKY") return true;

    return false;
  } catch (err) {
    console.error(
      "verifyEmail API error:",
      err.response?.status,
      err.response?.data || err.message
    );

    return true;
  }
};

module.exports = verifyEmail;
