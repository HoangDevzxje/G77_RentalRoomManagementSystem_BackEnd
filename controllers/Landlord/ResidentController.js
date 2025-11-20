const mongoose = require("mongoose");
const Room = require("../../models/Room");
const Account = require("../../models/Account");
const Building = require("../../models/Building");

const getTenants = async (req, res) => {
    try {
        const {
            buildingId,
            floorId,
            roomId,
            search,
            page = 1,
            limit = 15,
        } = req.query;

        const user = req.user;
        const staff = req.staff;

        let allowedBuildingIds = [];

        if (user.role === "landlord") {
            const buildings = await Building.find({
                landlordId: user._id,
                isDeleted: false,
            }).select("_id");
            allowedBuildingIds = buildings.map((b) => b._id);
        } else if (user.role === "staff" && staff) {
            allowedBuildingIds = (staff.assignedBuildingIds || [])
                .map(id => {
                    try {
                        return new mongoose.Types.ObjectId(id);
                    } catch (err) {
                        console.error("ID không hợp lệ:", id);
                        return null;
                    }
                })
                .filter(Boolean);
        }
        if (allowedBuildingIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    people: [],
                    stats: { current: 0, max: 0, text: "0/0 người", percentage: 0 },
                    pagination: { total: 0, page: 1, limit: 15, totalPages: 0 },
                },
            });
        }

        if (buildingId && !allowedBuildingIds.map(id => id.toString()).includes(buildingId)) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền xem tòa nhà này",
            });
        }

        const matchStage = {
            buildingId: { $in: allowedBuildingIds },
            active: true,
            isDeleted: false,
            currentTenantIds: { $ne: [] },
        };

        if (buildingId) matchStage.buildingId = new mongoose.Types.ObjectId(buildingId);
        if (floorId) matchStage.floorId = new mongoose.Types.ObjectId(floorId);
        if (roomId) matchStage._id = new mongoose.Types.ObjectId(roomId);

        const pipeline = [
            { $match: matchStage },

            {
                $lookup: {
                    from: "accounts",
                    localField: "currentTenantIds",
                    foreignField: "_id",
                    as: "tenants",
                },
            },
            { $unwind: "$tenants" },

            {
                $match: {
                    "tenants.role": "resident",
                    "tenants.isActivated": true,
                },
            },

            {
                $lookup: {
                    from: "userinformations",
                    localField: "tenants.userInfo",
                    foreignField: "_id",
                    as: "tenants.userInfo",
                },
            },
            { $unwind: { path: "$tenants.userInfo", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "buildings",
                    localField: "buildingId",
                    foreignField: "_id",
                    as: "building",
                },
            },
            { $unwind: "$building" },

            {
                $lookup: {
                    from: "floors",
                    localField: "floorId",
                    foreignField: "_id",
                    as: "floor",
                },
            },
            { $unwind: { path: "$floor", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    personId: "$tenants._id",
                    email: "$tenants.email",
                    fullName: { $ifNull: ["$tenants.userInfo.fullName", "Chưa cập nhật"] },
                    phoneNumber: { $ifNull: ["$tenants.userInfo.phoneNumber", ""] },
                    gender: { $ifNull: ["$tenants.userInfo.gender", "Khác"] },
                    dob: "$tenants.userInfo.dob",
                    address: { $ifNull: ["$tenants.userInfo.address", ""] },

                    roomId: "$_id",
                    roomNumber: "$roomNumber",
                    buildingName: "$building.name",
                    floorNumber: { $ifNull: ["$floor.description", null] },
                },
            },
        ];

        if (search) {
            const searchRegex = new RegExp(search.trim(), "i");
            pipeline.push({
                $match: {
                    $or: [
                        { fullName: searchRegex },
                        { phoneNumber: searchRegex },
                        { email: searchRegex },
                    ],
                },
            });
        }

        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Room.aggregate(countPipeline);
        const totalPeople = countResult[0]?.total || 0;

        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = (pageNum - 1) * limitNum;

        pipeline.push({ $skip: skip }, { $limit: limitNum });

        const people = await Room.aggregate(pipeline);
        console.log("people", people);
        let stats = { current: 0, max: 0, text: "0/0 người", percentage: 0 };

        const statsMatch = {
            buildingId: { $in: allowedBuildingIds },
            active: true,
            isDeleted: false,
        };
        if (buildingId) statsMatch.buildingId = new mongoose.Types.ObjectId(buildingId);

        const statsAgg = await Room.aggregate([
            { $match: statsMatch },
            {
                $group: {
                    _id: null,
                    current: { $sum: { $size: { $ifNull: ["$currentTenantIds", []] } } },
                    max: { $sum: { $ifNull: ["$maxTenants", 1] } },
                },
            },
        ]);

        if (statsAgg[0]) {
            stats = {
                current: statsAgg[0].current,
                max: statsAgg[0].max,
                percentage: statsAgg[0].max > 0 ? Math.round((statsAgg[0].current / statsAgg[0].max) * 100) : 0,
                text: `${statsAgg[0].current}/${statsAgg[0].max} người`,
            };
        }

        const totalPages = Math.ceil(totalPeople / limitNum);

        return res.status(200).json({
            success: true,
            data: {
                people: people.map(p => ({
                    personId: p.personId.toString(),
                    fullName: p.fullName,
                    email: p.email,
                    phoneNumber: p.phoneNumber,
                    gender: p.gender,
                    dob: p.dob,
                    address: p.address,

                    roomId: p.roomId.toString(),
                    roomNumber: p.roomNumber,
                    buildingName: p.buildingName,
                    floor: p.floorNumber ? `Tầng ${p.floorNumber}` : "Chưa xác định",
                })),
                stats,
                pagination: {
                    total: totalPeople,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1,
                },
                meta: {
                    filters: { buildingId, floorId, roomId, search },
                },
            },
        });

    } catch (error) {
        console.error("getTenantPeople error:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi tải danh sách cư dân",
            error: error.message,
        });
    }
};

