const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const Package = require('../models/Package');
const sendTrialWelcomeEmail = require('../utils/sendTrialWelcomeEmail');
const Account = require('../models/Account');
const UserInformation = require('../models/UserInformation');
const sendPaymentSuccessEmail = require('../utils/sendPaymentSuccessEmail');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Room = require('../models/Room');

const VNP_TMNCODE = process.env.VNP_TMNCODE;
const VNP_HASHSECRET = process.env.VNP_HASHSECRET;
const VNP_URL = process.env.VNP_URL;
const VNP_RETURNURL = process.env.VNP_RETURNURL;

const sendSuccess = (res, data = null, message = 'Thành công') =>
    res.json({ success: true, message, data });
const sendError = (res, status, message) =>
    res.status(status).json({ success: false, message });

const sortObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const sorted = {};
    Object.keys(obj).sort().forEach((key) => {
        sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
    });
    return sorted;
};
function generateVnpUrl(orderId, amount, orderType, req) {
    const ipAddr =
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.ip ||
        '127.0.0.1';

    const createDate = moment().format('YYYYMMDDHHmmss');
    const expireDate = moment().add(15, 'minutes').format('YYYYMMDDHHmmss');

    const vnp_Params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: VNP_TMNCODE,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: `${orderType.toUpperCase()}_${createDate}_${uuidv4().slice(0, 8)}`,
        vnp_OrderInfo: orderId,
        vnp_OrderType: orderType,
        vnp_Amount: amount * 100,
        vnp_ReturnUrl: VNP_RETURNURL,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate,
    };

    const sorted = sortObject(vnp_Params);
    const signData = qs.stringify(sorted, { encode: false });
    const signed = crypto
        .createHmac('sha512', VNP_HASHSECRET)
        .update(signData)
        .digest('hex');

    sorted.vnp_SecureHash = signed;

    return {
        url: `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`,
        expireAt: moment(expireDate, 'YYYYMMDDHHmmss').toDate()
    };
}

const startTrial = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const hasTrial = await Subscription.findOne({ landlordId, isTrial: true });
        if (hasTrial) return sendError(res, 400, 'Bạn đã sử dụng gói dùng thử.');

        const activeSub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() },
        });
        if (activeSub) return sendError(res, 400, 'Bạn đang dùng gói khác.');

        const trialPkg = await Package.findOne({ type: 'trial', isActive: true });
        if (!trialPkg) return sendError(res, 500, 'Gói dùng thử không khả dụng.');

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + trialPkg.durationDays);

        const sub = new Subscription({
            landlordId,
            packageId: trialPkg._id,
            startDate,
            endDate,
            amount: 0,
            paymentMethod: 'free',
            isTrial: true,
            status: 'active',
        });
        await sub.save();

        const landlord = await Account.findOne({ _id: landlordId }).populate('userInfo');
        const fullName = landlord?.userInfo?.fullName || "Quý khách";
        sendTrialWelcomeEmail({
            to: req.user.email,
            fullName,
            durationDays: trialPkg.durationDays,
            startDate,
            endDate,
            maxRooms: trialPkg.roomLimit
        }).catch(err => {
            console.error("Lỗi gửi email dùng thử:", err);
        });

        return sendSuccess(res, {
            subscription: sub,
            endDate,
            durationDays: trialPkg.durationDays
        }, 'Dùng thử kích hoạt thành công! Email xác nhận đã được gửi.');

    } catch (err) {
        console.error("Lỗi startTrial:", err.message);
        return sendError(res, 500, 'Lỗi hệ thống');
    }
};

