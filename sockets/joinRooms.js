const Room = require("../models/Room");
const Employee = require("../models/Staff");

module.exports = async (socket, io) => {
    const user = socket.user;
    if (!user?._id) {
        console.error("Socket user không hợp lệ");
        return;
    }

    const userId = user._id.toString();

    // 1. LUÔN join room cá nhân – bắt buộc để nhận tin riêng
    socket.join(`user:${userId}`);
    console.log(`User ${userId} (${user.role}) joined personal room: user:${userId}`);

    try {
        // ==================== RESIDENT ====================
        if (user.role === "resident") {
            const rooms = await Room.find({
                currentTenantIds: user._id,
                active: true,
                isDeleted: { $ne: true }
            })
                .select("buildingId floorId _id")
                .lean();

            if (rooms.length === 0) {
                console.log(`Resident ${userId} chưa thuê phòng nào`);
                return;
            }

            rooms.forEach(room => {
                const buildingId = room.buildingId.toString();
                socket.join(`building:${buildingId}`);
                if (room.floorId) {
                    socket.join(`floor:${room.floorId}`);
                }
                socket.join(`room:${room._id}`);
            });

            console.log(`Resident ${user.fullName || user.username} joined ${rooms.length} room(s)`);
            return;
        }

        // ==================== STAFF ====================
        if (user.role === "staff") {
            const staff = await Employee.findOne({
                accountId: user._id,
                isDeleted: false
            })
                .select("assignedBuildings")
                .lean();

            if (!staff || !staff.assignedBuildings || staff.assignedBuildings.length === 0) {
                console.log(`Staff ${userId} chưa được phân công tòa nhà nào`);
                return;
            }

            staff.assignedBuildings.forEach(buildingId => {
                const bid = buildingId.toString();
                socket.join(`building:${bid}`);
            });

            console.log(`Staff ${user.fullName || user.username} joined ${staff.assignedBuildings.length} building(s)`);
            return;
        }

        // ==================== LANDLORD ====================
        if (user.role === "landlord") {
            console.log(`Landlord ${user.fullName || user.username} connected – only personal room`);
            return;
        }

    } catch (error) {
        console.error("Lỗi trong joinRooms:", error);
    }
};