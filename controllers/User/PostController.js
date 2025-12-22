const mongoose = require("mongoose");
const Post = require("../../models/Post");
const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");

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
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + 30)

      roomList = await Room.aggregate([
        {
          $match: {
            _id: { $in: post.roomIds.map(id => new mongoose.Types.ObjectId(id)) },
            isDeleted: false
          }
        },
        {
          $lookup: {
            from: "contracts",
            localField: "_id",
            foreignField: "roomId",
            as: "contract"
          }
        },
        { $unwind: { path: "$contract", preserveNullAndEmptyArrays: true } },

        {
          $addFields: {
            activeContract: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$contract", null] },
                    { $eq: ["$contract.status", "completed"] },
                    { $ne: ["$contract.moveInConfirmedAt", null] },
                    { $ne: ["$contract.contract.endDate", null] }
                  ]
                },
                then: "$contract",
                else: null
              }
            }
          }
        },

        {
          $addFields: {
            currentContractEndDate: {
              $cond: {
                if: {
                  $and: [
                    { $ne: ["$activeContract", null] },
                    { $lte: ["$activeContract.contract.endDate", thresholdDate] }
                  ]
                },
                then: "$activeContract.contract.endDate",
                else: null
              }
            }
          }
        },
        {
          $addFields: {
            expectedAvailableDate: {
              $cond: {
                if: { $ne: ["$currentContractEndDate", null] },
                then: { $dateAdd: { startDate: "$currentContractEndDate", unit: "day", amount: 1 } },
                else: null
              }
            }
          }
        },

        {
          $project: {
            _id: 1,
            roomNumber: 1,
            name: 1,
            price: 1,
            area: 1,
            status: 1,
            images: 1,
            currentContractEndDate: 1,
            expectedAvailableDate: 1,
            isSoonAvailable: { $ne: ["$expectedAvailableDate", null] },
            isRented: { $eq: ["$status", "rented"] },
            isAvailable: { $eq: ["$status", "available"] }
          }
        }
      ]);
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

    const furnitures = await RoomFurniture.find({ roomId: room._id })
      .populate("furnitureId", "name type description image")
      .select("furnitureId quantity condition damageCount notes")
      .lean();

    res.json({
      success: true,
      data: {
        ...room,
        furnitures: furnitures.map((f) => ({
          _id: f._id,
          name: f.furnitureId?.name,
          type: f.furnitureId?.type,
          description: f.furnitureId?.description,
          image: f.furnitureId?.image,
          quantity: f.quantity,
          condition: f.condition,
          damageCount: f.damageCount,
          notes: f.notes,
        })),
      },
    });
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