const buyPackage = async (req, res) => {
    try {
        const { packageId } = req.body;
        if (!packageId) return sendError(res, 400, 'Thiếu packageId');
        if (!mongoose.Types.ObjectId.isValid(packageId)) {
            return sendError(res, 400, 'packageId không hợp lệ');
        }
        const pkg = await Package.findById(packageId);
        if (!pkg || !pkg.isActive || pkg.type === 'trial') {
            return sendError(res, 400, 'Gói không hợp lệ');
        }
        const landlordId = req.user._id;
        if (pkg.roomLimit !== -1) {
            const buildingIds = await Building.find({
                landlordId,
                isDeleted: false,
                status: "active",
            }).distinct("_id");

            const floorIds = await Floor.find({
                buildingId: { $in: buildingIds },
                isDeleted: false,
                status: "active",
            }).distinct("_id");

            const currentRoomCount = await Room.countDocuments({
                buildingId: { $in: buildingIds },
                floorId: { $in: floorIds },
                isDeleted: false,
                active: true,
            });

            if (currentRoomCount > pkg.roomLimit) {
                return sendError(
                    res,
                    400,
                    `Không thể mua gói ${pkg.roomLimit} phòng vì bạn đang có ${currentRoomCount} phòng đang hoạt động. Vui lòng mua gói khác hoặc ngừng hoạt động bớt phòng`
                );
            }
        }
        const activeSub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() },
        }).populate('packageId');

        if (activeSub && !activeSub.isTrial) {
            const daysLeft = Math.ceil((activeSub.endDate - new Date()) / 86400000);
            if (daysLeft > 0) {
                return sendError(
                    res,
                    400,
                    `Còn ${daysLeft} ngày. Vui lòng đợi hết hạn hoặc hủy gói hiện tại.`
                );
            }
        }
        const pendingBuy = await Subscription.findOne({
            landlordId,
            status: 'pending_payment',
            isRenewal: false,
            packageId: packageId,
        });

        if (pendingBuy) {
            const now = new Date();
            if (!pendingBuy.vnp_ExpireDate || now > pendingBuy.vnp_ExpireDate) {
                const { url, expireAt } = generateVnpUrl(
                    pendingBuy._id.toString(),
                    pkg.price,
                    'subscription',
                    req
                );

                pendingBuy.paymentUrl = url;
                pendingBuy.vnp_ExpireDate = expireAt;
                await pendingBuy.save();

                return sendSuccess(res, {
                    paymentUrl: url,
                    subscriptionId: pendingBuy._id,
                    message: 'URL cũ đã hết hạn – đã tạo URL thanh toán mới.',
                });
            }

            return sendSuccess(res, {
                paymentUrl: pendingBuy.paymentUrl,
                subscriptionId: pendingBuy._id,
                message: 'Bạn có yêu cầu mua gói chưa thanh toán, vui lòng thanh toán trước.',
            });
        }

        const sub = new Subscription({
            landlordId,
            packageId: pkg._id,
            startDate: new Date(),
            amount: pkg.price,
            paymentMethod: 'vnpay',
            status: 'pending_payment',
            isRenewal: false,
        });
        await sub.save();

        const { url, expireAt } = generateVnpUrl(
            sub._id.toString(),
            pkg.price,
            'subscription',
            req
        );

        sub.paymentUrl = url;
        sub.vnp_ExpireDate = expireAt;
        await sub.save();

        return sendSuccess(res, {
            paymentUrl: url,
            subscriptionId: sub._id,
        });

    } catch (err) {
        return sendError(res, 500, err.message);
    }
};


