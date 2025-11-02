const Term = require("../../models/Term");
const Building = require("../../models/Building");

const createTerm = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { buildingId, name, description } = req.body;

        if (!buildingId || !name || !description)
            return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });

        const building = await Building.findOne({ _id: buildingId, landlordId });
        if (!building)
            return res.status(403).json({ message: "Không có quyền tạo điều khoản cho tòa nhà này!" });

        const term = await Term.create({ buildingId, name, description });

        res.status(201).json({ success: true, message: "Tạo điều khoản thành công!", data: term });
    } catch (err) {
        console.error("Error createTerm:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi tạo điều khoản!" });
    }
};

const getTermsByBuilding = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { buildingId } = req.params;
        const { status, page = 1, limit = 10 } = req.query;

        const building = await Building.findOne({ _id: buildingId, landlordId });
        if (!building)
            return res.status(403).json({ message: "Không có quyền xem điều khoản của tòa nhà này!" });

        const filter = { buildingId, isDeleted: false };
        if (status) filter.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [terms, total] = await Promise.all([
            Term.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Term.countDocuments(filter),
        ]);

        res.json({
            success: true,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit)),
            },
            data: terms,
        });
    } catch (err) {
        console.error("Error getTermsByBuilding:", err);
        res.status(500).json({ message: "Lỗi khi lấy danh sách điều khoản!" });
    }
};
const getTermDetail = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { id } = req.params;

        const term = await Term.findById(id).populate("buildingId", "name address landlordId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });
        console.log(term.buildingId.landlordId.toString(), landlordId.toString());
        if (term.buildingId.landlordId.toString() !== landlordId.toString()) {
            return res.status(403).json({ message: "Không có quyền xem điều khoản này!" });
        }

        res.json({
            success: true,
            data: term,
        });
    } catch (err) {
        console.error("Error getTermDetail:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy chi tiết điều khoản!" });
    }
};


const updateTerm = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { id } = req.params;
        const { name, description, status } = req.body;

        const term = await Term.findById(id).populate("buildingId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });
        if (term.buildingId.landlordId.toString() !== landlordId.toString())
            return res.status(403).json({ message: "Không có quyền cập nhật điều khoản này!" });

        term.name = name || term.name;
        term.description = description || term.description;
        if (status) term.status = status;

        await term.save();

        res.json({ success: true, message: "Cập nhật điều khoản thành công!", data: term });
    } catch (err) {
        console.error("Error updateTerm:", err);
        res.status(500).json({ message: "Lỗi khi cập nhật điều khoản!" });
    }
};

const deleteTerm = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const { id } = req.params;

        const term = await Term.findById(id).populate("buildingId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });
        if (term.buildingId.landlordId.toString() !== landlordId.toString())
            return res.status(403).json({ message: "Không có quyền xóa điều khoản này!" });

        term.isDeleted = true;
        await term.save();

        res.json({ success: true, message: "Xóa điều khoản thành công!" });
    } catch (err) {
        console.error("Error deleteTerm:", err);
        res.status(500).json({ message: "Lỗi khi xóa điều khoản!" });
    }
};

module.exports = {
    createTerm,
    getTermsByBuilding,
    updateTerm,
    deleteTerm,
    getTermDetail,
};
