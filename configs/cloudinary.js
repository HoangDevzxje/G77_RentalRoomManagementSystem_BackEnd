require("dotenv").config(); // Load biến môi trường từ .env

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// 1. Cấu hình cloudinary với biến môi trường
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Cấu hình storage cho multer sử dụng Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "books", // thư mục Cloudinary (có thể thay đổi)
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, crop: "scale" }], // Resize về 800px
  },
});

// 3. Tạo middleware multer dùng cho upload nhiều file
const uploadMultiple = multer({ storage }).array("images", 5); // tối đa 5 ảnh, field name là 'images'

// Nếu muốn upload 1 ảnh:
const uploadSingle = multer({ storage }).single("image");

module.exports = {
  cloudinary,
  uploadMultiple,
  uploadSingle,
};
