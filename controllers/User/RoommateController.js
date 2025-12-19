const Room = require('../../models/Room');
const Account = require('../../models/Account');
const mongoose = require("mongoose");
const Notification = require('../../models/Notification');
const addRoommate = async (req, res) => {
    let { roomId, userIds } = req.body;
    const requesterId = req.user.id;

    if (!roomId || !userIds) {
        return res.status(400).json({ message: 'Thiếu roomId hoặc userIds' });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({ message: 'roomId không hợp lệ' });
    }
    if (!Array.isArray(userIds)) {
        userIds = [userIds];
    }

    if (userIds.length === 0) {
        return res.status(400).json({ message: 'Danh sách người thêm trống' });
    }

    if (userIds.includes(requesterId)) {
        return res.status(400).json({ message: 'Không thể thêm chính mình vào danh sách' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const room = await Room.findOne({
            _id: roomId,
            status: 'rented',
            currentTenantIds: requesterId
        }).populate('buildingId', "landlordId")
            .session(session);

        if (!room) {
            return res.status(403).json({
                message: 'Phòng không tồn tại hoặc bạn không ở trong phòng này'
            });
        }

        if (room.currentTenantIds[0]?.toString() !== requesterId) {
            return res.status(403).json({
                message: 'Chỉ người đứng tên hợp đồng mới được thêm người ở cùng'
            });
        }

        const willAddCount = userIds.length;
        const currentCount = room.currentTenantIds.length;
        if (currentCount + willAddCount > room.maxTenants) {
            return res.status(400).json({
                message: `Phòng chỉ cho phép tối đa ${room.maxTenants} người. Hiện tại: ${currentCount}, muốn thêm: ${willAddCount}`
            });
        }

        const usersToAdd = await Account.find({
            _id: { $in: userIds },
            role: 'resident',
            isActivated: true
        }).session(session);

        if (usersToAdd.length !== userIds.length) {
            return res.status(400).json({
                message: 'Một số người không tồn tại hoặc tài khoản chưa kích hoạt'
            });
        }

        const conflictRooms = await Room.find({
            status: 'rented',
            currentTenantIds: { $in: userIds },
            _id: { $ne: roomId }
        }).session(session);

        if (conflictRooms.length > 0) {
            const conflictNumbers = conflictRooms.map(r => r.roomNumber).join(', ');
            return res.status(400).json({
                message: `Có người đang ở phòng khác: ${conflictNumbers}`
            });
        }

        const alreadyInRoom = userIds.filter(id =>
            room.currentTenantIds.some(existingId => existingId.toString() === id)
        );

        if (alreadyInRoom.length > 0) {
            return res.status(400).json({
                message: 'Một số người đã có trong phòng rồi'
            });
        }

        room.currentTenantIds.push(...userIds);
        await room.save({ session });

        const requester = await Account.findById(requesterId)
            .populate("userInfo", "fullName")
            .lean();
        const affectedTenantIds = [...userIds];

        const notification = await Notification.create({
            landlordId: room.buildingId.landlordId,
            createByRole: "system",
            title: "Bạn được thêm vào phòng",
            content: `${requester.userInfo?.fullName} đã thêm bạn vào phòng ${room.roomNumber}`,
            target: { residents: [affectedTenantIds] },
        });

        const io = req.app.get("io");
        if (io) {
            const payload = {
                id: notification._id.toString(),
                title: notification.title,
                content: notification.content,
                link: notification.link,
                createdAt: notification.createdAt,
                createBy: {
                    id: requesterId,
                    name: requester.userInfo?.fullName,
                    role: "system"
                }
            };

            affectedTenantIds.forEach(tenantId => {
                io.to(`user:${tenantId}`).emit("new_notification", payload);
                io.to(`user:${tenantId}`).emit("unread_count_increment", { increment: 1 });
            });
        }
        await session.commitTransaction();

        return res.json({
            success: true,
            message: `Đã thêm thành công ${userIds.length} người vào phòng`,
            data: {
                roomNumber: room.roomNumber,
                addedCount: userIds.length,
                currentCount: room.currentTenantIds.length,
                maxTenants: room.maxTenants
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Add roommates error:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống, vui lòng thử lại' });
    } finally {
        session.endSession();
    }
};

const removeRoommate = async (req, res) => {
    let { roomId, userIds } = req.body;
    const requesterId = req.user.id;

    if (!roomId || !userIds) {
        return res.status(400).json({ message: 'Thiếu roomId hoặc userIds' });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
        return res.status(400).json({ message: 'roomId không hợp lệ' });
    }
    if (!Array.isArray(userIds)) {
        userIds = [userIds];
    }

    if (userIds.length === 0) {
        return res.status(400).json({ message: 'Danh sách người cần xóa trống' });
    }

    if (userIds.includes(requesterId)) {
        return res.status(400).json({ message: 'Không thể tự xóa chính mình khỏi phòng' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const room = await Room.findOne({
            _id: roomId,
            status: 'rented',
            currentTenantIds: requesterId
        }).populate("buildingId", "landlordId")
            .session(session);

        if (!room) {
            return res.status(403).json({
                message: 'Phòng không tồn tại hoặc bạn không ở trong phòng này'
            });
        }

        if (room.currentTenantIds[0]?.toString() !== requesterId) {
            return res.status(403).json({
                message: 'Chỉ người đứng tên hợp đồng mới được xóa người ở cùng'
            });
        }

        const invalidUserIds = userIds.filter(id =>
            !room.currentTenantIds.some(existingId => existingId.toString() === id)
        );

        if (invalidUserIds.length > 0) {
            return res.status(400).json({
                message: 'Một số người không có trong phòng này'
            });
        }

        room.currentTenantIds = room.currentTenantIds.filter(
            id => !userIds.includes(id.toString())
        );

        await room.save({ session });
        const requester = await Account.findById(requesterId)
            .populate("userInfo", "fullName")
            .lean();
        const affectedTenantIds = [...userIds];

        const notification = await Notification.create({
            landlordId: room.buildingId.landlordId,
            createByRole: "system",
            title: "Bạn bị xóa khỏi phòng",
            content: `${requester.userInfo?.fullName} đã xóa bạn khỏi phòng ${room.roomNumber}`,
            target: { residents: [affectedTenantIds] },
        });

        const io = req.app.get("io");
        if (io) {
            const payload = {
                id: notification._id.toString(),
                title: notification.title,
                content: notification.content,
                link: notification.link,
                createdAt: notification.createdAt,
                createBy: {
                    id: requesterId,
                    name: requester.userInfo?.fullName,
                    role: "system"
                }
            };

            affectedTenantIds.forEach(tenantId => {
                io.to(`user:${tenantId}`).emit("new_notification", payload);
                io.to(`user:${tenantId}`).emit("unread_count_increment", { increment: 1 });
            });
        }
        await session.commitTransaction();

        return res.json({
            success: true,
            message: `Đã xóa thành công ${userIds.length} người khỏi phòng`,
            data: {
                roomNumber: room.roomNumber,
                removedCount: userIds.length,
                currentCount: room.currentTenantIds.length,
                maxTenants: room.maxTenants
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Remove roommate error:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống, vui lòng thử lại' });
    } finally {
        session.endSession();
    }
};

const searchUser = async (req, res) => {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập ít nhất 2 ký tự'
        });
    }

    try {
        const users = await Account.find({
            email: { $regex: q.trim(), $options: 'i' },
            role: 'resident',
            isActivated: true
        })
            .select('email')
            .populate({
                path: 'userInfo',
                select: 'fullName phoneNumber',
                match: { fullName: { $exists: true } }
            })
            .limit(10)
            .lean();

        const results = users
            .filter(user => user.userInfo)
            .map(user => ({
                _id: user._id,
                email: user.email,
                fullName: user.userInfo.fullName || 'Chưa đặt tên',
                phoneNumber: user.userInfo.phoneNumber || null,
            }));

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Search user error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi tìm kiếm'
        });
    }
};

const getMyRoommates = async (req, res) => {
    const { roomId } = req.params;
    const userId = req.user.id;

    try {
        if (!roomId) {
            return res.status(400).json({ message: 'Thiếu roomId' });
        }
        if (!mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ message: 'roomId không hợp lệ' });
        }
        const room = await Room.findById(roomId)
            .populate({
                path: 'currentTenantIds',
                select: '-password -passwordResetToken -passwordResetExpires -accessToken -refreshToken',
                populate: {
                    path: 'userInfo',
                    select: 'fullName phoneNumber dob gender address avatar',
                    model: 'UserInformation'
                }
            });

        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }

        const isInRoom = room.currentTenantIds.some(
            tenant => tenant._id.toString() === userId
        );

        if (!isInRoom) {
            return res.status(403).json({ message: 'Bạn không thuộc phòng này' });
        }

        const mainTenantId = room.currentTenantIds[0]?._id.toString();
        const isMainTenant = mainTenantId === userId;

        const roommates = room.currentTenantIds.map((tenant, index) => {
            const info = tenant.userInfo || {};
            return {
                _id: tenant._id,
                email: tenant.email,
                fullName: info.fullName || 'Chưa cập nhật',
                phoneNumber: info.phoneNumber || 'Chưa cập nhật',
                dob: info.dob || 'Chưa cập nhật',
                gender: info.gender || 'Chưa cập nhật',
                address: info.address || 'Chưa cập nhật',
                avatar: info.avatar || 'Chưa cập nhật',
                isMainTenant: index === 0,
                isMe: tenant._id.toString() === userId,
            };
        });

        res.json({
            success: true,
            data: {
                roomNumber: room.roomNumber,
                maxTenants: room.maxTenants,
                currentCount: room.currentTenantIds.length,
                canAddMore: isMainTenant && room.currentTenantIds.length < room.maxTenants,
                isMainTenant,
                roommates
            }
        });

    } catch (error) {
        console.error('getMyRoommates error:', error);
        res.status(500).json({ message: 'Lỗi hệ thống' });
    }
};
const getRoommateDetail = async (req, res) => {
    const { userId } = req.params;
    const requesterId = req.user.id;

    try {
        if (!userId) {
            return res.status(400).json({ message: 'Thiếu userId' });
        }
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'userId không hợp lệ' });
        }
        const room = await Room.findOne({
            status: 'rented',
            currentTenantIds: { $all: [requesterId, userId] }
        });

        if (!room) {
            return res.status(403).json({
                message: 'Bạn chỉ được xem thông tin của người đang ở chung phòng'
            });
        }

        const account = await Account.findById(userId)
            .select('-password -passwordResetToken -passwordResetExpires -accessToken -refreshToken -__v')
            .populate({
                path: 'userInfo',
                select: 'fullName phoneNumber dob gender address'
            });

        if (!account) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng' });
        }

        const isMainTenant = room.currentTenantIds[0]?.toString() === userId;

        res.json({
            success: true,
            data: {
                _id: account._id,
                email: account.email,
                isMainTenant,
                userInfo: account.userInfo || {
                    fullName: 'Chưa cập nhật',
                    phoneNumber: 'Chưa cập nhật',
                    dob: 'Chưa cập nhật',
                    gender: 'Chưa cập nhật',
                    address: 'Chưa cập nhật'
                }
            }
        });

    } catch (error) {
        console.error('Get roommate detail error:', error);
        res.status(500).json({ message: 'Lỗi hệ thống' });
    }
};

module.exports = {
    addRoommate,
    removeRoommate,
    searchUser,
    getMyRoommates,
    getRoommateDetail
};