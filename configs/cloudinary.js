// cloudinary.config.js
require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage động theo buildingId (nếu có), ép về webp + resize
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const folder = `rooms/${req.body?.buildingId || "misc"}`;
    // public_id an toàn: timestamp + originalname (loại ký tự lạ)
    const safeName = (file.originalname || "image")
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/g, "-");
    return {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      format: "webp",
      public_id: `${Date.now()}-${safeName}`,
      transformation: [{ width: 1280, crop: "scale" }],
      // resource_type mặc định 'image'
    };
  },
});

const uploadMultiple = multer({ storage }).array("images", 10);
const uploadSingle = multer({ storage }).single("image");

module.exports = {
  cloudinary,
  uploadMultiple,
  uploadSingle,
};
