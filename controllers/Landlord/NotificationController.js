const mongoose = require("mongoose");
const Notification = require("../../models/Notification");
const Building = require("../../models/Building");
const Room = require("../../models/Room");
const getLandlordIdsFromBuildings = async (buildingIds) => {
    if (!buildingIds.length) return [];
    const landlords = await Building.find({ _id: { $in: buildingIds } })
        .distinct("landlordId")
        .lean();
    return landlords.map(id => id.toString());
};

const createNotification = async (req, res) => {
    const user = req.user;
    const isLandlord = user.role === "landlord";
    const isStaff = user.role === "staff";

    if (!isLandlord && !isStaff) {
        return res.status(403).json({ message: "Không có quyền tạo thông báo" });
    }

    const { title, content, type = "general", scope, buildingId, floorId, roomId, residentId } = req.body;

    if (!title?.trim() || !content?.trim() || !scope) {
        return res.status(400).json({ message: "Thiếu title, content hoặc scope" });
    }

    try {
        let allowedBuildingIds = [];
        let landlordId;

        if (isLandlord) {
            const buildings = await Building.find({ landlordId: user._id, isDeleted: false }).select("_id");
            allowedBuildingIds = buildings.map(b => b._id.toString());
            landlordId = user._id;
        } else if (isStaff && req.staff) {
            allowedBuildingIds = req.staff.assignedBuildingIds || [];
            landlordId = req.staff.landlordId;
            if (allowedBuildingIds.length === 0) {
                return res.status(403).json({ message: "Bạn chưa được phân công tòa nhà nào" });
            }
        }

        // === KIỂM TRA QUYỀN THEO SCOPE ===
        if (scope === "all" && !isLandlord) {
            return res.status(403).json({ message: "Chỉ chủ trọ được gửi toàn hệ thống" });
        }

        if (scope === "staff_buildings" && !isStaff) {
            return res.status(403).json({ message: "Chỉ nhân viên mới được dùng tính năng này" });
        }

        if (["building", "floor", "room"].includes(scope)) {
            const targetBuildingId = (buildingId || roomId || floorId)?.toString();
            if (!targetBuildingId || !allowedBuildingIds.includes(targetBuildingId)) {
                return res.status(403).json({ message: "Bạn không quản lý tòa nhà này" });
            }
        }

        // === TẠO DỮ LIỆU THÔNG BÁO ===
        const notiData = {
            landlordId,
            createBy: user._id,
            createByRole: isLandlord ? "landlord" : "staff",
            title: title.trim(),
            content: content.trim(),
            type,
            scope,
            buildingId: ["building", "floor", "room"].includes(scope) ? buildingId : undefined,
            floorId: floorId || undefined,
            roomId: roomId || undefined,
            residentId: scope === "resident" ? residentId : undefined,
        };

        if (scope === "staff_buildings") {
            notiData.buildingIds = allowedBuildingIds.map(id => new mongoose.Types.ObjectId(id));
        }

        const notification = await Notification.create(notiData);

        // === REALTIME EMIT ===
        const payload = {
            id: notification.id,
            title: notification.title,
            content: notification.content,
            type: notification.type,
            scope: notification.scope,
            createdAt: notification.createdAt,
            createBy: {
                id: user._id.toString(),
                name: user.fullName || user.username,
                role: user.role,
            },
        };

        const io = req.app.get("io");
        if (!io) {
            console.warn("Socket.IO chưa sẵn sàng, thông báo vẫn được lưu");
        } else {
            if (scope === "all") {
                io.to(`landlord:${landlordId}`).emit("new_notification", payload);
            } else if (scope === "staff_buildings") {
                allowedBuildingIds.forEach(bid => {
                    io.to(`building:${bid}`).emit("new_notification", payload);
                });
            } else if (scope === "building" && buildingId) {
                io.to(`building:${buildingId}`).emit("new_notification", payload);
            } else if (scope === "floor" && floorId) {
                io.to(`floor:${floorId}`).emit("new_notification", payload);
            } else if (scope === "room" && roomId) {
                io.to(`room:${roomId}`).emit("new_notification", payload);
            } else if (scope === "resident" && residentId) {
                io.to(`user:${residentId}`).emit("new_notification", payload);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Gửi thông báo thành công",
            data: notification,
        });
    } catch (error) {
        console.error("Create notification error:", error);
        return res.status(500).json({ message: "Lỗi server" });
    }
};
const updateNotification = async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    const { title, content } = req.body;

    try {
        const noti = await Notification.findById(id);
        if (!noti || noti.isDeleted) {
            return res.status(404).json({ message: "Thông báo không tồn tại" });
        }

        const isLandlord = user.role === "landlord";
        const isCreator = noti.createBy.toString() === user._id.toString();

        if (!isLandlord && !isCreator) {
            return res.status(403).json({ message: "Bạn không phải người tạo thông báo" });
        }

        // === CHỈ CHO SỬA TRONG 10 PHÚT ĐẦU ===
        const minutesPassed = (Date.now() - noti.createdAt) / 60000;
        if (minutesPassed > 10 && !isLandlord) {
            return res.status(403).json({
                message: "Chỉ được chỉnh sửa thông báo trong 10 phút đầu",
                canEditByLandlord: isLandlord,
            });
        }

        if (title) noti.title = title.trim();
        if (content) noti.content = content.trim();

        noti.updatedAt = Date.now();
        await noti.save();

        // === GỬI LẠI REALTIME CHO NHỮNG NGƯỜI ĐÃ NHẬN ===
        const io = req.app.get("io");
        const payload = {
            id: noti.id,
            title: noti.title,
            content: noti.content,
            updated: true,
            updatedAt: noti.updatedAt,
        };

        if (noti.scope === "all") {
            io.to(`landlord:${noti.landlordId}`).emit("notification_updated", payload);
        } else if (noti.scope === "staff_buildings") {
            noti.buildingIds.forEach(bid => {
                io.to(`building:${bid}`).emit("notification_updated", payload);
            });
        } else if (noti.scope === "building" && noti.buildingId) {
            io.to(`building:${noti.buildingId}`).emit("notification_updated", payload);
        } else if (noti.scope === "floor" && noti.floorId) {
            io.to(`floor:${noti.floorId}`).emit("new_notification", payload);
        } else if (noti.scope === "room" && noti.roomId) {
            io.to(`room:${noti.roomId}`).emit("new_notification", payload);
        } else if (noti.scope === "resident" && residentId) {
            io.to(`user:${noti.residentId}`).emit("new_notification", payload);
        }

        return res.json({
            success: true,
            message: "Cập nhật thông báo thành công",
            data: noti,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Lỗi server" });
    }
};

const getMyNotifications = async (req, res) => {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = { isDeleted: false };

    try {
        if (user.role === "resident") {
            const rooms = await Room.find({ currentTenantIds: user._id, active: true })
                .select("buildingId floorId")
                .lean();

            const buildingIds = rooms.map(r => r.buildingId.toString());
            const floorIds = rooms.map(r => r.floorId?.toString()).filter(Boolean);
            const roomIds = rooms.map(r => r._id.toString());

            query = {
                $or: [
                    { scope: "all", landlordId: { $in: await getLandlordIdsFromBuildings(buildingIds) } },
                    { scope: "staff_buildings", buildingIds: { $in: buildingIds } },
                    { scope: "building", buildingId: { $in: buildingIds } },
                    { scope: "floor", floorId: { $in: floorIds } },
                    { scope: "room", roomId: { $in: roomIds } },
                    { scope: "resident", residentId: user._id },
                ],
            };
        } else if (user.role === "landlord") {
            query.landlordId = user._id;
        } else if (user.role === "staff" && req.staff) {
            query.landlordId = req.staff.landlordId;

            const buildingObjIds = req.staff.assignedBuildingIds.map(id => new mongoose.Types.ObjectId(id));

            query.$or = [
                { scope: "staff_buildings", buildingIds: { $in: buildingObjIds } },
                { scope: "building", buildingId: { $in: buildingObjIds } },
                { scope: { $in: ["floor", "room", "resident"] }, buildingId: { $in: buildingObjIds } },
            ];
        }

        const [notifications, total] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "createBy",
                    select: "email",
                    populate: {
                        path: "userInfo",
                        model: "UserInformation",
                        select: "fullName phoneNumber",
                    },
                })
                .lean(),
            Notification.countDocuments(query),
        ]);

        const result = notifications.map(noti => ({
            ...noti,
            isRead: user.role === "resident"
                ? noti.readBy?.some(r => r.residentId.toString() === user._id.toString())
                : true,
        }));

        res.json({
            success: true,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            data: result,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi server" });
    }
};

