const moment = require('moment');
const Package = require('../../models/Package');
const Subscription = require('../../models/Subscription');
const Account = require('../../models/Account');

const getDateRange = (filter, customStart, customEnd) => {
    const now = moment().startOf('day');
    let startDate, endDate;

    switch (filter) {
        case 'today':
            startDate = now.clone();
            endDate = now.clone().endOf('day');
            break;
        case 'week':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            break;
        case 'month':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            break;
        case 'year':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            break;
        case 'custom':
            startDate = moment(customStart).startOf('day');
            endDate = moment(customEnd).endOf('day');
            break;
        default:
            startDate = now.clone().subtract(29, 'days');
            endDate = now.clone().endOf('day');
    }

    return { startDate, endDate };
};

class AdminDashboardController {
    static async getOverview(req, res) {
        try {
            const { filter = 'month', startDate: customStart, endDate: customEnd } = req.query;

            const { startDate, endDate } = getDateRange(filter, customStart, customEnd);

            const totalUsers = await Account.countDocuments({});
            const totalLandlords = await Account.countDocuments({ role: 'landlord' });
            const newUsersThisPeriod = await Account.countDocuments({
                createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
            });

            const totalPackages = await Package.countDocuments({});
            const activePackages = await Package.countDocuments({ isActive: true });
            const trialPackages = await Package.countDocuments({ type: 'trial' });

            const revenueStats = await Subscription.aggregate([
                {
                    $match: {
                        status: { $in: ['active', 'expired'] },
                        paymentMethod: { $ne: 'free' },
                        createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$amount' },
                        paidCount: { $sum: 1 }
                    }
                }
            ]);

            const totalRevenue = revenueStats[0]?.totalRevenue || 0;
            const paidSubscriptions = revenueStats[0]?.paidCount || 0;

            const dailySubscriptions = await Subscription.aggregate([
                {
                    $match: {
                        createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
                        status: { $in: ['active', 'expired', 'upcoming'] }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $cond: [
                                    { $in: ['$paymentMethod', ['vnpay', 'momo']] },
                                    '$amount',
                                    0
                                ]
                            }
                        }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            const filledDailyData = [];
            let current = startDate.clone();
            const dataMap = dailySubscriptions.reduce((acc, item) => {
                acc[item._id] = item;
                return acc;
            }, {});

            while (current.isSameOrBefore(endDate)) {
                const dateStr = current.format('YYYY-MM-DD');
                const existing = dataMap[dateStr];
                filledDailyData.push({
                    date: dateStr,
                    count: existing?.count || 0,
                    revenue: existing?.revenue || 0
                });
                current.add(1, 'day');
            }

            const packageDistribution = await Subscription.aggregate([
                {
                    $match: {
                        status: { $in: ['active', 'expired'] },
                        createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
                    }
                },
                {
                    $lookup: {
                        from: 'packages',
                        localField: 'packageId',
                        foreignField: '_id',
                        as: 'package'
                    }
                },
                { $unwind: '$package' },
                {
                    $group: {
                        _id: '$package.name',
                        count: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $cond: [
                                    { $in: ['$paymentMethod', ['vnpay', 'momo']] },
                                    '$amount',
                                    0
                                ]
                            }
                        }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            const currentStatusCount = await Subscription.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            const statusMap = {
                active: 0,
                expired: 0,
                upcoming: 0,
                pending_payment: 0,
                cancelled: 0
            };

            currentStatusCount.forEach(item => {
                if (statusMap.hasOwnProperty(item._id)) {
                    statusMap[item._id] = item.count;
                }
            });

            const topLandlords = await Subscription.aggregate([
                {
                    $match: {
                        status: { $in: ['active', 'expired'] },
                        paymentMethod: { $ne: 'free' },
                        createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
                    }
                },
                {
                    $group: {
                        _id: '$landlordId',
                        totalSpent: { $sum: '$amount' },
                        subscriptionCount: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'accounts',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'landlord'
                    }
                },
                { $unwind: '$landlord' },
                {
                    $project: {
                        email: '$landlord.email',
                        totalSpent: 1,
                        subscriptionCount: 1
                    }
                },
                { $sort: { totalSpent: -1 } },
                { $limit: 5 }
            ]);

            res.status(200).json({
                success: true,
                data: {
                    summary: {
                        totalUsers,
                        totalLandlords,
                        newUsersThisPeriod,
                        totalPackages,
                        activePackages,
                        trialPackages,
                        totalRevenueThisPeriod: totalRevenue,
                        paidSubscriptionsThisPeriod: paidSubscriptions,
                    },
                    charts: {
                        dailyTrend: filledDailyData,
                        packagePie: packageDistribution,
                    },
                    currentStatus: statusMap,
                    topLandlords,
                    dateRange: {
                        start: startDate.format('YYYY-MM-DD'),
                        end: endDate.format('YYYY-MM-DD'),
                        filter
                    }
                }
            });

        } catch (error) {
            console.error('Admin Dashboard Error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu dashboard',
                error: error.message
            });
        }
    }
}

module.exports = AdminDashboardController;