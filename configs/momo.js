const MOMO_ENDPOINT =
  process.env.MOMO_ENDPOINT ||
  "https://test-payment.momo.vn/v2/gateway/api/create";

const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE || "MOMO";
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY || "F8BBA842ECF85";
const MOMO_SECRET_KEY =
  process.env.MOMO_SECRET_KEY || "K951B6PE1waDMi640xX08PD3vg6EkVlz";

const MOMO_REDIRECT_URL =
  process.env.MOMO_REDIRECT_URL || "http://localhost:3000/payment/momo-return";

const MOMO_IPN_URL =
  process.env.MOMO_IPN_URL || "http://localhost:9999/payment/momo/ipn";

module.exports = {
  MOMO_ENDPOINT,
  MOMO_PARTNER_CODE,
  MOMO_ACCESS_KEY,
  MOMO_SECRET_KEY,
  MOMO_REDIRECT_URL,
  MOMO_IPN_URL,
};
