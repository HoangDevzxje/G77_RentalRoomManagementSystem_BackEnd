const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

const Subscription = require('../models/Subscription');
const Package = require('../models/Package');

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

        return sendSuccess(res, { subscription: sub, endDate, durationDays: trialPkg.durationDays }, 'Dùng thử kích hoạt thành công!');
    } catch (err) {
        return sendError(res, 500, err.message);
    }
};

const buyPackage = async (req, res) => {
    try {
        const { packageId } = req.body;
        if (!packageId) return sendError(res, 400, 'Thiếu packageId');

        const pkg = await Package.findById(packageId);
        if (!pkg || !pkg.isActive || pkg.type === 'trial') {
            return sendError(res, 400, 'Gói không hợp lệ');
        }

        const landlordId = req.user._id;
        const activeSub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() },
        });

        if (activeSub && !activeSub.isTrial) {
            const daysLeft = Math.ceil((activeSub.endDate - new Date()) / 86400000);
            if (daysLeft > 0) {
                return sendError(res, 400, `Còn ${daysLeft} ngày. Vui lòng đợi hết hạn hoặc hủy gói hiện tại.`);
            }
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

        const ipAddr = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '127.0.0.1';
        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMNCODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: `BUY_${moment().format('YYYYMMDDHHmmss')}_${uuidv4().slice(0, 8)}`,
            vnp_OrderInfo: sub._id.toString(),
            vnp_OrderType: 'subscription',
            vnp_Amount: pkg.price * 100,
            vnp_ReturnUrl: VNP_RETURNURL,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: moment().format('YYYYMMDDHHmmss'),
        };

        const sorted = sortObject(vnp_Params);
        const signData = qs.stringify(sorted, { encode: false });
        const signed = crypto.createHmac('sha512', VNP_HASHSECRET).update(signData).digest('hex');
        sorted.vnp_SecureHash = signed;

        const paymentUrl = `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`;
        return sendSuccess(res, { paymentUrl, subscriptionId: sub._id });
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

        if (!currentSub) {
            return sendError(res, 400, 'Không có gói nào đang active để gia hạn.');
        }

        const pkg = currentSub.packageId;
        if (pkg.type === 'trial') {
            return sendError(res, 400, 'Không thể gia hạn gói dùng thử.');
        }
        if (!pkg.isActive) return sendError(res, 400, 'Gói đã bị ngừng kinh doanh.');

        const daysLeft = Math.ceil((currentSub.endDate - new Date()) / 86400000);
        if (daysLeft > 30) {
            return sendError(res, 400, `Còn ${daysLeft} ngày. Chỉ gia hạn khi còn ≤ 30 ngày.`);
        }

        const pendingRenew = await Subscription.findOne({
            landlordId,
            status: 'pending_payment',
            isRenewal: true,
            renewedFrom: currentSub._id,
        });

        if (pendingRenew) {
            return sendSuccess(res, {
                paymentUrl: pendingRenew.paymentUrl || 'URL đã hết hạn, vui lòng tạo lại.',
                subscriptionId: pendingRenew._id,
                message: 'Yêu cầu gia hạn đã tồn tại. Vui lòng thanh toán để kích hoạt.',
            });
        }

        const newStartDate = new Date(currentSub.endDate);
        newStartDate.setDate(newStartDate.getDate() + 1);
        const newEndDate = new Date(newStartDate);
        newEndDate.setDate(newEndDate.getDate() + pkg.durationDays);

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

        const ipAddr = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '127.0.0.1';
        const vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMNCODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: `RENEW_${moment().format('YYYYMMDDHHmmss')}_${uuidv4().slice(0, 8)}`,
            vnp_OrderInfo: newSub._id.toString(),
            vnp_OrderType: 'renew_subscription',
            vnp_Amount: pkg.price * 100,
            vnp_ReturnUrl: VNP_RETURNURL,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: moment().format('YYYYMMDDHHmmss'),
        };

        const sorted = sortObject(vnp_Params);
        const signData = qs.stringify(sorted, { encode: false });
        const signed = crypto.createHmac('sha512', VNP_HASHSECRET).update(signData).digest('hex');
        sorted.vnp_SecureHash = signed;

        const paymentUrl = `${VNP_URL}?${qs.stringify(sorted, { encode: false })}`;

        newSub.paymentUrl = paymentUrl;
        await newSub.save();

        return sendSuccess(res, {
            paymentUrl,
            subscriptionId: newSub._id,
            oldSubscriptionId: currentSub._id,
            message: 'Đã tạo yêu cầu gia hạn.',
        });
    } catch (err) {
        return sendError(res, 500, err.message);
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
        if (!sub) {
            return sendError(res, 404, 'Không tìm thấy với ID: ' + orderId);
        }

        if (sub.status === 'active') {
            return sendSuccess(res, { subscription: sub }, 'Dịch vụ đã được xử lý trước đó.');
        }

        const { vnp_SecureHash, vnp_SecureHashType, ...paramsForSign } = vnp_Params;
        const sortedParams = sortObject(paramsForSign);
        const signData = qs.stringify(sortedParams, { encode: false });
        const calculatedHash = crypto.createHmac('sha512', VNP_HASHSECRET).update(signData).digest('hex');

        if (secureHash !== calculatedHash) {
            sub.status = 'expired';
            await sub.save();
            console.warn('Chữ ký không hợp lệ:', { orderId, txnRef });
            return sendError(res, 400, 'Chữ ký bảo mật không hợp lệ');
        }

        if (vnp_Params.vnp_ResponseCode === '00') {

            if (!sub.endDate) {
                const endDate = new Date(sub.startDate);
                endDate.setDate(endDate.getDate() + sub.packageId.durationDays);
                sub.endDate = endDate;
            }

            sub.status = 'active';
            sub.paymentId = vnp_Params.vnp_TransactionNo;
            sub.paymentMethod = 'vnpay';
            await sub.save();

            console.log(`Thanh toán thành công: ${orderId} | TxnRef: ${txnRef}`);

            const isRenew = txnRef.startsWith('RENEW_') || (sub.isRenewal === true);
            if (isRenew && sub.renewedFrom) {
                const oldSub = await Subscription.findById(sub.renewedFrom);
                if (oldSub && oldSub.status === 'active') {
                    oldSub.status = 'expired';
                    await oldSub.save();
                }
            }

            const cancelledCount = await Subscription.updateMany(
                {
                    landlordId: sub.landlordId,
                    status: 'pending_payment',
                    isRenewal: true,
                    _id: { $ne: sub._id }
                },
                { status: 'cancelled' }
            );

            if (cancelledCount.modifiedCount > 0) {
                console.log(`Đã hủy ${cancelledCount.modifiedCount} yêu cầu gia hạn trùng lặp`);
            }

            const action = isRenew ? 'Gia hạn' : 'Kích hoạt gói mới';
            return sendSuccess(res, {
                subscription: sub,
                action,
                cancelledPendingCount: cancelledCount.modifiedCount
            }, `${action} thành công!`);

        } else {
            sub.status = 'expired';
            await sub.save();
            console.warn(`Thanh toán thất bại: ${orderId} | Mã lỗi: ${vnp_Params.vnp_ResponseCode}`);
            return sendError(res, 400, `Thanh toán thất bại (Mã: ${vnp_Params.vnp_ResponseCode})`);
        }

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
        console.log(activeSub);
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
        return sendError(res, 500, err.message);
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

        const filter = { landlordId };

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

const cancelledSubscription = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const sub = await Subscription.findOne({
            landlordId,
            status: 'active',
            endDate: { $gt: new Date() }
        }).populate('packageId');

        if (!sub) {
            return sendError(res, 400, 'Không có gói nào đang active để hủy.');
        }

        if (sub.isTrial) {
            return sendError(res, 400, 'Không thể hủy gói dùng thử.');
        }

        sub.status = 'cancelled';
        await sub.save();

        return sendSuccess(res, {
            status: sub.status,
            message: 'Đã hủy gói thành công. Bạn có thể mua gói mới ngay!'
        });

    } catch (err) {
        console.error('Lỗi cancel:', err);
        return sendError(res, 500, 'Lỗi hệ thống');
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