const renewPackage = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const currentSub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() },
        }).populate('packageId');

        if (!currentSub) return sendError(res, 400, 'Không có gói nào đang active.');

        const pkg = currentSub.packageId;
        if (pkg.type === 'trial') return sendError(res, 400, 'Không thể gia hạn gói trial.');
        if (!pkg.isActive) return sendError(res, 400, 'Gói đã bị ngừng kinh doanh.');

        const daysLeft = Math.ceil((currentSub.endDate - new Date()) / 86400000);
        if (daysLeft > 30) {
            return sendError(res, 400, `Còn ${daysLeft} ngày. Chỉ gia hạn khi còn ≤ 30 ngày.`);
        }


        const existingRenewal = await Subscription.findOne({
            landlordId,
            renewedFrom: currentSub._id,
            isRenewal: true,
            status: { $in: ['pending_payment', 'upcoming'] }
        });

        if (existingRenewal) {
            if (existingRenewal.status === 'pending_payment' && existingRenewal.paymentUrl) {
                const now = new Date();
                if (!existingRenewal.vnp_ExpireDate || now > existingRenewal.vnp_ExpireDate) {
                    const { url, expireAt } = generateVnpUrl(
                        existingRenewal._id.toString(),
                        pkg.price,
                        'renew_subscription',
                        req
                    );
                    existingRenewal.paymentUrl = url;
                    existingRenewal.vnp_ExpireDate = expireAt;
                    await existingRenewal.save();

                    return sendSuccess(res, {
                        paymentUrl: url,
                        subscriptionId: existingRenewal._id,
                        message: 'URL cũ hết hạn – đã tạo link thanh toán mới.',
                    });
                }

                return sendSuccess(res, {
                    paymentUrl: existingRenewal.paymentUrl,
                    subscriptionId: existingRenewal._id,
                    message: 'Bạn đã có yêu cầu gia hạn đang chờ thanh toán.',
                });
            }

            return sendError(res, 400, 'Bạn đã có gói gia hạn sắp kích hoạt. Không thể gia hạn thêm.');
        }

        const newStartDate = moment(currentSub.endDate).add(1, 'day').toDate();
        const newEndDate = moment(newStartDate).add(pkg.durationDays, 'day').toDate();

        const newSub = new Subscription({
            landlordId,
            packageId: pkg._id,
            startDate: newStartDate,
            endDate: newEndDate,
            amount: pkg.price,
            paymentMethod: 'vnpay',
            status: 'pending_payment',
            isRenewal: true,
            renewedFrom: currentSub._id,
        });
        await newSub.save();

        currentSub.renewedTo = newSub._id;
        await currentSub.save();

        const { url, expireAt } = generateVnpUrl(
            newSub._id.toString(),
            pkg.price,
            'renew_subscription',
            req
        );

        newSub.paymentUrl = url;
        newSub.vnp_ExpireDate = expireAt;
        await newSub.save();

        return sendSuccess(res, {
            paymentUrl: url,
            subscriptionId: newSub._id,
            oldSubscriptionId: currentSub._id,
            message: 'Đã tạo yêu cầu gia hạn thành công.',
        });

    } catch (err) {
        console.error('Lỗi renewPackage:', err);
        return sendError(res, 500, err.message || 'Lỗi hệ thống');
    }
};


const paymentCallback = async (req, res) => {
    try {
        const vnp_Params = req.query;
        const secureHash = vnp_Params.vnp_SecureHash;
        const orderId = vnp_Params.vnp_OrderInfo;
        const txnRef = vnp_Params.vnp_TxnRef || '';

        if (!secureHash || !orderId) {
            return sendError(res, 400, 'Thiếu tham số bắt buộc (vnp_SecureHash hoặc vnp_OrderInfo)');
        }

        const sub = await Subscription.findById(orderId).populate('packageId');
        if (!sub) return sendError(res, 404, 'Không tìm thấy Subscription ID: ' + orderId);

        if (sub.status === 'active' || sub.status === 'upcoming') {
            return sendSuccess(res, { subscription: sub }, 'Giao dịch đã xử lý trước đó');
        }

        const { vnp_SecureHash, vnp_SecureHashType, ...paramsForSign } = vnp_Params;
        const sortedParams = sortObject(paramsForSign);
        const signData = qs.stringify(sortedParams, { encode: false });
        const calculatedHash = crypto.createHmac('sha512', VNP_HASHSECRET).update(signData).digest('hex');

        if (secureHash !== calculatedHash) {
            sub.status = 'pending_payment';
            await sub.save();
            return sendError(res, 400, 'Sai chữ ký bảo mật');
        }

        if (vnp_Params.vnp_ResponseCode !== '00') {
            sub.status = 'pending_payment';
            await sub.save();
            return sendError(res, 400, `Thanh toán thất bại (Mã: ${vnp_Params.vnp_ResponseCode})`);
        }

        const now = new Date();

        if (!sub.endDate) {
            const end = new Date(sub.startDate);
            end.setDate(end.getDate() + sub.packageId.durationDays);
            sub.endDate = end;
        }

        const isRenew = sub.isRenewal === true || txnRef.startsWith("RENEW_");

        if (isRenew) {
            if (sub.startDate > now) {
                sub.status = "upcoming";
            } else {
                sub.status = "active";
            }
        } else {
            sub.status = "active";

            if (sub.packageId.type === "paid") {
                await Subscription.updateMany(
                    {
                        landlordId: sub.landlordId,
                        status: "active",
                        isTrial: true
                    },
                    { status: "expired" }
                );
            }
        }

        sub.paymentId = vnp_Params.vnp_TransactionNo;
        sub.paymentMethod = 'vnpay';
        await sub.save();

        await Subscription.updateMany(
            {
                landlordId: sub.landlordId,
                status: 'pending_payment',
                isRenewal: true,
                _id: { $ne: sub._id }
            },
            { status: 'cancelled' }
        );

        const action = isRenew ? 'Gia hạn gói' : 'Kích hoạt gói mới';
        const landlord = await Account.findOne({ _id: sub.landlordId }).populate('userInfo');
        const fullName = landlord?.userInfo?.fullName || "Quý khách";
        const packageName = sub.packageId?.name || "Gói dịch vụ";

        sendPaymentSuccessEmail({
            to: landlord.email,
            fullName,
            action,
            packageName,
            durationDays: sub.packageId.durationDays,
            amount: sub.amount,
            startDate: sub.startDate,
            endDate: sub.endDate,
            transactionNo: vnp_Params.vnp_TransactionNo,
        }).catch(err => {
            console.error("Gửi email thanh toán thành công thất bại:", err);
        });
        return sendSuccess(res, { subscription: sub, action }, `${action} thành công!`);

    } catch (err) {
        console.error('Lỗi trong paymentCallback:', err);
        return sendError(res, 500, 'Lỗi hệ thống khi xử lý thanh toán');
    }
};

