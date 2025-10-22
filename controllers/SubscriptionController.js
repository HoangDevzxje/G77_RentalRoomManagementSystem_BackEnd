const crypto = require('crypto');
const qs = require('qs');
const moment = require('moment');
const Subscription = require('../models/Subscription');
const Package = require('../models/Package');

const VNP_TMNCODE = process.env.VNP_TMNCODE;
const VNP_HASHSECRET = process.env.VNP_HASHSECRET;
const VNP_URL = process.env.VNP_URL;
const VNP_RETURNURL = process.env.VNP_RETURNURL;

const sortObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        console.error('sortObject: Input is not a valid object', obj);
        return {};
    }

    let sorted = {};
    let str = [];
    let key;
    for (key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            str.push(encodeURIComponent(key));
        }
    }
    str.sort();
    for (key = 0; key < str.length; key++) {
        sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
    }
    return sorted;
};

const buy = async (req, res) => {
    try {
        const { packageId } = req.body;
        const pkg = await Package.findById(packageId);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });

        const sub = new Subscription({
            landlordId: req.user._id,
            packageId: pkg._id,
            startDate: new Date(),
            status: 'pending_payment',
            amount: vnp_Params.vnp_Amount,
            transactionRef: vnp_Params.vnp_TxnRef,
        });
        await sub.save();

        let ipAddr =
            req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        let vnp_Params = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: VNP_TMNCODE,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: moment().format('YYYYMMDDHHmmss'),
            vnp_OrderInfo: sub._id.toString(),
            vnp_OrderType: 'subscription',
            vnp_Amount: pkg.price * 100, // Convert VND to VNPay format
            vnp_ReturnUrl: VNP_RETURNURL,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: moment().format('YYYYMMDDHHmmss'),
        };

        vnp_Params = sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASHSECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
        vnp_Params['vnp_SecureHash'] = signed;

        const paymentUrl = `${VNP_URL}?${qs.stringify(vnp_Params, { encode: false })}`;
        res.json({ success: true, data: { paymentUrl } });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const paymentCallback = async (req, res) => {
    try {
        let vnp_Params = req.query;
        if (!vnp_Params || typeof vnp_Params !== 'object') {
            return res.status(400).json({ message: 'Query parameters không hợp lệ!' });
        }

        const secureHash = vnp_Params['vnp_SecureHash'];
        const subId = vnp_Params['vnp_OrderInfo'];

        if (!secureHash || !subId) {
            return res.status(400).json({ message: 'Thiếu tham số vnp_SecureHash hoặc vnp_OrderInfo!' });
        }

        const sub = await Subscription.findById(subId);
        if (!sub) return res.status(404).json({ message: 'Không tìm thấy subscription' });

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', VNP_HASHSECRET);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash === signed) {
            if (vnp_Params['vnp_ResponseCode'] === '00') {
                const pkg = await Package.findById(sub.packageId);
                if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
                sub.endDate = new Date(sub.startDate.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);
                sub.status = 'active';
                sub.paymentId = vnp_Params['vnp_TransactionNo'];
                await sub.save();
                res.json({ success: true, message: 'Thanh toán thành công!' });
            } else {
                res.status(400).json({ message: 'Thanh toán thất bại!' });
            }
        } else {
            res.status(400).json({ message: 'Sai chữ ký bảo mật!' });
        }
    } catch (err) {
        console.error('Lỗi trong paymentCallback:', err);
        res.status(500).json({ message: 'Lỗi server!', error: err.message });
    }
};

const list = async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ landlordId: req.user._id }).populate('packageId');
        res.json({ success: true, data: subscriptions });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
const getByLandlordId = async (req, res) => {
    try {
        const landlordId = req.user._id;

        const subscriptions = await Subscription.find({ landlordId })
            .populate('packageId', 'name price durationDays description roomLimit')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: subscriptions,
        });
    } catch (err) {
        console.error('Lỗi khi lấy lịch sử gói:', err);
        res.status(500).json({
            success: false,
            message: 'Không thể lấy lịch sử gói đăng ký',
            error: err.message,
        });
    }
};
module.exports = { buy, paymentCallback, list, getByLandlordId };