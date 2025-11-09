const Employee = require("../models/Employee");
const Account = require("../models/Account");

const checkStaffPermission = (requiredPermission, options = {}) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            if (user.role === "landlord") {
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

            if (!employeeData.permissions || !employeeData.permissions.includes(requiredPermission)) {
                return res.status(403).json({
                    message: `Bạn không có quyền: ${requiredPermission}`,
                    required: requiredPermission,
                    current: employeeData.permissions,
                });
            }

            // gắn req.staff
            req.staff = {
                employeeId: employeeData._id.toString(),
                assignedBuildingIds: employeeData.assignedBuildings.map((b) => b._id.toString()),
                permissions: employeeData.permissions,
            };

            // kiểm tra buildingId hợp lệ
            if (options.checkBuilding) {
                const buildingField = options.buildingField || "buildingId";
                const buildingId =
                    req.query[buildingField] ||
                    req.body?.[buildingField] ||
                    req.params[buildingField];
                console.log("🔍 CHECK BUILDING ID:", {
                    from_query: req.query[buildingField],
                    from_body: req.body?.[buildingField],
                    final: buildingId
                });
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