const getStatusPackage = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const activeSub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() },
        }).populate('packageId');

        const hasUsedTrial = await Subscription.findOne({ landlordId, isTrial: true });

        if (!activeSub) {
            return sendSuccess(res, {
                hasActive: false,
                hasUsedTrial: !!hasUsedTrial,
                action: hasUsedTrial ? 'buy_package' : 'start_trial',
            });
        }
        const daysLeft = Math.ceil((activeSub.endDate - new Date()) / 86400000);
        const action = activeSub.isTrial && daysLeft <= 3 ? 'upgrade_warning' : null;

        return sendSuccess(res, {
            hasActive: true,
            isTrial: activeSub.isTrial,
            package: activeSub.packageId,
            daysLeft,
            action,
        });
    } catch (err) {
        console.error('Lỗi getStatusPackage:', err.message);
        return sendError(res, 500, "Lỗi hệ thống");
    }
};

const historyBuyPackage = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const {
            status,
            page = 1,
            limit = 10
        } = req.query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        if (isNaN(pageNum) || pageNum < 1) return sendError(res, 400, 'Page phải là số nguyên dương');
        if (isNaN(limitNum) || limitNum < 1) return sendError(res, 400, 'Limit phải là số nguyên dương');

        const filter = {
            landlordId,
            status: { $ne: 'pending_payment' }
        };

        if (status) {
            const validStatuses = ['pending_payment', 'active', 'expired', 'cancelled', 'upgraded'];
            if (!validStatuses.includes(status)) {
                return sendError(res, 400, `Status không hợp lệ. Chỉ chấp nhận: ${validStatuses.join(', ')}`);
            }
            filter.status = status;
        }

        const total = await Subscription.countDocuments(filter);

        const subscriptions = await Subscription.find(filter)
            .populate('packageId', 'name price durationDays roomLimit type description')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        const totalPages = Math.ceil(total / limitNum);
        const hasNext = pageNum < totalPages;
        const hasPrev = pageNum > 1;

        return sendSuccess(res, {
            data: subscriptions,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages,
                hasNext,
                hasPrev
            }
        }, 'Lấy lịch sử gói thành công');

    } catch (err) {
        console.error('Lỗi trong list subscriptions:', err);
        return sendError(res, 500, 'Lỗi hệ thống');
    }
};

const getDetailPackage = async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        if (!subscriptionId) return sendError(res, 400, 'Thiếu subscriptionId');
        if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
            return sendError(res, 400, 'subscriptionId không hợp lệ');
        }
        const sub = await Subscription.findById(subscriptionId)
            .populate('packageId', 'name price durationDays roomLimit type description');

        if (!sub) return sendError(res, 404, 'Không tìm thấy gói');

        // KIỂM TRA QUYỀN
        if (String(sub.landlordId) !== String(req.user._id) && req.user.role !== 'admin') {
            return sendError(res, 403, 'Không có quyền truy cập gói này');
        }

        return sendSuccess(res, { subscription: sub }, 'Lấy chi tiết gói thành công');
    } catch (err) {
        console.error('Lỗi getDetail:', err);
        return sendError(res, 500, 'Lỗi hệ thống');
    }
};

