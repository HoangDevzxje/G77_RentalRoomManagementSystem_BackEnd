const Post = require("../../models/Post");

const list = async (req, res) => {
    try {
        const { limit = 20, page = 1, keyword } = req.query;

        const query = {
            status: "active",
            isDeleted: false,
            isDraft: false,
        };

        if (keyword) {
            query.$or = [
                { title: new RegExp(keyword, "i") },
                { address: new RegExp(keyword, "i") },
            ];
        }

        const total = await Post.countDocuments(query);

        const posts = await Post.find(query)
            .populate("landlordId", "fullName phone")
            .populate("buildingId", "name address")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({
            success: true,
            data: posts,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("Error listing posts:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy danh sách bài đăng!" });
    }
};

module.exports = { list };
