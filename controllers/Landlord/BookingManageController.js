const Booking = require("../../models/Booking");
const dayjs = require("dayjs");

const getAllBookings = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { status, buildingId, postId, page = 1, limit = 10 } = req.query;

        const filter = { landlordId, isDeleted: false };
        if (status) filter.status = status;
        if (buildingId) filter.buildingId = buildingId;
        if (postId) filter.postId = postId;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [bookings, totalCount] = await Promise.all([
            Booking.find(filter)
                .populate("buildingId", "name")
                .populate("postId", "title")
                .sort({ date: 1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
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
        const landlordId = req.user._id;
        const { id } = req.params;

        const booking = await Booking.findOne({
            _id: id,
            landlordId,
            isDeleted: false,
        })
            .populate("buildingId", "name address")
            .populate("postId", "title");

        if (!booking)
            return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });

        res.json({ success: true, data: booking });
    } catch (err) {
        console.error("Error getBookingDetail:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy chi tiết lịch!" });
    }
};

const updateBookingStatus = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { id } = req.params;
        const { action, landlordNote } = req.body;

        const booking = await Booking.findOne({ _id: id, landlordId, isDeleted: false });
        if (!booking)
            return res.status(404).json({ message: "Không tìm thấy lịch đặt!" });

        switch (action) {
            case "accept":
                if (booking.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể chấp nhận lịch đang chờ!" });
                booking.status = "accepted";
                break;

            case "reject":
                if (booking.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể từ chối lịch đang chờ!" });
                booking.status = "rejected";
                break;

            case "cancel":
                if (booking.status !== "accepted")
                    return res.status(400).json({ message: "Chỉ có thể hủy lịch đã chấp nhận!" });
                booking.status = "cancelled";
                break;

            default:
                return res.status(400).json({ message: "Hành động không hợp lệ!" });
        }

        if (landlordNote) booking.landlordNote = landlordNote;
        await booking.save();

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
};
