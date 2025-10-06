const Subscription = require('../models/Subscription');
const Room = require('../models/Room');
const Building = require('../models/Building');

module.exports = async (req, res, next) => {
    try {
        const sub = await Subscription.findOne({ landlordId: req.user._id, status: 'active' }).sort({ startDate: -1 });
        if (!sub || new Date() > sub.endDate) {
            if (sub) {
                sub.status = 'expired';
                await sub.save();
            }
            if (req.method !== 'GET') {
                return res.status(403).json({ message: 'Subscription hết hạn. Chỉ được xem dữ liệu.' });
            }
        } else {
            const totalRooms = await Room.countDocuments({
                buildingId: { $in: await Building.find({ landlordId: req.user._id }).select('_id') },
            });
            if (sub.roomLimit !== -1 && totalRooms >= sub.roomLimit) {
                return res.status(403).json({ message: 'Vượt quá giới hạn phòng. Vui lòng nâng cấp gói.' });
            }
        }
        next();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};