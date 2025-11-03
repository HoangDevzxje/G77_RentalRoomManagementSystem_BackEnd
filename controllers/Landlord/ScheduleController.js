const LandlordSchedule = require("../../models/LandlordSchedule");
const Building = require("../../models/Building");

const upsertSchedule = async (req, res) => {
    try {
        const { buildingId, defaultSlots, overrides } = req.body;
        const landlordId = req.user._id;

        const building = await Building.findOne({ _id: buildingId, landlordId, isDeleted: false });
        if (!building) {
            return res.status(404).json({ message: "Không tìm thấy tòa nhà!" });
        }

        const schedule = await LandlordSchedule.findOneAndUpdate(
            { landlordId, buildingId },
            { defaultSlots, overrides },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            message: "Cập nhật lịch thành công!",
            data: schedule,
        });
    } catch (err) {
        console.error("Lỗi upsertSchedule:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi cập nhật lịch!" });
    }
};

const getSchedule = async (req, res) => {
    try {
        const { buildingId } = req.params;
        const landlordId = req.user._id;

        const schedule = await LandlordSchedule.findOne({ landlordId, buildingId });
        if (!schedule) {
            return res.status(404).json({ message: "Chưa thiết lập lịch cho tòa này!" });
        }

        res.json({ success: true, data: schedule });
    } catch (err) {
        console.error("Lỗi getSchedule:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy lịch!" });
    }
};

const deleteSchedule = async (req, res) => {
    try {
        const { buildingId } = req.params;
        const landlordId = req.user._id;

        await LandlordSchedule.deleteOne({ landlordId, buildingId });

        res.json({ success: true, message: "Đã xóa lịch của tòa!" });
    } catch (err) {
        console.error("Lỗi deleteSchedule:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi xóa lịch!" });
    }
};

module.exports = { upsertSchedule, getSchedule, deleteSchedule };
