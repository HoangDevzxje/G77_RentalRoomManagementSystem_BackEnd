const Term = require("../../models/Term");
const Building = require("../../models/Building");

const createTerm = async (req, res) => {
    try {
        let { buildingId: inputBuildingId, name, description } = req.body;

        if (!inputBuildingId || !name || !description) {
            return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
        }

        const landlordId = req.user._id;
        let finalBuildingId;

        if (req.user.role === "staff") {
            if (!req.staff?.currentBuildingId) {
                return res.status(403).json({ message: "Không có quyền" });
            }
            finalBuildingId = req.staff.currentBuildingId;
        } else {
            const building = await Building.findOne({ _id: inputBuildingId, landlordId });
            if (!building) {
                return res.status(403).json({ message: "Không có quyền tạo điều khoản cho tòa nhà này!" });
            }
            finalBuildingId = inputBuildingId;
        }

        const term = await Term.create({ buildingId: finalBuildingId, name, description });

        res.status(201).json({
            success: true,
            message: "Tạo điều khoản thành công!",
            data: term,
        });
    } catch (err) {
        console.error("Error createTerm:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const getTermsByBuilding = async (req, res) => {
    try {
        const { buildingId } = req.params;
        const { status, page = 1, limit = 10 } = req.query;
        if (!buildingId) {
            return res.status(400).json({ message: "Thiếu buildingId!" });
        }
        let filter = { isDeleted: false };
        let landlordId = req.user._id;

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
            filter.buildingId = buildingId;
        } else {
            const building = await Building.findOne({ _id: buildingId, landlordId });
            if (!building) {
                return res.status(403).json({ message: "Không có quyền xem điều khoản!" });
            }
            filter.buildingId = buildingId;
        }

        if (status) filter.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [terms, total] = await Promise.all([
            Term.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Term.countDocuments(filter),
        ]);

        res.json({
            success: true,
            pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) },
            data: terms,
        });
    } catch (err) {
        console.error("Error getTermsByBuilding:", err.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
const getTermDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const term = await Term.findById(id).populate("buildingId", "name landlordId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });

        const building = term.buildingId;

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(building._id.toString())) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else {
            if (building.landlordId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: "Không có quyền xem điều khoản này!" });
            }
        }

        res.json({ success: true, data: term });
    } catch (err) {
        console.error("Error getTermDetail:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};


const updateTerm = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;

        const term = await Term.findById(id).populate("buildingId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });
        if (!name || !description || !status) return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
        const buildingId = term.buildingId._id.toString();

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else {
            if (term.buildingId.landlordId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: "Không có quyền!" });
            }
        }

        term.name = name || term.name;
        term.description = description || term.description;
        if (status) term.status = status;

        await term.save();

        res.json({ success: true, message: "Cập nhật điều khoản thành công!", data: term });
    } catch (err) {
        console.error("Error updateTerm:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const deleteTerm = async (req, res) => {
    try {
        const { id } = req.params;

        const term = await Term.findById(id).populate("buildingId");
        if (!term) return res.status(404).json({ message: "Không tìm thấy điều khoản!" });

        const buildingId = term.buildingId._id.toString();

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else {
            if (term.buildingId.landlordId.toString() !== req.user._id.toString()) {
                return res.status(403).json({ message: "Không có quyền!" });
            }
        }

        term.isDeleted = true;
        await term.save();

        res.json({ success: true, message: "Xóa điều khoản thành công!" });
    } catch (err) {
        console.error("Error deleteTerm:", err);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

module.exports = {
    createTerm,
    getTermsByBuilding,
    updateTerm,
    deleteTerm,
    getTermDetail,
};
