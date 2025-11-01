const Subscription = require("../models/Subscription");
const Building = require("../models/Building");
const Room = require("../models/Room");

module.exports = async (req, res, next) => {
  try {
    if (req.user.role !== "landlord") {
      return next();
    }

    const sub = await Subscription.findOne({
      landlordId: req.user._id,
      status: "active",
    }).sort({ startDate: -1 });

    if (!sub) {
      if (req.method !== "GET") {
        return res.status(403).json({ message: "Bạn chưa mua gói dịch vụ!" });
      }
      return next();
    }

    if (new Date() > sub.endDate) {
      sub.status = "expired";
      await sub.save();
      if (req.method !== "GET") {
        return res.status(403).json({ message: "Gói dịch vụ đã hết hạn!" });
      }
    } else {
      const totalRooms = await Room.countDocuments({
        buildingId: {
          $in: await Building.find({ landlordId: req.user._id }).select("_id"),
        },
      });
      if (sub.roomLimit !== -1 && totalRooms >= sub.roomLimit) {
        return res
          .status(403)
          .json({ message: "Vượt quá giới hạn phòng. Vui lòng nâng cấp gói!" });
      }
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống: " + err.message });
  }
};