const addTenantToRoom = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { roomId, accountId } = req.body;
        if (!roomId || !accountId) {
            return res.status(400).json({
                success: false,
                message: "Thiếu roomId hoặc accountId",
            });
        }

        const user = req.user;
        const staff = req.staff;

        const room = await Room.findById(roomId)
            .populate("buildingId")
            .session(session);

        if (!room || room.isDeleted || !room.active) {
            return res.status(404).json({
                success: false,
                message: "Phòng không tồn tại hoặc đã bị xóa",
            });
        }

        if (user.role === "staff" && staff) {
            const buildingIdStr = room.buildingId?._id?.toString();
            const hasPermission = staff.assignedBuildingIds?.some(
                id => id.toString() === buildingIdStr
            );

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền thêm cư dân vào phòng thuộc tòa này",
                });
            }
        }

        const account = await Account.findById(accountId)
            .populate("userInfo")
            .session(session);

        if (!account || account.role !== "resident") {
            return res.status(400).json({
                success: false,
                message: "Không tìm thấy cư dân hợp lệ",
            });
        }
        if (!account.isActivated) {
            return res.status(400).json({
                success: false,
                message: "Tài khoản cư dân chưa được kích hoạt",
            });
        }

        const existingRoom = await Room.findOne({
            currentTenantIds: accountId,
            _id: { $ne: roomId },
            isDeleted: false,
            active: true,
        }).lean();

        if (existingRoom) {
            return res.status(400).json({
                success: false,
                message: `Cư dân đang ở phòng ${existingRoom.roomNumber}. Vui lòng dọn ra trước.`,
            });
        }

        const currentCount = room.currentTenantIds?.length || 0;
        if (currentCount >= room.maxTenants) {
            return res.status(400).json({
                success: false,
                message: `Phòng đã đầy (${currentCount}/${room.maxTenants})`,
            });
        }

        room.currentTenantIds.push(accountId);
        if (room.status !== "rented") room.status = "rented";
        await room.save({ session });

        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Thêm cư dân vào phòng thành công",
            data: {
                roomId: room._id.toString(),
                roomNumber: room.roomNumber,
                buildingName: room.buildingId?.name || "Không xác định",
                addedTenant: {
                    accountId: account._id.toString(),
                    fullName: account.userInfo?.fullName || "Chưa cập nhật",
                    email: account.email,
                },
                newOccupancy: `${room.currentTenantIds.length}/${room.maxTenants}`,
            },
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("addTenantToRoom error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Thêm cư dân thất bại",
        });
    } finally {
        session.endSession();
    }
};

const removeTenantFromRoom = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { roomId, accountId } = req.body;
        if (!roomId || !accountId) {
            return res.status(400).json({
                success: false,
                message: "Thiếu roomId hoặc accountId",
            });
        }

        const user = req.user;
        const staff = req.staff;

        const room = await Room.findById(roomId)
            .populate("buildingId")
            .session(session);

        if (!room || room.isDeleted || !room.active) {
            return res.status(404).json({
                success: false,
                message: "Phòng không tồn tại hoặc đã bị xóa",
            });
        }

        if (user.role === "staff" && staff) {
            const buildingIdStr = room.buildingId?._id?.toString();
            const hasPermission = staff.assignedBuildingIds?.some(
                id => id.toString() === buildingIdStr
            );

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: "Bạn không có quyền dọn cư dân khỏi phòng thuộc tòa này",
                });
            }
        }

        const tenantObjectId = new mongoose.Types.ObjectId(accountId);
        if (!room.currentTenantIds.some(id => id.toString() === accountId)) {
            return res.status(400).json({
                success: false,
                message: "Cư dân không có trong phòng này",
            });
        }

        const initialCount = room.currentTenantIds.length;
        room.currentTenantIds.pull(tenantObjectId);

        if (room.currentTenantIds.length === 0) {
            room.status = "available";
        }

        await room.save({ session });
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: "Dọn cư dân ra khỏi phòng thành công",
            data: {
                roomId: room._id.toString(),
                roomNumber: room.roomNumber,
                buildingName: room.buildingId?.name || "Không xác định",
                removedTenantId: accountId,
                previousOccupancy: `${initialCount}/${room.maxTenants}`,
                newOccupancy: `${room.currentTenantIds.length}/${room.maxTenants}`,
            },
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("removeTenantFromRoom error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Dọn cư dân thất bại",
        });
    } finally {
        session.endSession();
    }
};
module.exports = {
    addTenantToRoom,
    removeTenantFromRoom,
    getTenants,
};