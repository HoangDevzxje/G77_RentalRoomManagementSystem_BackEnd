const Booking = require("../../models/Booking");
const Notification = require("../../models/Notification");

const getAllBookings = async (req, res) => {
    try {
        const { status, buildingId, postId, page = 1, limit = 10 } = req.query;
        const filter = { isDeleted: false };

        if (req.user.role === "landlord") {
            filter.landlordId = req.user._id;
        } else if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds?.length) {
                return res.json({ success: true, pagination: { total: 0, page: +page, limit: +limit, totalPages: 0 }, data: [] });
            }
            filter.buildingId = { $in: req.staff.assignedBuildingIds };
        }

        if (status) filter.status = status;
        if (buildingId) {
            if (req.user.role === "staff" && !req.staff.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
            filter.buildingId = buildingId;
        }
        if (postId) filter.postId = postId;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [bookings, totalCount] = await Promise.all([
            Booking.find(filter)
                .populate("buildingId", "name")
                .populate("postId", "title")
                .sort({ date: 1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Booking.countDocuments(filter),
        ]);

        res.json({
            success: true,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
            },
            data: bookings,
        });
    } catch (err) {
        console.error("Error getAllBookings:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy danh sách đặt lịch!" });
    }
};

const getBookingDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Booking.findOne({ _id: id, isDeleted: false })
            .populate("buildingId", "name address")
            .populate("postId", "title")
            .lean();

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });
        }

        // Kiểm tra quyền
        if (req.user.role === "landlord") {
            if (String(booking.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không có quyền" });
            }
        } else if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(String(booking.buildingId._id))) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        }

        res.json({ success: true, data: booking });
    } catch (err) {
        console.error("Error getBookingDetail:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy chi tiết lịch!" });
    }
};

const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, landlordNote } = req.body;

        const booking = await Booking.findOne({ _id: id, isDeleted: false })
            .populate("buildingId", "_id name");
        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });
        }

        // Kiểm tra quyền
        if (req.user.role === "landlord") {
            if (String(booking.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không có quyền" });
            }
        } else if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(String(booking.buildingId._id))) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        }
        let title = "Cập nhật lịch xem phòng";
        let statusText = "";
        switch (action) {
            case "accept":
                if (booking.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể chấp nhận lịch đang chờ!" });
                booking.status = "accepted";
                title = "Chấp nhận lịch xem phòng";
                statusText = "Lịch xem phòng của bạn đã được chấp nhận";
                break;

            case "reject":
                if (booking.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể từ chối lịch đang chờ!" });
                booking.status = "rejected";
                title = "Từ chối lịch xem phòng";
                statusText = "Lịch xem phòng của bạn đã bị từ chối";
                break;

            case "cancel":
                if (booking.status !== "accepted")
                    return res.status(400).json({ message: "Chỉ có thể hủy lịch đã chấp nhận!" });
                booking.status = "cancelled";
                title = "Hủy lịch xem phòng";
                statusText = "Lịch xem phòng của bạn đã bị hủy";
                break;

            default:
                return res.status(400).json({ message: "Hành động không hợp lệ!" });
        }

        if (landlordNote) booking.landlordNote = landlordNote;
        await booking.save();

        const residentId = booking.tenantId;

        const notiResident = await Notification.create({
            landlordId: booking.landlordId,
            createByRole: "system",
            title: title,
            content: `Chủ tòa nhà ${booking.buildingId.name} đã cập nhật trạng thái lịch xem phòng: ${statusText}`,
            target: { residents: [residentId] },
        });

        // Gửi realtime
        const io = req.app.get("io");
        if (io) {
            io.to(`user:${residentId}`).emit("new_notification", {
                _id: notiResident._id,
                title: notiResident.title,
                content: notiResident.content,
                type: notiResident.type,
                createdAt: notiResident.createdAt,
                createBy: { role: "system" },
            });

            io.to(`user:${residentId}`).emit("unread_count_increment", { increment: 1 });
        }

        res.json({
            success: true,
            message: `Cập nhật trạng thái thành công (${booking.status})`,
            data: booking,
        });
    } catch (err) {
        console.error("Error updateBookingStatus:", err);
        res.status(500).json({ message: "Lỗi khi cập nhật trạng thái đặt lịch!" });
    }
};

module.exports = {
    getAllBookings,
    getBookingDetail,
    updateBookingStatus,
}; 0