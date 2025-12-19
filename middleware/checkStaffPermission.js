const mongoose = require("mongoose");
const Employee = require("../models/Staff");
const Account = require("../models/Account");

const checkStaffPermission = (requiredPermission, options = {}) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (user.role === "landlord" || user.role === "resident") {
                return next();
            }

            if (user.role !== "staff") {
                return res.status(403).json({
                    message: "Chỉ nhân viên (staff) mới được kiểm tra quyền này",
                });
            }

            // check active
            const result = await Employee.aggregate([
                {
                    $match: {
                        accountId: user._id,
                        isDeleted: { $ne: true },
                    },
                },
                {
                    $lookup: {
                        from: "accounts",
                        localField: "accountId",
                        foreignField: "_id",
                        as: "account",
                    },
                },
                { $unwind: "$account" },
                {
                    $match: {
                        "account.isActivated": true,
                        "account.isDeleted": { $ne: true },
                    },
                },
                {
                    $lookup: {
                        from: "buildings",
                        localField: "assignedBuildings",
                        foreignField: "_id",
                        as: "assignedBuildings",
                    },
                },
                { $limit: 1 },
            ]);

            const employeeData = result[0];
            if (!employeeData) {
                return res.status(403).json({
                    message: "Tài khoản nhân viên không tồn tại, bị vô hiệu hóa hoặc đã bị xóa",
                });
            }

            if (!employeeData.permissions?.includes(requiredPermission)) {
                return res.status(403).json({
                    message: `Bạn không có quyền: ${requiredPermission}`,
                    required: requiredPermission,
                    current: employeeData.permissions,
                });
            }

            req.staff = {
                employeeId: employeeData._id.toString(),
                assignedBuildingIds: employeeData.assignedBuildings.map((b) => b._id.toString()),
                permissions: employeeData.permissions,
                landlordId: employeeData.landlordId?.toString()
            };

            let buildingId = null;
            const buildingField = options.buildingField || "buildingId";

            buildingId = req.query[buildingField] || req.body?.[buildingField] || req.params[buildingField];
            if (!buildingId && options.allowFromDb && options.model) {
                const idField = options.idField || "id";
                const recordId = req.params[idField]
                if (!recordId) {
                    console.error("Lỗi allowFromDb: idField không tìm thấy");
                } else {
                    try {
                        const Model = require(`../models/${options.model}`);
                        const record = await Model.findById(recordId)
                            .select("buildingId")
                            .lean();
                        if (!record || record.isDeleted) return res.status(404).json({ message: "Không tìm thấy buildingId theo params truyền vào hoặc đã bị xóa" });
                        if (record && !record.isDeleted) {
                            buildingId = record.buildingId.toString();
                            req.body = req.body || {};
                            req.body[buildingField] = buildingId;
                            req.staff.currentBuildingId = buildingId;
                        }
                    } catch (err) {
                        console.error("Lỗi allowFromDb:", err);
                    }
                }

            }

            if (options.checkBuilding) {

                if (!buildingId) {
                    return res.status(400).json({
                        message: `Thiếu thông tin tòa nhà (${buildingField})`,
                    });
                }

                if (!req.staff.assignedBuildingIds.includes(buildingId)) {
                    return res.status(403).json({
                        message: "Bạn không được quản lý tòa nhà này",
                        buildingId,
                        allowed: req.staff.assignedBuildingIds,
                    });
                }

                req.staff.currentBuildingId = buildingId;
            }

            next();
        } catch (error) {
            console.error("Lỗi checkStaffPermission:", error);
            return res.status(500).json({ message: "Lỗi hệ thống khi kiểm tra quyền" });
        }
    };
};

module.exports = { checkStaffPermission };