const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");

exports.getMyRoomDetail = async (req, res) => {
  try {
    if (req.user?.role !== "resident") {
      return res
        .status(403)
        .json({ message: "Chỉ resident mới được dùng API này" });
    }

    const tenantId = req.user._id;

    // Tìm phòng chứa tenant hiện tại
    const room = await Room.findOne({
      currentTenantIds: tenantId,
      status: "rented",
      isDeleted: false,
      active: true,
    })
      .populate({ path: "buildingId", select: "_id name address" })
      .lean();

    if (!room) {
      return res.status(404).json({
        message: "Bạn chưa được gán vào phòng nào hoặc phòng chưa active",
      });
    }

    // Lấy đồ nội thất trong phòng
    const roomFurnitures = await RoomFurniture.find({
      roomId: room._id,
    })
      .populate({
        path: "furnitureId",
        select: "_id name description price status",
      })
      .lean();

    const furnitures = roomFurnitures.map((rf) => ({
      id: rf._id, // id của RoomFurniture 
      furnitureId: rf.furnitureId?._id,
      name: rf.furnitureId?.name,
      description: rf.furnitureId?.description,
      price: rf.furnitureId?.price,
      status: rf.furnitureId?.status, 

      quantity: rf.quantity,
      damageCount: rf.damageCount,
      condition: rf.condition, 
      notes: rf.notes || null,
    }));

    return res.json({
      room: {
        id: room._id,
        roomNumber: room.roomNumber,
        floorId: room.floorId,
        building: room.buildingId,
        area: room.area,
        price: room.price,
        status: room.status,
        currentTenantIds: room.currentTenantIds,
      },
      furnitures,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Lỗi lấy thông tin phòng" });
  }
};
