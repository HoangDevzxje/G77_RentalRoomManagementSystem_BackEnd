const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const Building = require("../../models/Building");
const BuildingService = require("../../models/BuildingService");
const Contract = require("../../models/Contract");

exports.getMyRoomDetail = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res
        .status(403)
        .json({ message: "Chỉ resident mới được dùng API này" });
    }
    const tenantId = req.user._id;
    if (!tenantId) {
      return res.status(400).json({ message: "Thiếu thông tin người dùng" });
    }
    const { roomId } = req.query;
    const now = new Date();
    const allContracts = await Contract.find({
      tenantId: tenantId,
      status: "completed",
      isDeleted: { $ne: true },
      "contract.endDate": { $gte: now },
    })
      .populate("roomId", "roomNumber buildingId eStart wStart")
      .populate("buildingId", "name eIndexType ePrice wIndexType wPrice")
      .sort({ "contract.startDate": 1 })
      .lean();

    if (!allContracts || allContracts.length === 0) {
      return res.status(404).json({
        message: "Bạn không có hợp đồng thuê phòng nào đang hoạt động.",
      });
    }

    const roomMap = new Map();

    allContracts.forEach((c) => {
      if (!c.roomId?._id) return;

      const rId = c.roomId._id.toString();
      const startDate = new Date(c.contract.startDate);
      const endDate = new Date(c.contract.endDate);

      let currentStatus = "upcoming";
      if (now >= startDate && now <= endDate) {
        currentStatus = "active";
      }

      if (!roomMap.has(rId) || currentStatus === "active") {
        roomMap.set(rId, {
          _id: rId,
          roomNumber: c.roomId.roomNumber,
          buildingName: c.buildingId?.name || "Tòa nhà",
          status: currentStatus,
          contract: {
            _id: c._id,
            contractNo: c.contract.no || `HD${c._id.toString().slice(-6).toUpperCase()}`,
            startDate: startDate,
            endDate: endDate,
            status: currentStatus,
          },
        });
      }
    });

    const availableRooms = Array.from(roomMap.values());
    const targetRoomInfo =
      (roomId ? availableRooms.find((r) => r._id === roomId) : null) ||
      availableRooms[0];

    const roomDetail = await Room.findById(targetRoomInfo._id)
      .populate({
        path: "buildingId",
        select:
          "name address contact eIndexType ePrice wIndexType wPrice description images",
      })
      .populate({
        path: "floorId",
        select: "level",
      })
      .populate({
        path: "currentTenantIds",
        select: "_id username userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .lean();

    if (!roomDetail) {
      return res.status(404).json({ message: "Dữ liệu phòng không tồn tại" });
    }

    const [buildingServices, roomFurnitures] = await Promise.all([
      BuildingService.find({
        buildingId: roomDetail.buildingId?._id,
        isDeleted: false,
      }).lean(),
      RoomFurniture.find({ roomId: roomDetail._id })
        .populate({ path: "furnitureId", select: "name" })
        .lean(),
    ]);

    const furnitures = roomFurnitures.map((rf) => ({
      _id: rf.furnitureId?._id,
      name: rf.furnitureId?.name || "Nội thất không tên",
      quantity: rf.quantity ?? 0,
      condition: rf.condition ?? null,
    }));

    const formattedServices = buildingServices.map((s) => ({
      _id: s._id,
      name: s.name,
      label: s.label || getServiceLabel(s.name),
      description: s.description,
      chargeType: s.chargeType,
      fee: s.fee,
      currency: s.currency,
      displayText: getServiceDisplayText(s),
    }));

    return res.json({
      success: true,
      data: {
        room: {
          _id: roomDetail._id,
          roomNumber: roomDetail.roomNumber,
          userRoomStatus: targetRoomInfo.status,
          images: roomDetail.images || roomDetail.buildingId?.images || [],
          building: roomDetail.buildingId,
          floor: {
            _id: roomDetail.floorId?._id,
            level: roomDetail.floorId?.level,
          },
          area: roomDetail.area,
          price: roomDetail.price,
          tenants: roomDetail.currentTenantIds.map((t) => ({
            _id: t._id,
            fullName: t.userInfo?.fullName || t.username,
            phoneNumber: t.userInfo?.phoneNumber,
          })),
          electricity: {
            indexType: roomDetail.buildingId?.eIndexType || "byNumber",
            price: roomDetail.buildingId?.ePrice || 0,
            startIndex: roomDetail.eStart || 0,
          },
          water: {
            indexType: roomDetail.buildingId?.wIndexType || "byNumber",
            price: roomDetail.buildingId?.wPrice || 0,
            startIndex: roomDetail.wStart || 0,
          },
          services: formattedServices,
        },
        furnitures,
        availableRooms,
      },
      message: "Lấy thông tin phòng thành công",
    });
  } catch (error) {
    console.error("Error in getMyRoomDetail:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

exports.getMyRoomsList = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res.status(403).json({
        success: false,
        message: "Chỉ resident mới được dùng API này",
      });
    }

    const tenantId = req.user._id;
    const now = new Date();

    const allContracts = await Contract.find({
      tenantId: tenantId,
      status: "completed",
      isDeleted: { $ne: true },
      "contract.endDate": { $gte: now },
    })
      .populate("roomId", "roomNumber buildingId")
      .populate("buildingId", "name")
      .sort({ "contract.startDate": 1 })
      .lean();

    if (!allContracts || allContracts.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hợp đồng." });
    }

    const roomMap = new Map();

    allContracts.forEach((c) => {
      if (!c.roomId?._id) return;

      const rId = c.roomId._id.toString();
      const startDate = new Date(c.contract.startDate);
      const endDate = new Date(c.contract.endDate);
      const status = now >= startDate && now <= endDate ? "active" : "upcoming";

      const contractData = {
        _id: c._id,
        contractNo:
          c.contract?.no || `HD${c._id.toString().slice(-6).toUpperCase()}`,
        startDate: c.contract.startDate,
        endDate: c.contract.endDate,
        status: status,
      };

      if (!roomMap.has(rId) || status === "active") {
        roomMap.set(rId, {
          _id: rId,
          roomNumber: c.roomId.roomNumber,
          buildingName: c.buildingId?.name || "Tòa nhà",
          status: status,
          contract: contractData,
          formattedStartDate: formatContractDate(c.contract.startDate),
          formattedEndDate: formatContractDate(c.contract.endDate),
        });
      }
    });

    const result = Array.from(roomMap.values()).sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return 0;
    });

    return res.json({
      success: true,
      data: { rooms: result, total: result.length },
      message: "Lấy danh sách phòng thành công",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

function formatContractDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${date.getFullYear()}`;
}

function getServiceLabel(name) {
  const map = {
    internet: "Internet",
    parking: "Chỗ để xe",
    cleaning: "Dọn dẹp",
    security: "An ninh",
  };
  return map[name] || name;
}

function getServiceDisplayText(service) {
  const { chargeType, fee, currency } = service;
  if (chargeType === "included") return "Đã bao gồm";
  const feeText = fee
    ? `${Number(fee).toLocaleString("vi-VN")} ${currency}`
    : "Miễn phí";
  const chargeTexts = { perRoom: "/phòng", perPerson: "/người" };
  return `${feeText}${chargeTexts[chargeType] || ""}`;
}
