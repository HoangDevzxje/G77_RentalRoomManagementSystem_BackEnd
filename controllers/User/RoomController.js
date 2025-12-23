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

    // 1) Lấy các phòng mà user thuộc currentTenantIds (tenant chính hoặc roommate)
    const myRooms = await Room.find({
      isDeleted: false,
      status: "rented",
      currentTenantIds: tenantId,
    })
      .select("_id")
      .lean();

    if (!myRooms || myRooms.length === 0) {
      return res.status(404).json({
        message: "Bạn chưa thuộc phòng nào đang thuê.",
      });
    }

    // Nếu FE truyền roomId -> bắt buộc roomId phải thuộc myRooms
    if (roomId) {
      const isMine = myRooms.some((r) => String(r._id) === String(roomId));
      if (!isMine) {
        return res.status(403).json({
          message: "Bạn không thuộc phòng này.",
        });
      }
    }

    const roomIds = roomId ? [roomId] : myRooms.map((r) => r._id);

    // 2) Tìm hợp đồng hiệu lực theo roomId (KHÔNG lọc tenantId nữa)
    const allContracts = await Contract.find({
      roomId: { $in: roomIds },
      status: "completed",
      moveInConfirmedAt: { $ne: null },
      isDeleted: { $ne: true },
      "contract.startDate": { $lte: now },
      "contract.endDate": { $gte: now },
    })
      .populate("roomId", "roomNumber buildingId eStart wStart")
      .populate("buildingId", "name eIndexType ePrice wIndexType wPrice")
      .sort({ "contract.startDate": 1 })
      .lean();

    if (!allContracts || allContracts.length === 0) {
      return res.status(403).json({
        message:
          "Bạn chỉ được xem room detail sau khi đã được xác nhận vào ở và hợp đồng đang trong thời gian hiệu lực.",
      });
    }

    // 3) Build availableRooms giống logic cũ
    const roomMap = new Map();

    allContracts.forEach((c) => {
      if (!c.roomId?._id) return;

      const startDate = new Date(c.contract.startDate);
      const endDate = new Date(c.contract.endDate);
      const isActive = now >= startDate && now <= endDate;
      if (!isActive) return;

      const rId = c.roomId._id.toString();
      roomMap.set(rId, {
        _id: rId,
        roomNumber: c.roomId.roomNumber,
        buildingName: c.buildingId?.name || "Tòa nhà",
        status: "active",
        contract: {
          _id: c._id,
          contractNo:
            c.contract.no || `HD${c._id.toString().slice(-6).toUpperCase()}`,
          startDate: startDate,
          endDate: endDate,
          status: "active",
        },
      });
    });

    const availableRooms = Array.from(roomMap.values());
    if (!availableRooms.length) {
      return res.status(403).json({
        message:
          "Bạn chỉ được xem room detail sau khi đã được xác nhận vào ở và hợp đồng đang trong thời gian hiệu lực.",
      });
    }

    // roomId đã được validate belongs-to ở trên, nên chọn chắc chắn được
    const targetRoomInfo =
      (roomId ? availableRooms.find((r) => r._id === String(roomId)) : null) ||
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

    // 1) Lấy danh sách phòng user đang thuộc currentTenantIds
    const myRooms = await Room.find({
      isDeleted: false,
      status: "rented",
      currentTenantIds: tenantId,
    })
      .select("_id")
      .lean();

    if (!myRooms || myRooms.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bạn chưa thuộc phòng nào đang thuê.",
      });
    }

    const roomIds = myRooms.map((r) => r._id);

    // 2) Lấy hợp đồng hiệu lực theo roomIds (không lọc tenantId)
    const allContracts = await Contract.find({
      roomId: { $in: roomIds },
      status: "completed",
      moveInConfirmedAt: { $ne: null },
      isDeleted: { $ne: true },
      "contract.startDate": { $lte: now },
      "contract.endDate": { $gte: now },
    })
      .populate("roomId", "roomNumber buildingId")
      .populate("buildingId", "name")
      .sort({ "contract.startDate": 1 })
      .lean();

    if (!allContracts || allContracts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng đang hoạt động cho phòng của bạn.",
      });
    }

    const roomMap = new Map();

    allContracts.forEach((c) => {
      if (!c.roomId?._id) return;

      const rId = c.roomId._id.toString();
      const startDate = new Date(c.contract.startDate);
      const endDate = new Date(c.contract.endDate);
      const isActive = now >= startDate && now <= endDate;
      if (!isActive) return;

      const contractData = {
        _id: c._id,
        contractNo:
          c.contract?.no || `HD${c._id.toString().slice(-6).toUpperCase()}`,
        startDate: c.contract.startDate,
        endDate: c.contract.endDate,
        status: "active",
      };

      roomMap.set(rId, {
        _id: rId,
        roomNumber: c.roomId.roomNumber,
        buildingName: c.buildingId?.name || "Tòa nhà",
        status: "active",
        contract: contractData,
        formattedStartDate: formatContractDate(c.contract.startDate),
        formattedEndDate: formatContractDate(c.contract.endDate),
      });
    });

    const result = Array.from(roomMap.values());

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
