const Booking = require("../../models/Booking");
const LandlordSchedule = require("../../models/LandlordSchedule");
const Post = require("../../models/Post");
const dayjs = require("dayjs");
const Staff = require("../../models/Staff");
const Notification = require("../../models/Notification");
const validateUtils = require("../../utils/validateInput")
const mongoose = require("mongoose");
const getAvailableSlots = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const { startDate, endDate } = req.query;
    if (!buildingId) {
      return res.status(400).json({ message: 'Thiếu buildingId' });
    }
    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: 'buildingId không hợp lệ' });
    }
    const start = startDate ? dayjs(startDate) : dayjs().startOf("day");
    const end = endDate ? dayjs(endDate) : start.add(6, "day");

    const schedule = await LandlordSchedule.findOne({ buildingId }).lean();
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Chủ trọ chưa thiết lập lịch cho tòa nhà này!",
      });
    }

    const availableDays = [];

    for (let date = start; date.isBefore(end) || date.isSame(end, "day"); date = date.add(1, "day")) {
      const dayOfWeek = date.day();
      const formattedDate = date.format("YYYY-MM-DD");

      const defaultSlots = schedule.defaultSlots.filter(s => s.dayOfWeek === dayOfWeek && s.isAvailable);
      const overrides = schedule.overrides.filter(o => dayjs(o.date).isSame(date, "day"));

      let slots = [];

      if (overrides.length > 0) {
        overrides.forEach(o => {
          if (o.isAvailable) {
            slots.push({ startTime: o.startTime, endTime: o.endTime });
          } else {
            if (o.startTime && o.endTime) {
              defaultSlots.forEach(d => {
                if (o.startTime > d.startTime) {
                  slots.push({ startTime: d.startTime, endTime: o.startTime });
                }
                if (o.endTime < d.endTime) {
                  slots.push({ startTime: o.endTime, endTime: d.endTime });
                }
              });
            } else {
              slots = [];
            }
          }
        });
      } else {
        slots = defaultSlots.map(s => ({
          startTime: s.startTime,
          endTime: s.endTime
        }));
      }

      availableDays.push({
        date: formattedDate,
        slots,
      });
    }

    res.json({
      success: true,
      buildingId,
      landlordId: schedule.landlordId,
      availableDays,
    });
  } catch (err) {
    console.error("Lỗi getAvailableSlots:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi lấy lịch khả dụng!" });
  }
};

