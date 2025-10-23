const Post = require("../../models/Post");
const mongoose = require("mongoose");

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
    res
      .status(500)
      .json({ message: "Lỗi hệ thống khi lấy danh sách bài đăng!" });
  }
};

const detail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID bài đăng không hợp lệ!",
      });
    }

    let post = await Post.findOne({
      _id: new mongoose.Types.ObjectId(id),
    }).lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Bài đăng không tồn tại!",
      });
    }

    if (post.landlordId) {
      const landlord = await mongoose
        .model("Account")
        .findById(post.landlordId, "fullName phone email avatar")
        .lean();
      post.landlordId = landlord;
    }

    if (post.buildingId && mongoose.Types.ObjectId.isValid(post.buildingId)) {
      try {
        const building = await mongoose
          .model("Building")
          .findById(post.buildingId)
          .select(
            "name address description eIndexType ePrice wIndexType wPrice amenities"
          )
          .lean();
        post.buildingId = building;
      } catch (buildingErr) {
        post.buildingId = null;
      }
    }

    res.json({
      success: true,
      data: post,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lấy chi tiết bài đăng!",
    });
  }
};
module.exports = { list, detail };
