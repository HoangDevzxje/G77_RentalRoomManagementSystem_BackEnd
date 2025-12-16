const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "identity");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        cb(null, UPLOAD_DIR);
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeName = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9-_]/g, "");

        cb(null, `${Date.now()}-${safeName}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
        return cb(
            new Error("Chỉ cho phép ảnh JPG / PNG / WEBP"),
            false
        );
    }

    cb(null, true);
};

const uploadIdentityLocal = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 6 * 1024 * 1024,
    },
}).fields([
    { name: "cccdFront", maxCount: 1 },
    { name: "cccdBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
]);

module.exports = { uploadIdentityLocal };
