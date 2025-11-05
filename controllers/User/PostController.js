const mongoose = require("mongoose");
const Post = require("../../models/Post");
const Room = require("../../models/Room");

const getAllPostsByTenant = async (req, res) => {
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
      .populate({
        path: "landlordId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .populate("buildingId", "name address")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

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

const getDetailPostByTenant = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID bài đăng không hợp lệ!",
      });
    }

    const post = await Post.findOne({
      _id: new mongoose.Types.ObjectId(id),
      status: "active",
      isDeleted: false,
      isDraft: false,
    })
      .populate({
        path: "landlordId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .populate({
        path: "buildingId",
        select:
          "name address description eIndexType ePrice wIndexType wPrice amenities",
      })
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Bài đăng không tồn tại!",
      });
    }

    if (post.landlordId && post.landlordId.userInfo) {
      post.landlordId.fullName = post.landlordId.userInfo.fullName;
      post.landlordId.phoneNumber = post.landlordId.userInfo.phoneNumber;
      delete post.landlordId.userInfo;
    }

    let roomList = [];
    if (post.roomIds?.length) {
      const Room = mongoose.model("Room");
      roomList = await Room.find({
        _id: { $in: post.roomIds },
        isDeleted: false,
      })
        .select("_id name price status roomNumber")
        .lean();
    }

    res.json({
      success: true,
      data: {
        ...post,
        rooms: roomList,
      },
    });
  } catch (err) {
    console.error("Error in post detail:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lấy chi tiết bài đăng!",
    });
  }
};

const getRoomDetailByTenant = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID phòng không hợp lệ!" });
    }

    const room = await Room.findOne({
      _id: roomId,
      isDeleted: false,
    })
      .populate(
        "buildingId",
        "name address ePrice wPrice eIndexType wIndexType"
      )
      .lean();

    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy phòng!" });
    }

    res.json({ success: true, data: room });
  } catch (err) {
    console.error("Error getRoomDetail:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi lấy chi tiết phòng!",
    });
  }
};

module.exports = {
  getAllPostsByTenant,
  getDetailPostByTenant,
  getRoomDetailByTenant,
};
