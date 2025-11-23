const Contact = require("../../models/Contact");
const Building = require("../../models/Building");
const Room = require("../../models/Room");
const Post = require("../../models/Post");
const Notification = require("../../models/Notification");

const createContact = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const {
      buildingId,
      postId,
      roomId,
      contactName,
      contactPhone,
      tenantNote,
    } = req.body;

    if (!buildingId || !roomId || !contactName || !contactPhone)
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });

    const building = await Building.findById(buildingId);
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà!" });

    if (postId) {
      const post = await Post.findById(postId);
      if (!post)
        return res.status(404).json({ message: "Không tìm thấy bài đăng!" });

      if (post.buildingId.toString() !== buildingId.toString()) {
        return res.status(400).json({
          message: "Bài đăng không thuộc tòa nhà đã chọn!",
        });
      }
    }

    const room = await Room.findOne({ _id: roomId, buildingId });
    if (!room) {
      return res.status(400).json({
        message: "Phòng không thuộc tòa nhà này!",
      });
    }

    const landlordId = building.landlordId;

    const request = await Contact.create({
      tenantId,
      landlordId,
      buildingId,
      postId: postId || null,
      roomId,
      contactName,
      contactPhone,
      tenantNote,
    });

    await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Yêu cầu hợp đồng mới",
      content: `Resident ${contactName} đã gửi yêu cầu thuê phòng.`,
      target: {
        buildings: [buildingId],
      },
      link: `/landlords/contacts`,
    });

    res.status(201).json({
      success: true,
      message: "Gửi yêu cầu hợp đồng thành công!",
      data: request,
    });
  } catch (err) {
    console.error("Error createContact:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi gửi yêu cầu!" });
  }
};

const getMyContacts = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { tenantId, isDeleted: false };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total] = await Promise.all([
      Contact.find(filter)
        .populate("buildingId", "name address")
        .populate("roomId", "roomNumber price area")
        .populate("postId", "title")
        .populate({
          path: "landlordId",
          select: "email",
          populate: {
            path: "userInfo",
            select: "fullName phoneNumber"
          }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(filter),
    ]);

    res.json({
      success: true,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
      data: requests,
    });
  } catch (err) {
    console.error("Error getMyContacts:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi lấy yêu cầu hợp đồng!" });
  }
};
const cancelContact = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const { id } = req.params;

    const request = await Contact.findOne({ _id: id, tenantId });
    if (!request)
      return res.status(404).json({ message: "Không tìm thấy yêu cầu!" });

    if (request.status !== "pending")
      return res
        .status(400)
        .json({ message: "Chỉ có thể hủy yêu cầu đang chờ xử lý!" });

    request.status = "cancelled";
    await request.save();

    res.json({ success: true, message: "Đã hủy yêu cầu thành công!" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống khi hủy yêu cầu!" });
  }
};

module.exports = {
  createContact,
  getMyContacts,
  cancelContact,
};
