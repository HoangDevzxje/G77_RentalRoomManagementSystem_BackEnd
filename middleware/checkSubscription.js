// middleware/checkSubscription.js
const Subscription = require("../models/Subscription");
const Building = require("../models/Building");
const Room = require("../models/Room");

module.exports = async (req, res, next) => {
  try {
    if (req.user.role === "admin") return next();

    // === 2. TÌM LANDLORD CỦA NGƯỜI DÙNG HIỆN TẠI ===
    let landlordId;

    if (req.user.role === "landlord") {
      landlordId = req.user._id;
    } else if (req.user.role === "staff") {
      if (!req.staff?.landlordId) {
        return res.status(403).json({ message: "Staff không thuộc landlord nào!" });
      }
      landlordId = req.staff.landlordId;
    } else {
      return next();
    }

    // === 3. KIỂM TRA GÓI DỊCH VỤ HOẠT ĐỘNG ===
    const activeSub = await Subscription.findOne({
      landlordId,
      status: "active",
    }).sort({ startDate: -1 });

    // Không có gói → chỉ cho GET
    if (!activeSub) {
      if (req.method !== "GET") {
        return res.status(403).json({
          message: "Chủ trọ chưa mua gói dịch vụ!"
        });
      }
      return next();
    }

    // === 4. KIỂM TRA HẾT HẠN ===
    const now = new Date();
    if (activeSub.endDate && now > activeSub.endDate) {
      activeSub.status = "expired";
      await activeSub.save();

      if (req.method !== "GET") {
        return res.status(403).json({
          message: "Gói dịch vụ đã hết hạn!"
        });
      }
      return next();
    }

    // === 5. KIỂM TRA GIỚI HẠN PHÒNG (CHỈ CHO POST/PUT/DELETE) ===
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      // Lấy tất cả buildingId của landlord
      const buildingIds = await Building.find({
        landlordId
      }).distinct("_id");

      // Đếm tổng phòng
      const totalRooms = await Room.countDocuments({
        buildingId: { $in: buildingIds }
      });

      // Kiểm tra giới hạn
      if (activeSub.roomLimit !== -1 && totalRooms >= activeSub.roomLimit) {
        return res.status(403).json({
          message: `Vượt quá giới hạn ${activeSub.roomLimit} phòng. Vui lòng nâng cấp gói!`,
          currentRooms: totalRooms,
          limit: activeSub.roomLimit
        });
      }
    }

    next();
  } catch (err) {
    console.error("[checkSubscription] Lỗi:", err);
    return res.status(500).json({
      message: "Lỗi hệ thống khi kiểm tra gói dịch vụ"
    });
  }
};