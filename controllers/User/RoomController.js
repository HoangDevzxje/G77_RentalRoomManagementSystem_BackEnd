const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const Account = require("../../models/Account");
const Building = require("../../models/Building");
const BuildingService = require("../../models/BuildingService");

exports.getMyRoomDetail = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res
        .status(403)
        .json({ message: "Chỉ resident mới được dùng API này" });
    }

    const tenantId = req.user._id ?? req.user.id;
    if (!tenantId) {
      return res.status(400).json({ message: "Thiếu thông tin user" });
    }

    const room = await Room.findOne({
      currentTenantIds: { $in: [tenantId] },
      status: "rented",
      isDeleted: false,
      active: true,
    })
      .populate({
        path: "buildingId",
        select:
          "name address contact eIndexType ePrice wIndexType wPrice description",
      })
      .populate({ path: "floorId", select: "name floorNumber" })
      .populate({
        path: "currentTenantIds",
        select: "_id username userInfo first_name last_name",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber address",
        },
      })
      .populate({
        path: "currentContractId",
        select: "contract roommates",
      })
      .lean();

    if (!room) {
      return res.status(404).json({
        message: "Bạn chưa được gán vào phòng nào hoặc phòng chưa active",
      });
    }

    if (room.buildingId && typeof room.buildingId === "string") {
      try {
        const building = await Building.findById(room.buildingId)
          .select(
            "name address contact eIndexType ePrice wIndexType wPrice description"
          )
          .lean();
        if (building) {
          room.buildingId = building;
        }
      } catch (err) {
        console.warn("Cannot populate buildingId:", err?.message);
      }
    }

    // Lấy danh sách dịch vụ của tòa nhà
    const buildingServices = await BuildingService.find({
      buildingId: room.buildingId._id || room.buildingId,
      isDeleted: false,
    })
      .select("name label description chargeType fee currency")
      .lean();

    const roomFurnitures = await RoomFurniture.find({ roomId: room._id })
      .populate({ path: "furnitureId", select: "name" })
      .lean();

    const furnitures = roomFurnitures.map((rf) => ({
      _id: rf.furnitureId?._id,
      name: rf.furnitureId?.name || rf.name || "Unknown",
      quantity: rf.quantity ?? 0,
      condition: rf.condition ?? null,
    }));

    const accountTenants =
      Array.isArray(room.currentTenantIds) && room.currentTenantIds.length > 0
        ? room.currentTenantIds.map((t) => ({
            id: t._id,
            username: t.username || null,
            fullName:
              t.userInfo?.fullName ||
              `${t.first_name || ""} ${t.last_name || ""}`.trim() ||
              null,
            phoneNumber: t.userInfo?.phoneNumber || null,
          }))
        : [];

    const contractRoommates =
      room.currentContractId && Array.isArray(room.currentContractId.roommates)
        ? room.currentContractId.roommates.map((p) => ({
            name: p.name || null,
            cccd: p.cccd || null,
            phone: p.phone || null,
            dob: p.dob || null,
          }))
        : [];

    // Lấy thông tin điện nước từ building
    const building = room.buildingId;
    const electricityInfo = {
      indexType: building?.eIndexType || "byNumber",
      price: building?.ePrice || 0,
      startIndex: room.eStart || 0,
    };

    const waterInfo = {
      indexType: building?.wIndexType || "byNumber",
      price: building?.wPrice || 0,
      startIndex: room.wStart || 0,
    };

    const formattedServices = buildingServices.map((service) => ({
      id: service._id,
      name: service.name,
      label: service.label || getServiceLabel(service.name),
      description: service.description,
      chargeType: service.chargeType,
      fee: service.fee,
      currency: service.currency,
      displayText: getServiceDisplayText(service),
    }));

    const respRoom = {
      id: room._id,
      _id: room._id,
      roomNumber: room.roomNumber || null,
      images: Array.isArray(room.images) ? room.images : [],
      building: building
        ? {
            _id: building._id ?? building,
            name: building.name,
            address: building.address,
            contact: building.contact || null,
            description: building.description || null,
            electricity: electricityInfo,
            water: waterInfo,
          }
        : null,
      floor: room.floorId
        ? room.floorId.name || room.floorId.floorNumber
        : null,
      area: room.area ?? null,
      price: room.price ?? null,
      currentContract: room.currentContractId
        ? {
            id: room.currentContractId._id,
            no: room.currentContractId.contract?.no || null,
            price: room.currentContractId.contract?.price ?? null,
            startDate: room.currentContractId.contract?.startDate ?? null,
            endDate: room.currentContractId.contract?.endDate ?? null,
            roommates: room.currentContractId.contract?.roommates ?? null,
          }
        : null,
      tenants: accountTenants,
      contractRoommates,
      eStart: room.eStart ?? 0,
      wStart: room.wStart ?? 0,
      currentCount: Array.isArray(room.currentTenantIds)
        ? room.currentTenantIds.length
        : 0,
      maxTenants: room.maxTenants ?? null,
      status: room.status ?? null,
      electricity: electricityInfo,
      water: waterInfo,
      services: formattedServices,
    };

    return res.json({
      room: respRoom,
      furnitures,
    });
  } catch (error) {
    console.error("getMyRoomDetail error:", error);
    return res.status(500).json({ message: "Lỗi lấy thông tin phòng" });
  }
};

function getServiceLabel(serviceName) {
  const labels = {
    internet: "Internet",
    parking: "Chỗ để xe",
    cleaning: "Dọn dẹp",
    security: "An ninh",
    other: "Dịch vụ khác",
  };
  return labels[serviceName] || serviceName;
}

function getServiceDisplayText(service) {
  const { chargeType, fee, currency, label } = service;

  if (chargeType === "included") {
    return "Đã bao gồm";
  }

  const feeText = fee
    ? `${Number(fee).toLocaleString("vi-VN")} ${currency}`
    : "Miễn phí";

  const chargeTexts = {
    perRoom: "/phòng",
    perPerson: "/người",
    included: "",
  };

  return `${feeText}${chargeTexts[chargeType] || ""}`;
}