const create = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const { postId, buildingId, date, timeSlot, tenantNote, contactName, contactPhone } = req.body;
    if (!postId) {
      return res.status(400).json({ message: 'Thiếu postId' });
    }
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'postId không hợp lệ' });
    }
    if (!buildingId) {
      return res.status(400).json({ message: 'Thiếu buildingId' });
    }
    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: 'buildingId không hợp lệ' });
    }
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập ngày đặt lịch!",
      });
    }
    if (!timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập giờ đặt lịch!",
      });
    }
    if (!contactName) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập tên người đặt lịch!",
      });
    }
    if (!contactPhone) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập sđt người đặt lịch!",
      });
    }
    const checkPhone = validateUtils.validatePhone(contactPhone);
    if (checkPhone !== null) {
      return res.status(400).json({ message: checkPhone });
    }
    const post = await Post.findById(postId).populate("landlordId");
    if (!post) {
      return res.status(404).json({ success: false, message: "Bài đăng không tồn tại!" });
    }

    if (post.buildingId.toString() !== buildingId) {
      return res.status(400).json({
        success: false,
        message: "Tòa nhà không khớp với bài đăng!",
      });
    }

    const landlordId = post.landlordId._id;

    const schedule = await LandlordSchedule.findOne({ landlordId, buildingId }).populate("buildingId", "name");
    if (!schedule) {
      return res.status(400).json({
        success: false,
        message: "Chủ trọ chưa thiết lập lịch rảnh cho tòa nhà này!",
      });
    }

    const checkDate = dayjs(date);
    if (!checkDate.isValid()) {
      return res.status(400).json({ success: false, message: "Ngày không hợp lệ!" });
    }

    const dayOfWeek = checkDate.day();

    const defaultSlots = schedule.defaultSlots.filter(s => s.dayOfWeek === dayOfWeek && s.isAvailable);
    const overrides = schedule.overrides.filter(o => dayjs(o.date).isSame(checkDate, "day"));

    let availableSlots = [];

    if (overrides.length > 0) {
      overrides.forEach(o => {
        if (o.isAvailable) {
          if (o.startTime && o.endTime) {
            availableSlots.push({ startTime: o.startTime, endTime: o.endTime });
          }
        } else {
          if (o.startTime && o.endTime) {
            defaultSlots.forEach(d => {
              if (o.startTime > d.startTime) {
                availableSlots.push({ startTime: d.startTime, endTime: o.startTime });
              }
              if (o.endTime < d.endTime) {
                availableSlots.push({ startTime: o.endTime, endTime: d.endTime });
              }
            });
          } else {
            availableSlots = [];
          }
        }
      });
    } else {
      availableSlots = defaultSlots.map(s => ({
        startTime: s.startTime,
        endTime: s.endTime
      }));
    }

    const isTimeSlotAvailable = availableSlots.some(
      slot => timeSlot >= slot.startTime && timeSlot <= slot.endTime
    );

    if (!isTimeSlotAvailable) {
      return res.status(400).json({
        success: false,
        message: "Khung giờ này không khả dụng. Vui lòng chọn thời gian khác!",
      });
    }

    const existingBooking = await Booking.findOne({
      tenantId,
      date,
      timeSlot,
      status: { $in: ["pending", "confirmed"] },
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "Bạn đã có một lịch đặt trong khung giờ này!",
      });
    }

    const booking = await Booking.create({
      tenantId,
      landlordId,
      buildingId,
      postId,
      date,
      timeSlot,
      tenantNote,
      contactName,
      contactPhone,
      status: "pending",
    });
    const io = req.app.get("io");
    if (io) {
      const notification = await Notification.create({
        landlordId,
        createBy: tenantId,
        createByRole: "resident",
        title: "Có lịch xem phòng mới!",
        content: `${contactName} (${contactPhone}) muốn xem phòng của tòa nhà ${schedule.buildingId.name} vào ngày ${dayjs(date).format("DD/MM/YYYY")} lúc ${timeSlot}`,
        type: "reminder",
        target: { buildings: [buildingId] },
        link: `/landlord/appointment-management`,
      });

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
          role: "resident",
          phone: contactPhone
        }
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);
      io.to(`user:${landlordId}`).emit("unread_count_increment", { increment: 1 });

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }
    return res.status(201).json({
      success: true,
      message: "Đặt lịch xem phòng thành công! Vui lòng chờ chủ trọ xác nhận.",
      data: booking,
    });
  } catch (err) {
    console.error("❌ Error creating booking:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi hệ thống khi đặt lịch!",
    });
  }
};



const getMyBookings = async (req, res) => {
  try {
    const tenantId = req.user._id;

    const bookings = await Booking.find({
      tenantId,
      isDeleted: false
    })
      .populate("postId", "title address roomIds")
      .populate("buildingId", "name")
      .populate("landlordId", "email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: bookings
    });
  } catch (err) {
    console.error("Error getMyBookings:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi lấy danh sách đặt lịch!" });
  }
};

const cancel = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    const booking = await Booking.findOne({ _id: id, tenantId, isDeleted: false }).populate("buildingId", "name");
    if (!booking) return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });

    if (booking.status === "accepted")
      return res.status(400).json({ message: "Không thể hủy lịch đã được chấp nhận!" });

    booking.status = "cancelled";
    await booking.save();

    const io = req.app.get("io");
    if (io) {
      const notification = await Notification.create({
        landlordId: booking.landlordId,
        createBy: tenantId,
        createByRole: "resident",
        title: "Hũy lịch xem phòng!",
        content: `${booking.contactName} (${booking.contactPhone}) đã hủy lịch xem phòng của tòa nhà ${booking.buildingId.name} vào ngày ${dayjs(booking.date).format("DD/MM/YYYY")} lúc ${booking.timeSlot}`,
        target: { buildings: [booking.buildingId] },
        type: "reminder",
        link: `/landlord/bookings`,
      });

      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: booking.contactName,
          role: "resident",
          phone: booking.contactPhone
        }
      };

      io.to(`user:${booking.landlordId}`).emit("new_notification", payload);
      io.to(`user:${booking.landlordId}`).emit("unread_count_increment", { increment: 1 });

      const staffList = await Staff.find({
        assignedBuildings: booking.buildingId,
        isDeleted: false
      }).select("accountId").lean();

      staffList.forEach(staff => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }

    res.json({ success: true, message: "Hủy lịch thành công!" });
  } catch (err) {
    console.error("Error cancelBooking:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi hủy lịch!" });
  }
};

module.exports = { create, getMyBookings, cancel, getAvailableSlots };
