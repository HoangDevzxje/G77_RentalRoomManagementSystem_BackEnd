const Contact = require("../../models/Contact");
const Building = require("../../models/Building");
const Room = require("../../models/Room");
const Post = require("../../models/Post");
const Notification = require("../../models/Notification");
const Staff = require("../../models/Staff");
const validateUtils = require("../../utils/validateInput")
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

    if (!buildingId || !roomId)
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin bắt buộc!" });
    if (!contactName)
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ tên!" });
    if (!contactPhone)
      return res.status(400).json({ message: "Vui lòng nhập đày đủ sđt!" });

    const checkPhone = validateUtils.validatePhone(contactPhone);
    if (checkPhone !== null) {
      return res.status(400).json({ message: checkPhone });
    }

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

    const notification = await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Yêu cầu hợp đồng mới",
      content: `${contactName} (${contactPhone}) muốn thuê phòng ${room.roomNumber || roomId} của tòa nhà ${building.name}`,
      target: { buildings: [buildingId] },
      type: "reminder",
      link: `/landlord/contact-management`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: req.user.fullName || contactName,
          role: "resident"
        }
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${landlordId}`).emit("unread_count_increment", { increment: 1 });
      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

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

    const request = await Contact.findOne({ _id: id, tenantId })
      .populate("roomId", "roomNumber")
      .populate("buildingId", "name");
    if (!request)
      return res.status(404).json({ message: "Không tìm thấy yêu cầu!" });

    if (request.status !== "pending")
      return res
        .status(400)
        .json({ message: "Chỉ có thể hủy yêu cầu đang chờ xử lý!" });

    request.status = "cancelled";
    await request.save();
    const notification = await Notification.create({
      landlordId: request.landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Hủy yêu cầu hợp đồng",
      content: `${request.contactName} (${request.contactPhone}) đã hủy yêu cầu tạo hợp đồng với phòng ${request?.roomId?.roomNumber} của tòa nhà ${request?.buildingId?.name}`,
      target: { buildings: [request.buildingId] },
      type: "reminder",
      link: `/landlord/contact-management`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: request.contactName,
          role: "resident"
        }
      };

      io.to(`user:${request.landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: request.buildingId,
        isDeleted: false
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${request.landlordId}`).emit("unread_count_increment", { increment: 1 });
      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }
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
