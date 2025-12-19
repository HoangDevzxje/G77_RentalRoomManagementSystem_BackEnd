const Subscription = require("../models/Subscription");
const Building = require("../models/Building");
const Room = require("../models/Room");
const Floor = require("../models/Floor");

module.exports = async (req, res, next) => {
  try {
    if (req.user.role === "admin" || req.method === "GET") {
      return next();
    }

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

    const activeSub = await Subscription.findOne({
      landlordId,
      status: "active",
    }).populate("packageId", "roomLimit")
      .sort({ startDate: -1 });

    if (!activeSub) {
      if (
        req._roomAction === "toggleActive" &&
        req.body?.active === false
      ) {
        return next();
      }
      if (
        req._buildingAction === "toggleActive" &&
        req.body?.status === "inactive"
      ) {
        return next();
      }
      if (
        req._floorAction === "toggleActive" &&
        req.body?.status === "inactive"
      ) {
        return next();
      }


      if (req._resourceAction === "decrease") {
        return next();
      }

      return res.status(403).json({
        message: "Gói dịch vụ đã hết hạn. Vui lòng mua gói mới để tiếp tục."
      });
    }

    const now = new Date();
    if (activeSub.endDate && now > activeSub.endDate) {
      activeSub.status = "expired";
      await activeSub.save();
      return res.status(403).json({
        message: "Gói dịch vụ đã hết hạn!"
      });
    }

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

    if (req.path.includes("quick-setup") && req.body.floors && req.body.rooms) {
      const { floors, rooms } = req.body;
      if (floors?.count && rooms?.perFloor) {
        additionalRooms = floors.count * rooms.perFloor;
      }
    }

    else if (req.path.includes("quick-create") || req.path.includes("quick")) {
      const { perFloor = 0, floorIds, floorId } = req.body;
      const floorCount = floorId ? 1 : (Array.isArray(floorIds) ? floorIds.length : 0);
      additionalRooms = perFloor * floorCount;
    }

    else if (req._roomAction === "create") {
      additionalRooms = Array.isArray(bodyData)
        ? bodyData.length
        : 1;
    }


    if (req._roomAction === "toggleActive") {
      if (req.body.active === false) return next();
      if (req.body.active === true) additionalRooms = 1;
    }

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

    next();
  } catch (err) {
    console.error("[checkSubscription] Lỗi:", err);
    return res.status(500).json({
      message: "Lỗi hệ thống khi kiểm tra gói dịch vụ"
    });
  }
};