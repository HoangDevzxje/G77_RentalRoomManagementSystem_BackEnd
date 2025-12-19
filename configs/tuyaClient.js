require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");

const ACCESS_ID = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;
const BASE_URL = process.env.TUYA_BASE_URL || "https://openapi-sg.iotbing.com";

const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

let cachedToken = null;
let cachedTokenExpireAt = 0;

function hmac(str) {
  return crypto
    .createHmac("sha256", ACCESS_SECRET)
    .update(str, "utf8")
    .digest("hex")
    .toUpperCase();
}

function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Tạo stringToSign theo spec mới:
 * stringToSign =
 *   METHOD + "\n" +
 *   Content-SHA256 + "\n" +
 *   Headers + "\n" +
 *   Url
 *
 * Ở đây mình không ký thêm header nào nên Headers = "".
 */
function buildStringToSign(method, urlPathWithQuery, body) {
  const upperMethod = method.toUpperCase();
  const bodyHash = body ? sha256(body) : EMPTY_BODY_SHA256;

  const headersStr = "";

  const stringToSign = [
    upperMethod,
    bodyHash,
    headersStr,
    urlPathWithQuery,
  ].join("\n");

  return stringToSign;
}

/**
 * Ký cho token API:
 * sign = HMAC-SHA256(client_id + t + stringToSign, secret).toUpperCase()
 */
function signForToken(t, method, urlPathWithQuery, body) {
  const stringToSign = buildStringToSign(method, urlPathWithQuery, body);
  const str = ACCESS_ID + t + stringToSign; // không dùng nonce cho đơn giản
  return hmac(str);
}

/**
 * Ký cho business API:
 * sign = HMAC-SHA256(client_id + access_token + t + stringToSign, secret).toUpperCase()
 */
function signForBusiness(t, accessToken, method, urlPathWithQuery, body) {
  const stringToSign = buildStringToSign(method, urlPathWithQuery, body);
  const str = ACCESS_ID + accessToken + t + stringToSign;
  return hmac(str);
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpireAt - 60 * 1000) {
    return cachedToken;
  }

  if (!ACCESS_ID || !ACCESS_SECRET) {
    throw new Error("Missing TUYA_ACCESS_ID or TUYA_ACCESS_SECRET");
  }

  const t = now.toString();
  const method = "GET";
  const urlPathWithQuery = "/v1.0/token?grant_type=1";
  const body = "";

  const sign = signForToken(t, method, urlPathWithQuery, body);

  const url = `${BASE_URL}${urlPathWithQuery}`;

  const res = await axios.get(url, {
    headers: {
      client_id: ACCESS_ID,
      t,
      sign_method: "HMAC-SHA256",
      sign,
    },
  });

  console.log("Tuya token raw response:", res.data);

  if (res.data && res.data.success && res.data.result) {
    const { access_token, expire_time } = res.data.result;
    cachedToken = access_token;
    cachedTokenExpireAt = now + expire_time * 1000;
    return access_token;
  }

  const code = res.data && res.data.code;
  const msg = res.data && res.data.msg;
  throw new Error(`Failed to get Tuya access token: code=${code}, msg=${msg}`);
}

/**
 * Gọi GET business API bất kỳ (ví dụ: /v1.0/devices/{id}/status)
 */
async function tuyaGet(path) {
  const token = await getAccessToken();
  const t = Date.now().toString();
  const method = "GET";

  const urlPathWithQuery = path;
  const body = "";

  const sign = signForBusiness(t, token, method, urlPathWithQuery, body);

  const url = `${BASE_URL}${path}`;

  const res = await axios.get(url, {
    headers: {
      client_id: ACCESS_ID,
      t,
      sign_method: "HMAC-SHA256",
      sign,
      access_token: token,
    },
  });

  if (!res.data || !res.data.success) {
    throw new Error(`Tuya GET ${path} failed: ${res.data && res.data.msg}`);
  }

  return res.data.result;
}

async function getDeviceStatus(deviceId) {
  return tuyaGet(`/v1.0/devices/${deviceId}/status`);
}

module.exports = {
  getAccessToken,
  getDeviceStatus,
};
