const Subscription = require("../models/Subscription");
const Building = require("../models/Building");
const Room = require("../models/Room");

module.exports = async (req, res, next) => {
  try {
    if (req.user.role === "admin" || req.method === "GET") {
      return next();
    }

    // === 2. XÁC ĐỊNH LANDLORD ID ===
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

    // === 3. LẤY GÓI HOẠT ĐỘNG ===
    const activeSub = await Subscription.findOne({
      landlordId,
      status: "active",
    }).populate("packageId", "roomLimit")
      .sort({ startDate: -1 });

    if (!activeSub) {
      return res.status(403).json({
        message: "Chủ trọ chưa mua gói dịch vụ!"
      });
    }

    // === 4. KIỂM TRA HẾT HẠN ===
    const now = new Date();
    if (activeSub.endDate && now > activeSub.endDate) {
      activeSub.status = "expired";
      await activeSub.save();
      return res.status(403).json({
        message: "Gói dịch vụ đã hết hạn!"
      });
    }

    // === 5. TÍNH TỔNG PHÒNG HIỆN TẠI ===
    const buildingIds = await Building.find({
      landlordId,
      isDeleted: { $ne: true }
    }).distinct("_id");

    const currentRoomCount = await Room.countDocuments({
      buildingId: { $in: buildingIds },
      isDeleted: { $ne: true }
    });
    // === 6. TÍNH SỐ PHÒNG SẮP TẠO (CHO TẤT CẢ API) ===
    let additionalRooms = 0;
    let bodyData;
    if (req.body && req.body.data) {
      try {
        bodyData = JSON.parse(req.body.data);
      } catch {
        bodyData = {};
      }
    } else {
      bodyData = req.body || {};
    }

    // 1. quickSetup (tạo tòa + tầng + phòng)
    if (req.path.includes("quick-setup") && req.body.floors && req.body.rooms) {
      const { floors, rooms } = req.body;
      if (floors?.count && rooms?.perFloor) {
        additionalRooms = floors.count * rooms.perFloor;
      }
    }

    // 2. quickCreate (tạo nhanh phòng)
    else if (req.path.includes("quick-create") || req.path.includes("quick")) {
      const { perFloor = 0, floorIds, floorId } = req.body;
      const floorCount = floorId ? 1 : (Array.isArray(floorIds) ? floorIds.length : 0);
      additionalRooms = perFloor * floorCount;
    }

    // 3. Tạo phòng bình thường (POST /rooms)
    else if (req.method === "POST" && req.path.includes("/")) {
      if (Array.isArray(bodyData)) {
        additionalRooms = bodyData.length;
      } else {
        additionalRooms = 0;
      }
    }
    // === 7. KIỂM TRA GIỚI HẠN ===
    const totalAfter = currentRoomCount + additionalRooms;
    if (activeSub.packageId.roomLimit !== -1 && totalAfter > activeSub.packageId.roomLimit) {
      return res.status(403).json({
        message: `Vượt quá giới hạn phòng!`,
        currentRooms: currentRoomCount,
        adding: additionalRooms,
        totalAfter,
        limit: activeSub.packageId.roomLimit,
        action: "Vui lòng nâng cấp gói hoặc giảm số phòng tạo!"
      });
    }

    // === 8. CHO QUA ===
    next();
  } catch (err) {
    console.error("[checkSubscription] Lỗi:", err);
    return res.status(500).json({
      message: "Lỗi hệ thống khi kiểm tra gói dịch vụ"
    });
  }
};