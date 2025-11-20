const BuildingRating = require('../../models/BuildingRating');
const Building = require('../../models/Building');
const mongoose = require('mongoose');

const getRatingsByBuilding = async (req, res) => {
    const { buildingId } = req.query;

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 20;
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    const skip = (page - 1) * limit;

    const user = req.user;
    const isLandlord = user.role === 'landlord';
    const isStaff = user.role === 'staff';

    try {
        let query = {};
        let allowedBuildingIds = [];

        if (isLandlord) {
            const ownedBuildings = await Building.find({
                landlordId: user._id,
                isDeleted: false,
                status: 'active'
            }).select('_id');

            allowedBuildingIds = ownedBuildings.map(b => b._id);

            if (buildingId) {
                if (!allowedBuildingIds.map(id => id.toString()).includes(buildingId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Bạn không sở hữu tòa nhà này'
                    });
                }
                query.buildingId = buildingId;
            } else {
                query.buildingId = { $in: allowedBuildingIds };
            }
        }

        if (isStaff) {
            allowedBuildingIds = req.staff.assignedBuildingIds || [];

            if (allowedBuildingIds.length === 0) {
                return res.json({
                    success: true,
                    data: {
                        pagination: { page, limit, total: 0, totalPages: 0 },
                        summary: { totalRatings: 0, averageRating: 0 },
                        ratings: []
                    }
                });
            }

            if (buildingId) {
                if (!allowedBuildingIds.includes(buildingId)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Bạn không được quản lý tòa nhà này'
                    });
                }
                query.buildingId = buildingId;
            } else {
                query.buildingId = { $in: allowedBuildingIds };
            }
        }

        const totalCount = await BuildingRating.countDocuments(query);

        const ratings = await BuildingRating.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'buildingId',
                select: 'name'
            })
            .populate({
                path: 'userId',
                select: 'email',
                populate: {
                    path: 'userInfo',
                    select: 'fullName phoneNumber'
                }
            })
            .lean();

        const avgRating = totalCount > 0
            ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10
            : 0;

        const formatted = ratings.map(r => ({
            _id: r._id,
            building: {
                _id: r.buildingId._id,
                name: r.buildingId.name
            },
            rating: r.rating,
            comment: r.comment || null,
            images: r.images || [],
            createdAt: r.createdAt,
            user: {
                fullName: r.userId?.userInfo?.fullName || 'Người dùng đã xóa',
                phoneNumber: r.userId?.userInfo?.phoneNumber || null,
            }
        }));

        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            data: {
                filter: buildingId ? 'one_building' : 'all_managed_buildings',
                buildingId: buildingId || null,
                totalManagedBuildings: allowedBuildingIds.length,
                pagination: {
                    page,
                    limit,
                    total: totalCount,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                summary: {
                    totalRatings: totalCount,
                    averageRating: avgRating
                },
                ratings: formatted
            }
        });

    } catch (error) {
        console.error('Get ratings error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống'
        });
    }
};

const getDetailRating = async (req, res) => {
    const { ratingId } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(ratingId)) {
        return res.status(400).json({
            success: false,
            message: 'ID đánh giá không hợp lệ'
        });
    }

    try {
        const rating = await BuildingRating.findById(ratingId)
            .populate({
                path: 'buildingId',
                select: 'name address landlordId'
            })
            .populate({
                path: 'userId',
                select: 'email createdAt',
                populate: {
                    path: 'userInfo',
                    select: 'fullName phoneNumber gender dob'
                }
            })
            .lean();

        if (!rating) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đánh giá này'
            });
        }

        const building = rating.buildingId;
        if (!building || building.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Tòa nhà đã bị xóa hoặc không tồn tại'
            });
        }

        const buildingIdStr = building._id.toString();

        if (user.role === 'landlord') {
            if (building.landlordId.toString() !== user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không sở hữu tòa nhà này'
                });
            }
        }

        if (user.role === 'staff') {
            const assigned = req.staff?.assignedBuildingIds || [];
            if (!assigned.includes(buildingIdStr)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không được quản lý tòa nhà này'
                });
            }
        }

        res.json({
            success: true,
            data: {
                _id: rating._id,
                building: {
                    _id: building._id,
                    name: building.name,
                    address: building.address
                },
                rating: rating.rating,
                comment: rating.comment || null,
                images: rating.images || [],
                createdAt: rating.createdAt,
                updatedAt: rating.updatedAt,
                user: {
                    _id: rating.userId?._id,
                    email: rating.userId?.email,
                    fullName: rating.userId?.userInfo?.fullName || 'Người dùng',
                    phoneNumber: rating.userId?.userInfo?.phoneNumber || null,
                    gender: rating.userId?.userInfo?.gender || null,
                    dob: rating.userId?.userInfo?.dob || null,
                    joinedAt: rating.userId?.createdAt || null
                }
            }
        });

    } catch (error) {
        console.error('Get detail rating error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi hệ thống'
        });
    }
};
const deleteRating = async (req, res) => {
    const { ratingId } = req.params;
    const user = req.user;

    if (!mongoose.Types.ObjectId.isValid(ratingId)) {
        return res.status(400).json({ success: false, message: 'ID đánh giá không hợp lệ' });
    }

    try {
        const rating = await BuildingRating.findById(ratingId);
        if (!rating) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
        }

        const building = await Building.findById(rating.buildingId);
        if (!building || building.isDeleted) {
            return res.status(404).json({ success: false, message: 'Tòa nhà không tồn tại' });
        }

        if (user.role === 'landlord') {
            if (building.landlordId.toString() !== user._id.toString()) {
                return res.status(403).json({ success: false, message: 'Không có quyền' });
            }
        }

        await BuildingRating.deleteOne({ _id: ratingId });

        res.json({
            success: true,
            message: 'Đã xóa đánh giá thành công'
        });

    } catch (error) {
        console.error('Delete rating error:', error);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
};

module.exports = {
    getRatingsByBuilding,
    getDetailRating,
    deleteRating
};