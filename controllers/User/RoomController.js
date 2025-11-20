const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const Account = require("../../models/Account");

exports.getMyRoomDetail = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res
        .status(403)
        .json({ message: "Chỉ resident mới được dùng API này" });
    }

    const tenantId = req.user._id;

    const room = await Room.findOne({
      currentTenantIds: tenantId,
      status: "rented",
      isDeleted: false,
      active: true,
    })
      .populate({ path: "buildingId", select: "name address contact" })
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

    const roomFurnitures = await RoomFurniture.find({ roomId: room._id })
      .populate({ path: "furnitureId", select: "name" })
      .lean();

    const furnitures = roomFurnitures.map((rf) => ({
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

    const respRoom = {
      roomNumber: room.roomNumber || null,
      images: Array.isArray(room.images) ? room.images : [],
      building: room.buildingId
        ? {
            name: room.buildingId.name,
            address: room.buildingId.address,
            contact: room.buildingId.contact || null,
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
          }
        : null,
      tenants: accountTenants,
      contractRoommates,
      eStart: room.eStart ?? 0,
      wStart: room.wStart ?? 0,
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