const getCurrentPackage = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const sub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() }
        }).populate('packageId', 'name price durationDays roomLimit type description');

        if (!sub) {
            return sendSuccess(res, {
                subscription: null,
                stats: {
                    daysUsed: 0,
                    daysLeft: 0,
                    totalDays: 0,
                    isActive: false,
                    isExpired: true,
                    message: 'Bạn chưa có gói nào đang active'
                }
            }, 'Không có gói đang sử dụng');
        }

        const now = new Date();
        const start = new Date(sub.startDate);
        const end = new Date(sub.endDate);
        const totalDays = sub.packageId.durationDays;

        let daysUsed = 0;
        let daysLeft = 0;
        let percentageUsed = 0;
        let percentageLeft = 0;
        let statusMessage = '';

        if (now < start) {
            daysUsed = 0;
            daysLeft = Math.ceil((end - start) / 86400000);
            percentageUsed = 0;
            percentageLeft = 100;
            statusMessage = `Gói sẽ bắt đầu từ ${moment(start).format('DD/MM/YYYY')}`;
        }
        else if (now >= start && now <= end) {
            daysUsed = Math.ceil((now - start) / 86400000);
            daysLeft = Math.ceil((end - now) / 86400000);
            percentageUsed = Math.round((daysUsed / totalDays) * 100);
            percentageLeft = 100 - percentageUsed;
            statusMessage = 'Đang sử dụng';
        }
        else {
            daysUsed = totalDays;
            daysLeft = 0;
            percentageUsed = 100;
            percentageLeft = 0;
            statusMessage = 'Đã hết hạn';
        }

        const isActive = now >= start && now <= end;
        const isExpired = now > end;

        return sendSuccess(res, {
            subscription: sub,
            stats: {
                daysUsed,
                daysLeft,
                totalDays,
                percentageUsed,
                percentageLeft,
                isActive,
                isExpired,
                statusMessage,
                startDate: start.toISOString(),
                endDate: end.toISOString(),
            }
        }, 'Lấy gói hiện tại thành công');

    } catch (err) {
        console.error('Lỗi getCurrent:', err);
        return sendError(res, 500, 'Lỗi hệ thống');
    }
};

// const cancelledSubscription = async (req, res) => {
//     try {
//         const landlordId = req.user._id;

//         const sub = await Subscription.findOne({
//             landlordId,
//             status: { $in: ['active', 'upcoming'] },
//             endDate: { $gt: new Date() }
//         }).populate('packageId');

//         if (!sub) {
//             return sendError(res, 400, 'Không có gói nào đang active để hủy.');
//         }

//         if (sub.isTrial) {
//             return sendError(res, 400, 'Không thể hủy gói dùng thử.');
//         }

//         sub.status = 'cancelled';
//         await sub.save();

//         return sendSuccess(res, {
//             status: sub.status,
//             message: 'Đã hủy gói thành công. Bạn có thể mua gói mới ngay!'
//         });

//     } catch (err) {
//         console.error('Lỗi cancel:', err);
//         return sendError(res, 500, 'Lỗi hệ thống');
//     }
// };
const cancelledSubscription = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const subId = req.params.id;
        if (!subId) return sendError(res, 400, 'Thiếu subId');
        if (!mongoose.Types.ObjectId.isValid(subId)) {
            return sendError(res, 400, 'subId không hợp lệ');
        }
        const sub = await Subscription.findOne({
            _id: subId,
            landlordId,
        });

        if (!sub) {
            return sendError(res, 404, 'Không tìm thấy gói dịch vụ.');
        }

        if (!['active', 'upcoming'].includes(sub.status)) {
            return sendError(res, 400, 'Chỉ có thể hủy gói đang active hoặc upcoming.');
        }

        if (sub.isTrial) {
            return sendError(res, 400, 'Không thể hủy gói dùng thử.');
        }

        if (sub.status === 'upcoming' && sub.renewedFrom) {
            await Subscription.findByIdAndUpdate(sub.renewedFrom, {
                $unset: { renewedTo: "" }
            });
        }
        sub.status = 'cancelled';
        await sub.save();

        return sendSuccess(res, {
            status: sub.status,
            message: 'Đã hủy gói thành công.'
        });

    } catch (err) {
        console.error('Lỗi cancel:', err.message);
        return sendError(res, 500, 'Lỗi hệ thống.');
    }
};

module.exports = {
    startTrial,
    buyPackage,
    renewPackage,
    paymentCallback,
    getStatusPackage,
    historyBuyPackage,
    getDetailPackage,
    getCurrentPackage,
    cancelledSubscription
};