const crypto = require("crypto");


const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

if (!process.env.CCCD_ENCRYPT_KEY) {
    throw new Error("Missing CCCD_ENCRYPT_KEY in environment variables");
}

const KEY = Buffer.from(process.env.CCCD_ENCRYPT_KEY, "hex");
if (KEY.length !== 32) {
    throw new Error("CCCD_ENCRYPT_KEY must be 32 bytes (64 hex chars)");
}

function encrypt(plaintext) {
    if (!plaintext) return null;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

    const encrypted = Buffer.concat([
        cipher.update(String(plaintext), "utf8"),
        cipher.final(),
    ]);

    return {
        algo: ALGORITHM,
        iv: iv.toString("hex"),
        content: encrypted.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
    };
}

function decrypt(payload) {
    if (
        !payload ||
        !payload.iv ||
        !payload.content ||
        !payload.tag
    ) {
        return null;
    }

    try {
        const decipher = crypto.createDecipheriv(
            payload.algo || ALGORITHM,
            KEY,
            Buffer.from(payload.iv, "hex")
        );

        decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(payload.content, "hex")),
            decipher.final(),
        ]);

        return decrypted.toString("utf8");
    } catch (err) {
        return null;
    }
}


function maskCccd(cccd, visible = 4) {
    if (!cccd) return "";
    const len = cccd.length;
    return "*".repeat(len - visible) + cccd.slice(-visible);
}

module.exports = {
    encrypt,
    decrypt,
    maskCccd,
};