const markAsRead = async (req, res) => {
    if (req.user.role !== "resident") {
        return res.status(403).json({ message: "Chỉ người thuê mới được đánh dấu đã đọc" });
    }

    const { notificationIds } = req.body;
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ message: "notificationIds phải là mảng" });
    }

    try {
        await Notification.updateMany(
            {
                _id: { $in: notificationIds },
                "readBy.residentId": { $ne: req.user._id },
            },
            {
                $push: {
                    readBy: { residentId: req.user._id, readAt: new Date() },
                },
            }
        );

        return res.json({ success: true, message: "Đã đánh dấu đã đọc" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Lỗi server" });
    }
};

const deleteNotification = async (req, res) => {
    const user = req.user;
    const { id } = req.params;

    try {
        const noti = await Notification.findById(id);
        if (!noti || noti.isDeleted) {
            return res.status(404).json({ message: "Thông báo không tồn tại" });
        }

        const isLandlord = user.role === "landlord";
        const isOwner = noti.landlordId.toString() === user._id.toString();
        const isCreator = noti.createBy.toString() === user._id.toString();

        if (!isLandlord && !isOwner) {
            return res.status(403).json({ message: "Không có quyền xóa" });
        }

        if (!isLandlord && req.staff) {
            const buildingId = noti.buildingId?.toString();
            if (buildingId && !req.staff.assignedBuildingIds.includes(buildingId) && !isCreator) {
                return res.status(403).json({ message: "Bạn không quản lý tòa nhà này" });
            }
        }

        await Notification.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() });

        return res.json({ success: true, message: "Xóa thông báo thành công" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Lỗi server" });
    }
};

const getNotificationById = async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
        const noti = await Notification.findById(id)
            .populate("createBy", "fullName username avatar")
            .lean();

        if (!noti || noti.isDeleted) {
            return res.status(404).json({ message: "Không tìm thấy thông báo" });
        }

        if (user.role === "staff" && req.staff) {
            if (noti.buildingId && !req.staff.assignedBuildingIds.includes(noti.buildingId.toString())) {
                return res.status(403).json({ message: "Không có quyền xem" });
            }
        }

        return res.json({ success: true, data: noti });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Lỗi server" });
    }
};
module.exports = {
    createNotification,
    getMyNotifications,
    markAsRead,
    deleteNotification,
    getNotificationById,
    updateNotification
};