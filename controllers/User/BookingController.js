const Booking = require("../../models/Booking");
const LandlordSchedule = require("../../models/LandlordSchedule");
const Post = require("../../models/Post");
const dayjs = require("dayjs");

const getAvailableSlots = async (req, res) => {
    try {
        const { buildingId } = req.params;
        const { startDate, endDate } = req.query;

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
            const dayOfWeek = date.day(); // 0-6
            const formattedDate = date.format("YYYY-MM-DD");

            const override = schedule.overrides.find(o => dayjs(o.date).isSame(date, "day"));
            if (override) {
                if (!override.isAvailable) {
                    availableDays.push({
                        date: formattedDate,
                        slots: [],
                        note: override.note || "Không khả dụng"
                    });
                    continue;
                } else {
                    availableDays.push({
                        date: formattedDate,
                        slots: [{
                            startTime: override.startTime,
                            endTime: override.endTime
                        }],
                        note: override.note || null
                    });
                    continue;
                }
            }

            const slots = schedule.defaultSlots
                .filter(s => s.dayOfWeek === dayOfWeek && s.isAvailable)
                .map(s => ({
                    startTime: s.startTime,
                    endTime: s.endTime
                }));

            availableDays.push({ date: formattedDate, slots });
        }

        return res.json({
            success: true,
            buildingId,
            landlordId: schedule.landlordId,
            availableDays,
        });
    } catch (err) {
        console.error("Lỗi getAvailableSlots:", err);
        return res.status(500).json({
            success: false,
            message: "Lỗi hệ thống khi lấy lịch khả dụng!",
        });
    }
};

const create = async (req, res) => {
    try {
        const tenantId = req.user._id;
        const { postId, buildingId, date, timeSlot, tenantNote, contactName, contactPhone } = req.body;

        // 🔹 Kiểm tra dữ liệu đầu vào
        if (!postId || !buildingId || !date || !timeSlot || !contactName || !contactPhone)
            return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin đặt lịch!" });

        // 🔹 Lấy thông tin bài đăng
        const post = await Post.findById(postId).populate("landlordId");
        if (!post) return res.status(404).json({ message: "Bài đăng không tồn tại!" });

        // 🔹 Kiểm tra tòa nhà có khớp bài đăng không
        if (post.buildingId.toString() !== buildingId) {
            return res.status(400).json({
                success: false,
                message: "Tòa nhà không khớp với bài đăng! Vui lòng chọn đúng bài đăng và tòa nhà.",
            });
        }

        const landlordId = post.landlordId._id;

        // 🔹 Kiểm tra lịch làm việc của chủ trọ cho tòa nhà
        const schedule = await LandlordSchedule.findOne({ landlordId, buildingId });
        if (!schedule) {
            return res.status(400).json({ message: "Chủ trọ chưa thiết lập lịch rảnh cho tòa nhà này!" });
        }

        // 🔹 Kiểm tra ngày và khung giờ khả dụng
        const checkDate = dayjs(date);
        const override = schedule.overrides.find(o => dayjs(o.date).isSame(checkDate, "day"));
        const dayOfWeek = checkDate.day(); // 0-6

        let isAvailable = false;
        let note = null;

        if (override) {
            // Có override trong ngày này
            if (override.isAvailable &&
                override.startTime <= timeSlot &&
                override.endTime >= timeSlot) {
                isAvailable = true;
                note = override.note || null;
            } else {
                note = override.note || "Không khả dụng";
            }
        } else {
            // Không có override, kiểm tra defaultSlots
            const matched = schedule.defaultSlots.find(
                s =>
                    s.dayOfWeek === dayOfWeek &&
                    s.isAvailable &&
                    s.startTime <= timeSlot &&
                    s.endTime >= timeSlot
            );
            if (matched) isAvailable = true;
        }

        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                message: note || "Khung giờ đã chọn không khả dụng. Vui lòng chọn thời gian khác!",
            });
        }

        // 🔹 Tạo lịch đặt
        const booking = await Booking.create({
            tenantId,
            landlordId,
            buildingId,
            postId,
            contactName,
            contactPhone,
            date,
            timeSlot,
            tenantNote,
        });

        res.status(201).json({
            success: true,
            message: "Đặt lịch xem phòng thành công, vui lòng chờ chủ trọ xác nhận!",
            data: booking,
        });
    } catch (err) {
        console.error("Error creating booking:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi đặt lịch!" });
    }
};


const getMyBookings = async (req, res) => {
    try {
        const tenantId = req.user._id;

        const bookings = await Booking.find({
            tenantId,
            isDeleted: false
        })
            .populate("postId", "title address")
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

        const booking = await Booking.findOne({ _id: id, tenantId, isDeleted: false });
        if (!booking) return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });

        if (booking.status === "accepted")
            return res.status(400).json({ message: "Không thể hủy lịch đã được chấp nhận!" });

        booking.status = "cancelled";
        await booking.save();

        res.json({ success: true, message: "Hủy lịch thành công!" });
    } catch (err) {
        console.error("Error cancelBooking:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi hủy lịch!" });
    }
};

module.exports = { create, getMyBookings, cancel, getAvailableSlots };
