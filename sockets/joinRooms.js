const Room = require("../models/Room");
const Employee = require("../models/Staff");

// Đặt false để tắt log thông báo user join phòng nào
const IS_DEBUG_JOIN = false;

module.exports = async (socket, io) => {
  const user = socket.user;

  // Chỉ log lỗi này vì nó quan trọng
  if (!user?._id) {
    console.error("[Socket] JoinRooms: Socket user không hợp lệ (Missing _id)");
    return;
  }

  const userId = user._id.toString();

  // 1. Join room cá nhân
  socket.join(`user:${userId}`);
  if (IS_DEBUG_JOIN)
    console.log(`[Socket] User ${userId} joined personal room`);

  try {
    // ==================== RESIDENT ====================
    if (user.role === "resident") {
      const rooms = await Room.find({
        currentTenantIds: user._id,
        active: true,
        isDeleted: { $ne: true },
      })
        .select("buildingId floorId _id")
        .lean();

      if (rooms.length > 0) {
        rooms.forEach((room) => {
          const buildingId = room.buildingId.toString();
          socket.join(`building:${buildingId}`);
          if (room.floorId) {
            socket.join(`floor:${room.floorId}`);
          }
          socket.join(`room:${room._id}`);
        });

        if (IS_DEBUG_JOIN)
          console.log(
            `[Socket] Resident ${user.username} joined ${rooms.length} unit(s)`
          );
      }
      return;
    }

    // ==================== STAFF ====================
    if (user.role === "staff") {
      const staff = await Employee.findOne({
        accountId: user._id,
        isDeleted: false,
      })
        .select("assignedBuildings")
        .lean();

      if (staff?.assignedBuildings?.length > 0) {
        staff.assignedBuildings.forEach((buildingId) => {
          const bid = buildingId.toString();
          socket.join(`building:${bid}`);
        });

        if (IS_DEBUG_JOIN)
          console.log(
            `[Socket] Staff ${user.username} joined ${staff.assignedBuildings.length} building(s)`
          );
      }
      return;
    }

    // ==================== LANDLORD ====================
    if (user.role === "landlord") {
      // Landlord thường không cần auto-join room cụ thể nào lúc đầu
      // trừ khi có logic riêng.
      return;
    }
  } catch (error) {
    // Log lỗi gọn gàng
    console.error(
      `[Socket] JoinRooms Error for user ${userId}:`,
      error.message
    );
  }
};
