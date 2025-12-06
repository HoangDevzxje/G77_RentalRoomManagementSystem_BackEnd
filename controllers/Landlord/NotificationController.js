const mongoose = require("mongoose");
const Notification = require("../../models/Notification");
const Building = require("../../models/Building");
const Room = require("../../models/Room");
const Floor = require("../../models/Floor");

const getBuildingIdsFromTarget = async (target) => {
    const buildingIds = new Set();

    if (target.buildings?.length) {
        target.buildings.forEach(b => buildingIds.add(b.toString()));
    }
    if (target.floors?.length) {
        const floors = await Floor.find({ _id: { $in: target.floors } }).select("buildingId").lean();
        floors.forEach(f => buildingIds.add(f.buildingId.toString()));
    }
    if (target.rooms?.length) {
        const rooms = await Room.find({ _id: { $in: target.rooms } }).select("buildingId").lean();
        rooms.forEach(r => buildingIds.add(r.buildingId.toString()));
    }
    if (target.residents?.length) {
        const rooms = await Room.find({ currentTenantIds: { $in: target.residents }, active: true })
            .select("buildingId")
            .lean();
        rooms.forEach(r => buildingIds.add(r.buildingId.toString()));
    }

    return Array.from(buildingIds);
};

const getResidentIdsFromTarget = async (target) => {
    const residentIds = new Set();

    if (target.buildings?.length) {
        const rooms = await Room.find({ buildingId: { $in: target.buildings }, active: true })
            .select("currentTenantIds")
            .lean();
        rooms.forEach(r => r.currentTenantIds?.forEach(id => residentIds.add(id.toString())));
    }
    if (target.floors?.length) {
        const rooms = await Room.find({ floorId: { $in: target.floors }, active: true })
            .select("currentTenantIds")
            .lean();
        rooms.forEach(r => r.currentTenantIds?.forEach(id => residentIds.add(id.toString())));
    }
    if (target.rooms?.length) {
        const rooms = await Room.find({ _id: { $in: target.rooms }, active: true })
            .select("currentTenantIds")
            .lean();
        rooms.forEach(r => r.currentTenantIds?.forEach(id => residentIds.add(id.toString())));
    }
    if (target.residents?.length) {
        target.residents.forEach(id => residentIds.add(id.toString()));
    }

    return Array.from(residentIds);
};
const getRecipientAdminIds = async (target) => {
    const buildingIds = await getBuildingIdsFromTarget(target);
    if (buildingIds.length === 0) return [];

    const admins = new Set();

    const buildings = await Building.find({ _id: { $in: buildingIds } })
        .select("landlordId")
        .lean();
    buildings.forEach(b => b.landlordId && admins.add(b.landlordId.toString()));

    const staffList = await Employee.find({
        assignedBuildings: { $in: buildingIds },
        isDeleted: false
    }).select("accountId").lean();
    staffList.forEach(s => admins.add(s.accountId.toString()));

    return Array.from(admins);
};
const createNotification = async (req, res) => {
    const user = req.user;
    const isLandlord = user.role === "landlord";
    const isStaff = user.role === "staff";

    if (!isLandlord && !isStaff) {
        return res.status(403).json({ message: "Không có quyền tạo thông báo" });
    }

    const { title, content, type = "general", target } = req.body;
    if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ message: "Thiếu tiêu đề hoặc nội dung" });
    }
    if (!target || Object.values(JSON.parse(target)).every(arr => !arr?.length)) {
        return res.status(400).json({ message: "Phải chọn ít nhất một người nhận" });
    }

    let parsedTarget;
    try {
        parsedTarget = typeof target === "string" ? JSON.parse(target) : target;
    } catch (e) {
        return res.status(400).json({ message: "Target không đúng định dạng JSON" });
    }

    try {
        const imageUrls = req.files?.map(file => file.path) || [];
        let allowedBuildingIds = [];
        let landlordId;

        if (isLandlord) {
            const buildings = await Building.find({ landlordId: user._id, isDeleted: false }).select("_id");
            allowedBuildingIds = buildings.map(b => b._id.toString());
            landlordId = user._id;
        } else if (isStaff && req.staff) {
            allowedBuildingIds = req.staff.assignedBuildingIds?.map(id => id.toString()) || [];
            landlordId = req.staff.landlordId;
            if (allowedBuildingIds.length === 0) {
                return res.status(403).json({ message: "Bạn chưa được phân công tòa nhà nào" });
            }
        }

        const targetBuildingIds = await getBuildingIdsFromTarget(parsedTarget);
        if (targetBuildingIds.length > 0 && !targetBuildingIds.every(id => allowedBuildingIds.includes(id))) {
            return res.status(403).json({ message: "Bạn không quản lý một số tòa nhà được chọn" });
        }

        const notification = await Notification.create({
            landlordId,
            createBy: user._id,
            createByRole: isLandlord ? "landlord" : "staff",
            title: title.trim(),
            content: content.trim(),
            type,
            target: parsedTarget,
            images: imageUrls
        });

        const io = req.app.get("io");
        const payload = {
            id: notification._id.toString(),
            title: notification.title,
            content: notification.content,
            type: notification.type,
            images: notification.images,
            createdAt: notification.createdAt,
            createBy: {
                id: user._id.toString(),
                name: user.fullName || user.username,
                role: user.role
            }
        };

        // REALTIME EMIT – CHUẨN 100%
        if (io) {
            let recipientIds = [];

            if (user.role === "resident") {
                // Resident gửi → landlord + staff nhận
                recipientIds = await getRecipientAdminIds(parsedTarget);
            } else {
                // Landlord/Staff gửi → cư dân nhận
                recipientIds = await getResidentIdsFromTarget(parsedTarget);
            }

            recipientIds.forEach(uid => {
                io.to(`user:${uid}`).emit("new_notification", payload);

                // Chỉ tăng unread khi admin gửi cho cư dân
                if (user.role !== "resident") {
                    io.to(`user:${uid}`).emit("unread_count_increment", { increment: 1 });
                }
            });
        }

        return res.status(201).json({
            success: true,
            message: "Gửi thông báo thành công",
            data: notification
        });

    } catch (error) {
        console.error("Create notification error:", error.message);
        return res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const getMyNotifications = async (req, res) => {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    try {
        let matchQuery = { isDeleted: false };
        if (user.role === "resident") {
            const rooms = await Room.find({
                currentTenantIds: user._id,
                active: true,
                isDeleted: { $ne: true }
            }).select("buildingId floorId _id").lean();

            const buildingIds = rooms.map(r => r.buildingId);
            const floorIds = rooms.map(r => r.floorId).filter(Boolean);
            const roomIds = rooms.map(r => r._id);

            const baseConditions = {
                isDeleted: false,
                createByRole: { $in: ["landlord", "staff", "system"] }
            };

            const targetConditions = [
                { "target.residents": user._id },
            ];

            if (buildingIds.length > 0) {
                targetConditions.push(
                    { "target.buildings": { $in: buildingIds } },
                    { "target.floors": { $in: floorIds } },
                    { "target.rooms": { $in: roomIds } }
                );
            }

            matchQuery = {
                ...baseConditions,
                $or: targetConditions
            };
        }
        else if (user.role === "landlord") {
            const buildings = await Building.find({
                landlordId: user._id,
                isDeleted: { $ne: true }
            }).select("_id").lean();
            const buildingIds = buildings.map(b => b._id);

            const floors = await Floor.find({
                buildingId: { $in: buildingIds },
                isDeleted: { $ne: true }
            }).select("_id").lean();

            const rooms = await Room.find({
                buildingId: { $in: buildingIds },
                active: true,
                isDeleted: { $ne: true }
            }).select("_id").lean();

            const floorIds = floors.map(f => f._id);
            const roomIds = rooms.map(r => r._id);

            matchQuery = {
                createByRole: { $in: ["resident", "system"] },
                $or: [
                    { "target.buildings": { $in: buildingIds } },
                    { "target.floors": { $in: floorIds } },
                    { "target.rooms": { $in: roomIds } },
                    { "target.residents": user._id }
                ]
            };
        }
        else if (user.role === "staff" && req.staff) {

            const buildingIds = req.staff.assignedBuildingIds.map(id => new mongoose.Types.ObjectId(id));

            const floors = await Floor.find({ buildingId: { $in: buildingIds }, isDeleted: { $ne: true } }).select("_id").lean();
            const floorIds = floors.map(f => f._id);

            const rooms = await Room.find({ buildingId: { $in: buildingIds }, isDeleted: { $ne: true }, active: true }).select("_id").lean();
            const roomIds = rooms.map(r => r._id);


            matchQuery = {
                landlordId: req.staff.landlordId,
                createByRole: { $in: ["resident", "system"] },
                $or: [
                    { "target.buildings": { $in: buildingIds } },
                    { "target.floors": { $in: floorIds } },
                    { "target.rooms": { $in: roomIds } },
                    { "target.residents": user._id }
                ]
            };

        }
        else {
            return res.json({ success: true, data: [], pagination: { total: 0, page, limit, pages: 0 } });
        }


        const [notifications, total] = await Promise.all([
            Notification.find(matchQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "createBy",
                    select: "email userInfo",
                    populate: {
                        path: "userInfo",
                        model: "UserInformation",
                        select: "fullName phoneNumber",
                    }
                })
                .lean(),
            Notification.countDocuments(matchQuery)
        ]);

        const result = notifications.map(noti => ({
            ...noti,
            id: noti._id.toString(),
            isRead: noti.readBy?.some(r => r.accountId?.toString() === user._id.toString())
        }));

        res.json({
            success: true,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            data: result
        });

    } catch (error) {
        console.error("getMyNotifications error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const markAsRead = async (req, res) => {
    const user = req.user;
    const { notificationIds } = req.body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(400).json({ message: "notificationIds phải là mảng không rỗng" });
    }

    try {
        await Notification.updateMany(
            {
                _id: { $in: notificationIds },
                "readBy.accountId": { $ne: user._id }
            },
            {
                $push: { readBy: { accountId: user._id, readAt: new Date() } }
            }
        );

        const io = req.app.get("io");
        if (io) {
            io.to(`user:${user._id}`).emit("unread_count_update", {
                decrement: notificationIds.length
            });
        }

        res.json({ success: true, message: "Đã đánh dấu đã đọc" });
    } catch (error) {
        console.error("markAsRead error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
const updateNotification = async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;
    const user = req.user;

    try {
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const noti = await Notification.findById(id);
        if (!noti || noti.isDeleted) return res.status(404).json({ message: "Thông báo không tồn tại" });

        const isLandlord = user.role === "landlord";
        const isStaff = user.role === "staff";
        const isCreator = noti.createBy.toString() === user._id.toString();

        if (
            !(isLandlord || (isStaff && isCreator))
        ) {
            return res.status(403).json({ message: "Không có quyền sửa" });
        }


        if (isStaff && req.staff) {
            const managedBuildingIds = req.staff.assignedBuildingIds?.map(id => id.toString()) || [];
            const targetBuildingIds = await getBuildingIdsFromTarget(noti.target);

            if (!targetBuildingIds.every(bid => managedBuildingIds.includes(bid))) {
                return res.status(403).json({ message: "Bạn không quản lý các tòa nhà trong thông báo này" });
            }
        }

        const minutesPassed = (Date.now() - noti.createdAt) / 60000;
        if (minutesPassed > 10) {
            return res.status(403).json({ message: "Chỉ được sửa trong 10 phút đầu" });
        }

        if (title) noti.title = title.trim();
        if (content) noti.content = content.trim();

        const newImageUrls = req.files?.map(file => file.path) || [];
        if (newImageUrls.length > 0) {
            noti.images = [...noti.images, ...newImageUrls];
        }
        noti.updatedAt = Date.now();
        await noti.save();

        const io = req.app.get("io");
        if (io) {
            const payload = {
                id: noti._id.toString(),
                title: noti.title,
                content: noti.content,
                images: noti.images,
                updated: true,
                updatedAt: noti.updatedAt
            };

            let recipientIds = [];

            if (noti.createByRole === "resident") {
                // Thông báo do resident tạo → landlord + staff nhận update
                recipientIds = await getRecipientAdminIds(noti.target);
            } else {
                // Thông báo do landlord/staff tạo → cư dân nhận update
                recipientIds = await getResidentIdsFromTarget(noti.target);
            }

            recipientIds.forEach(uid => {
                io.to(`user:${uid}`).emit("notification_updated", payload);
            });
        }
        // =====================================================================
        res.json({ success: true, message: "Cập nhật thành công", data: noti });
    } catch (error) {
        console.error("updateNotification error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
const deleteNotification = async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    try {
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const noti = await Notification.findById(id);
        if (!noti) {
            return res.status(404).json({ message: "Không tìm thấy thông báo" });
        }

        const isLandlord = user.role === "landlord";
        const isStaff = user.role === "staff";

        if (!isLandlord && !isStaff) {
            return res.status(403).json({ message: "Không có quyền xóa" });
        }

        if (isStaff && req.staff) {
            const managedBuildingIds = req.staff.assignedBuildingIds?.map(id => id.toString()) || [];
            const targetBuildingIds = await getBuildingIdsFromTarget(noti.target);

            if (noti.createBy.toString() !== user._id.toString()) {
                return res.status(403).json({ message: "Chỉ có thể xóa thông báo do bạn tạo" });
            }

            if (!targetBuildingIds.every(bid => managedBuildingIds.includes(bid))) {
                return res.status(403).json({ message: "Bạn không quản lý các tòa nhà trong thông báo này" });
            }
        }

        await Notification.findByIdAndDelete(id);

        res.json({ success: true, message: "Xóa thông báo thành công" });
    } catch (error) {
        console.error("deleteNotification error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const getNotificationById = async (req, res) => {
    const { id } = req.params;
    try {
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const noti = await Notification.findById(id)
            .populate("createBy", "fullName username avatar")
            .lean();

        if (!noti || noti.isDeleted) return res.status(404).json({ message: "Không tìm thấy" });

        res.json({ success: true, data: { ...noti, id: noti._id.toString() } });
    } catch (error) {
        console.error("getNotificationById error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
const getMySentNotifications = async (req, res) => {
    const user = req.user;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filterBuildingId = req.query.buildingId
        ? new mongoose.Types.ObjectId(req.query.buildingId)
        : null;

    if (!["landlord", "staff"].includes(user.role)) {
        return res.status(403).json({ message: "Không có quyền" });
    }

    try {
        let managedBuildingIds = [];

        if (user.role === "landlord") {
            managedBuildingIds = await Building.find({
                landlordId: user._id,
                isDeleted: false
            }).distinct("_id");
        } else {
            managedBuildingIds = (req.staff?.assignedBuildingIds || [])
                .map(id => new mongoose.Types.ObjectId(id));
        }

        if (managedBuildingIds.length === 0) {
            return res.json({
                success: true,
                data: [],
                pagination: { total: 0, page, limit }
            });
        }

        if (filterBuildingId && !managedBuildingIds.some(id => id.equals(filterBuildingId))) {
            return res.status(403).json({ message: "Bạn không quản lý tòa nhà này" });
        }

        const filterBuildings = filterBuildingId
            ? [filterBuildingId]
            : managedBuildingIds;

        const floorIds = await Floor.find({ buildingId: { $in: filterBuildings } }).distinct("_id");
        const roomIds = await Room.find({ buildingId: { $in: filterBuildings } }).distinct("_id");
        const residentIds = await Room.find({ buildingId: { $in: filterBuildings } }).distinct("currentTenantIds");

        const matchQuery = {
            landlordId: user.role === "landlord" ? user._id : req.staff.landlordId,
            isDeleted: false,
            createByRole: { $in: ["landlord", "staff"] },
            $or: [
                { "target.buildings": { $in: filterBuildings } },
                { "target.floors": { $in: floorIds } },
                { "target.rooms": { $in: roomIds } },
                { "target.residents": { $in: residentIds.flat() } }
            ]
        };

        const [notifications, total] = await Promise.all([
            Notification.find(matchQuery)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: "createBy",
                    select: "email userInfo",
                    populate: {
                        path: "userInfo",
                        model: "UserInformation",
                        select: "fullName phoneNumber"
                    },
                })
                .lean(),

            Notification.countDocuments(matchQuery)
        ]);

        const result = notifications.map(noti => ({
            ...noti,
            id: noti._id.toString(),
            stats: { readCount: noti.readBy?.length || 0 }
        }));

        res.json({
            success: true,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            data: result
        });
    } catch (error) {
        console.error("getMySentNotifications error:", error.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
const getUnreadCount = async (req, res) => {
    const user = req.user;
    try {
        let matchQuery = { isDeleted: false };

        if (user.role === "resident") {
            const rooms = await Room.find({
                currentTenantIds: user._id,
                active: true,
                isDeleted: { $ne: true }
            }).select("buildingId floorId _id").lean();

            if (!rooms.length) {
                return res.json({ success: true, unreadCount: 0 });
            }

            const buildingIds = rooms.map(r => r.buildingId);
            const floorIds = rooms.map(r => r.floorId).filter(Boolean);
            const roomIds = rooms.map(r => r._id);

            const building = await Building.findById(buildingIds[0]).select("landlordId").lean();
            const landlordId = building?.landlordId;

            matchQuery = {
                landlordId,
                "readBy.accountId": { $ne: user._id },
                $or: [
                    { "target.buildings": { $in: buildingIds } },
                    { "target.floors": { $in: floorIds } },
                    { "target.rooms": { $in: roomIds } },
                    { "target.residents": user._id }
                ]
            };
        }
        else if (user.role === "landlord") {
            matchQuery = {
                landlordId: user._id,
                createByRole: "resident",
                "readBy.accountId": { $ne: user._id }
            };
        }
        else if (user.role === "staff" && req.staff) {
            const buildingIds = req.staff.assignedBuildingIds.map(id => new mongoose.Types.ObjectId(id));

            const floors = await Floor.find({ buildingId: { $in: buildingIds } }).select("_id").lean();
            const floorIds = floors.map(f => f._id);

            const rooms = await Room.find({ buildingId: { $in: buildingIds }, active: true }).select("_id").lean();
            const roomIds = rooms.map(r => r._id);

            matchQuery = {
                landlordId: req.staff.landlordId,
                createByRole: "resident",
                "readBy.accountId": { $ne: user._id },
                $or: [
                    { "target.buildings": { $in: buildingIds } },
                    { "target.floors": { $in: floorIds } },
                    { "target.rooms": { $in: roomIds } }
                ]
            };
        }
        else {
            return res.json({ success: true, unreadCount: 0 });
        }

        const unreadCount = await Notification.countDocuments(matchQuery);
        res.json({
            success: true,
            unreadCount
        });

    } catch (error) {
        console.error("getUnreadCount error:", error);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};


module.exports = {
    createNotification,
    getMyNotifications,
    markAsRead,
    updateNotification,
    deleteNotification,
    getNotificationById,
    getMySentNotifications,
    getUnreadCount
};