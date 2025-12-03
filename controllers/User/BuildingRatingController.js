const Building = require('../../models/Building');
const BuildingRating = require('../../models/BuildingRating');
const Room = require('../../models/Room');
const mongoose = require("mongoose");
const Staff = require('../../models/Staff');
const Notification = require('../../models/Notification');
const createOrUpdateRating = async (req, res) => {
    const { buildingId, rating, comment } = req.body;
    const userId = req.user.id;

    if (!buildingId || !rating) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu buildingId hoặc điểm đánh giá'
        });
    }

    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({
            success: false,
            message: 'Điểm đánh giá phải là số từ 1 đến 5'
        });
    }

    let imageUrls = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const maxImages = 5;
        if (req.files.length > maxImages) {
            return res.status(400).json({
                success: false,
                message: `Chỉ được upload tối đa ${maxImages} ảnh`
            });
        }

        imageUrls = req.files.map(file => file.path || file.location); // hỗ trợ cả local + cloud (S3, Cloudinary...)
    }

    try {
        const roomInBuilding = await Room.findOne({
            buildingId,
            status: 'rented',
            currentTenantIds: userId
        }).lean();

        if (!roomInBuilding) {
            return res.status(403).json({
                success: false,
                message: 'Bạn chỉ được đánh giá tòa nhà mà bạn đang ở hiện tại'
            });
        }

        const updatedRating = await BuildingRating.findOneAndUpdate(
            { buildingId, userId },
            {
                rating: ratingNum,
                comment: comment?.trim() || '',
                images: imageUrls,
                updatedAt: Date.now()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        )
            .populate({
                path: 'userId',
                select: '_id email',
                populate: {
                    path: 'userInfo',
                    select: 'fullName'
                }
            })
            .lean();

        const building = await Building.findById(buildingId).lean();
        const landlordId = building.landlordId;

        const notification = await Notification.create({
            landlordId,
            createBy: userId,
            createByRole: "resident",
            title: updatedRating.createdAt === updatedRating.updatedAt
                ? "Cư dân mới đánh giá tòa nhà"
                : "Cư dân vừa cập nhật đánh giá tòa nhà",
            content: `${updatedRating.userId?.userInfo?.fullName || "Một cư dân"} đã đánh giá tòa nhà với ${ratingNum} sao.`,
            target: { buildings: [buildingId] },
            link: `/landlord/ratings`,
        });

        const io = req.app.get("io");
        if (io) {
            const payload = {
                id: notification._id.toString(),
                title: notification.title,
                content: notification.content,
                type: notification.type,
                link: notification.link,
                createdAt: notification.createdAt,
                createBy: {
                    id: userId.toString(),
                    name: updatedRating.userId?.userInfo?.fullName,
                    role: "resident"
                }
            };

            // Gửi cho landlord
            io.to(`user:${landlordId}`).emit("new_notification", payload);

            // Gửi cho staff
            const staffList = await Staff.find({
                assignedBuildings: buildingId,
                isDeleted: false
            }).select("accountId").lean();

            staffList.forEach(staff => {
                io.to(`user:${staff.accountId}`).emit("new_notification", payload);
            });

            io.to(`user:${landlordId}`).emit("unread_count_increment", { increment: 1 });

            staffList.forEach(staff => {
                io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
            });
        }

        res.json({
            success: true,
            message: updatedRating.createdAt === updatedRating.updatedAt
                ? 'Cảm ơn bạn đã đánh giá tòa nhà!'
                : 'Đánh giá của bạn đã được cập nhật',
            data: {
                _id: updatedRating._id,
                buildingId: updatedRating.buildingId,
                rating: updatedRating.rating,
                comment: updatedRating.comment,
                images: updatedRating.images,
                user: {
                    _id: updatedRating.userId?._id?.toString(),
                    fullName: updatedRating.userId?.userInfo?.fullName,
                    email: updatedRating.userId?.email
                },
                createdAt: updatedRating.createdAt,
                updatedAt: updatedRating.updatedAt
            }
        });

    } catch (error) {
        console.error('Create/Update rating error:', error);
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã đánh giá tòa nhà này rồi. Bạn có thể chỉnh sửa đánh giá cũ.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Đã có lỗi xảy ra, vui lòng thử lại sau'
        });
    }
};
const deleteMyRating = async (req, res) => {
    const { ratingId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(ratingId)) {
        return res.status(400).json({
            success: false,
            message: 'ID đánh giá không hợp lệ'
        });
    }

    try {
        const rating = await BuildingRating.findOne({
            _id: ratingId,
            userId: userId
        });

        if (!rating) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đánh giá hoặc bạn không có quyền xóa'
            });
        }

        await BuildingRating.deleteOne({ _id: ratingId });

        res.json({
            success: true,
            message: 'Đã xóa đánh giá thành công'
        });

    } catch (error) {
        console.error('Delete rating error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống, vui lòng thử lại'
        });
    }
};
const getBuildingRatings = async (req, res) => {
    const { buildingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
        return res.status(400).json({
            success: false,
            message: 'ID tòa nhà không hợp lệ'
        });
    }
    const building = await Building.findById(buildingId).lean();
    if (!building) {
        return res.status(404).json({
            success: false,
            message: 'Không tìm thấy tòa nhà'
        });
    }

    try {
        const ratings = await BuildingRating.find({ buildingId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'userId',
                select: '_id email',
                populate: { path: 'userInfo', select: 'fullName' }
            })
            .lean();
        const total = ratings.length;
        const avgRating = total > 0
            ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
            : 0;

        const formatted = ratings.map(r => ({
            _id: r._id,
            rating: r.rating,
            comment: r.comment,
            images: r.images || [],
            createdAt: r.createdAt,
            user: {
                _id: r.userId._id.toString(),
                fullName: r.userId?.userInfo?.fullName || 'Người dùng hệ thống',
            }
        }));

        res.json({
            success: true,
            data: {
                buildingId,
                summary: {
                    totalRatings: total,
                    averageRating: avgRating,
                    star5: ratings.filter(r => r.rating === 5).length,
                    star4: ratings.filter(r => r.rating === 4).length,
                    star3: ratings.filter(r => r.rating === 3).length,
                    star2: ratings.filter(r => r.rating === 2).length,
                    star1: ratings.filter(r => r.rating === 1).length
                },
                ratings: formatted
            }
        });

    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
};

module.exports = {
    createOrUpdateRating,
    getBuildingRatings,
    deleteMyRating
};