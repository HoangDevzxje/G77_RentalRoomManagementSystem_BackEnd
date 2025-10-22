const Post = require('../../models/Post');
const slugify = require('slugify');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const generateDescription = async (req, res) => {
    try {
        const { title, price, area, address } = req.body;

        if (!title || !price || !area || !address) {
            return res.status(400).json({ message: 'Thiếu thông tin cần thiết!' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
      Viết phần mô tả hấp dẫn cho bài đăng cho thuê phòng trọ:
      - Tiêu đề: ${title}
      - Giá thuê: ${price.toLocaleString('vi-VN')} VND/tháng
      - Diện tích: ${area} m²
      - Địa chỉ: ${address}

      Yêu cầu:
      - Trả kết quả ở dạng HTML có thể hiển thị trực tiếp trong trình duyệt.
      - Dùng các thẻ như <p>, <b>, <i>, <ul>, <li>, <br> để định dạng nội dung.
      - Có thể chèn emoji nhẹ nhàng (🏠, 🌇, 💡...) để làm sinh động.
      - Tuyệt đối không sinh ra script hoặc liên kết độc hại.
    `;

        const result = await model.generateContent(prompt);
        const aiDescription = result.response.text();

        res.json({ success: true, data: { aiDescription } });
    } catch (err) {
        console.error('Lỗi generateDescription:', err);
        res.status(500).json({ message: 'Lỗi khi gọi AI', error: err.message });
    }
};

const createPost = async (req, res) => {
    try {
        const { title, price, area, address, description, buildingId, isDraft } = req.body;

        if (!title || !price || !area || !address || !description) {
            return res.status(400).json({ message: 'Thiếu thông tin bài đăng!' });
        }
        const imageUrls = req.files?.map(file => file.path) || [];
        console.log("Uploaded images:", imageUrls);
        const post = new Post({
            landlordId: req.user._id,
            buildingId: buildingId || null,
            title,
            description,
            address,
            price,
            area,
            images: imageUrls,
            isDraft: !!isDraft,
            status: isDraft ? 'hidden' : 'active',
        });

        await post.save();

        res.status(201).json({ success: true, data: post });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const listByLandlord = async (req, res) => {
    try {
        const posts = await Post.find({
            landlordId: req.user._id,
            isDeleted: false,
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: posts });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


const softDelete = async (req, res) => {
    try {
        const post = await Post.findOneAndUpdate(
            { _id: req.params.id, landlordId: req.user._id },
            { isDeleted: true, status: 'hidden' },
            { new: true }
        );
        if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        res.json({ success: true, message: 'Xóa bài đăng (mềm) thành công!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


module.exports = {
    generateDescription,
    listByLandlord,
    softDelete,
    createPost
};