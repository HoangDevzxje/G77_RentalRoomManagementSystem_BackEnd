const Contact = require("../../models/Contact");

const getAllContacts = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { status, buildingId, page = 1, limit = 10 } = req.query;

        const filter = { landlordId, isDeleted: false };
        if (status) filter.status = status;
        if (buildingId) filter.buildingId = buildingId;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [requests, total] = await Promise.all([
            Contact.find(filter)
                .populate("tenantId", "email fullName phone")
                .populate("buildingId", "name")
                .populate("roomId", "roomNumber")
                .populate("postId", "title")
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
        console.error("Error getAllContacts:", err);
        res.status(500).json({ message: "Lỗi khi lấy danh sách yêu cầu!" });
    }
};
const updateContractStatus = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { id } = req.params;
        const { action, landlordNote } = req.body;

        const request = await Contact.findOne({ _id: id, landlordId });
        if (!request) return res.status(404).json({ message: "Không tìm thấy yêu cầu!" });

        switch (action) {
            case "accepted":
                if (request.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể chấp nhận yêu cầu đang chờ!" });
                request.status = "accepted";
                break;
            case "rejected":
                if (request.status !== "pending")
                    return res.status(400).json({ message: "Chỉ có thể từ chối yêu cầu đang chờ!" });
                request.status = "rejected";
                break;
            default:
                return res.status(400).json({ message: "Hành động không hợp lệ!" });
        }

        if (landlordNote) request.landlordNote = landlordNote;
        await request.save();

        res.json({
            success: true,
            message: `Cập nhật trạng thái thành công (${request.status})`,
            data: request,
        });
    } catch (err) {
        console.error("Error updateContractStatus:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi cập nhật trạng thái!" });
    }
};

module.exports = { getAllContacts, updateContractStatus };