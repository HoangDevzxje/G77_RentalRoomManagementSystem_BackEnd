const RevenueExpenditure = require("../../models/RevenueExpenditures");
const Building = require("../../models/Building");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const create = async (req, res) => {
    try {
        const { buildingId, title, description, type, amount, recordedAt } = req.body;
        req.body.buildingId = buildingId;
        const building = await Building.findOne({
            _id: buildingId,
            isDeleted: false
        }).select("landlordId");

        if (!building) {
            return res.status(404).json({ message: "Không tìm thấy tòa nhà!" });
        }

        if (req.user.role === "landlord" && String(building.landlordId) !== String(req.user._id)) {
            return res.status(403).json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
        }
        const record = await RevenueExpenditure.create({
            createBy: req.user._id,
            buildingId,
            landlordId: building.landlordId,
            title,
            description,
            type,
            amount,
            recordedAt: recordedAt ? new Date(recordedAt) : undefined
        });

        res.status(201).json({
            message: "Ghi nhận thu chi thành công",
            data: record
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const list = async (req, res) => {
    try {
        const { buildingId, type, startDate, endDate, page = 1, limit = 20 } = req.query;

        const filter = { isDeleted: false };

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds?.length) {
                return res.json({
                    data: [],
                    total: 0,
                    page: +page,
                    limit: +limit
                });
            }
            if (!buildingId) {
                filter.buildingId = { $in: req.staff.assignedBuildingIds };
            }
        } else if (req.user.role === "landlord") {
            if (!buildingId) {
                filter.landlordId = req.user._id;
            }
        }

        if (buildingId) {
            filter.buildingId = mongoose.Types.ObjectId(buildingId);
        }

        if (type) filter.type = type;
        if (startDate || endDate) {
            filter.recordedAt = {};
            if (startDate) filter.recordedAt.$gte = new Date(startDate);
            if (endDate) filter.recordedAt.$lte = new Date(endDate);
        }
        const [data, total] = await Promise.all([
            RevenueExpenditure.find(filter)
                .populate("createBy", "email userInfo")
                .populate("buildingId", "name")
                .sort({ recordedAt: -1 })
                .skip((page - 1) * limit)
                .limit(+limit)
                .lean(),
            RevenueExpenditure.countDocuments(filter)
        ]);

        res.json({ data, total, page: +page, limit: +limit });
    } catch (err) {
        console.error("Lỗi list thu chi:", err);
        res.status(500).json({ message: err.message });
    }
};

const getById = async (req, res) => {
    try {
        const record = await RevenueExpenditure.findById(req.params.id)
            .populate("createBy", "email")
            .populate("buildingId", "name");

        if (!record || record.isDeleted) return res.status(404).json({ message: "Không tìm thấy" });
        res.json(record);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const update = async (req, res) => {
    try {
        const record = await RevenueExpenditure.findById(req.params.id);
        if (!record || record.isDeleted) return res.status(404).json({ message: "Không tìm thấy" });

        const allowed = ["title", "description", "amount", "recordedAt"];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) record[field] = req.body[field];
        });

        if (req.body.recordedAt) record.recordedAt = new Date(req.body.recordedAt);

        await record.save();
        res.json({ message: "Cập nhật thành công", data: record });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const softDelete = async (req, res) => {
    try {
        const record = await RevenueExpenditure.findById(req.params.id);
        if (!record || record.isDeleted) return res.status(404).json({ message: "Không tìm thấy" });

        record.isDeleted = true;
        await record.save();

        res.json({ message: "Đã xóa thu chi" });
    } catch (err) {
        console.error("Lỗi xóa thu chi:", err);
        res.status(500).json({ message: err.message });
    }
};

const stats = async (req, res) => {
    try {
        const { buildingId, year = new Date().getFullYear(), month } = req.query;
        if (buildingId) req.query.buildingId = buildingId;

        const match = { isDeleted: false };
        if (buildingId) {
            match.buildingId = new mongoose.Types.ObjectId(buildingId);
        }
        if (month) {
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59);
            match.recordedAt = { $gte: start, $lte: end };
        } else {
            match.recordedAt = {
                $gte: new Date(year, 0, 1),
                $lte: new Date(year, 11, 31, 23, 59, 59)
            };
        }

        const result = await RevenueExpenditure.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$type",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        const revenue = result.find(r => r._id === "revenue")?.total || 0;
        const expenditure = result.find(r => r._id === "expenditure")?.total || 0;

        res.json({
            revenue,
            expenditure,
            profit: revenue - expenditure
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const exportExcel = async (req, res) => {
    try {
        const { buildingId, startDate, endDate } = req.query;
        if (buildingId) req.query.buildingId = buildingId;

        const filter = { isDeleted: false };
        if (buildingId) filter.buildingId = buildingId;
        if (startDate || endDate) {
            filter.recordedAt = {};
            if (startDate) filter.recordedAt.$gte = new Date(startDate);
            if (endDate) filter.recordedAt.$lte = new Date(endDate);
        }

        const data = await RevenueExpenditure.find(filter)
            .populate("buildingId", "name")
            .populate({
                path: "createBy",
                select: "email",
                populate: {
                    path: "userInfo",
                    select: "fullName"
                }
            })
            .sort({ recordedAt: -1 })
            .lean();

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Thu Chi");

        sheet.columns = [
            { header: "Ngày", key: "date", width: 15 },
            { header: "Tòa nhà", key: "building", width: 25 },
            { header: "Loại", key: "type", width: 10 },
            { header: "Tiêu đề", key: "title", width: 35 },
            { header: "Số tiền", key: "amount", width: 18 },
            { header: "Người ghi", key: "creator", width: 20 },
            { header: "Ghi chú", key: "description", width: 40 }
        ];

        data.forEach(item => {
            const fullName = item.createBy?.userInfo?.fullName;
            const creatorName = fullName ? fullName : (item.createBy?.email || "Không xác định");

            sheet.addRow({
                date: new Date(item.recordedAt).toLocaleDateString("vi-VN"),
                building: item.buildingId?.name || "Không xác định",
                type: item.type === "revenue" ? "Thu" : "Chi",
                title: item.title || "",
                amount: item.amount?.toLocaleString("vi-VN") || 0,
                creator: creatorName,
                description: item.description || ""
            });
        });

        const fileName = `thu-chi_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Lỗi export Excel thu chi:", err);
        if (!res.headersSent) {
            res.status(500).json({ message: "Lỗi xuất file Excel" });
        }
    }
};

module.exports = { create, list, getById, update, softDelete, stats, exportExcel };