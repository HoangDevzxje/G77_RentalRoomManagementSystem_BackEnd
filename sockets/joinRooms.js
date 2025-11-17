const Room = require("../models/Room");
const Building = require("../models/Building");
const Employee = require("../models/Staff");
module.exports = async (socket, io) => {
    const user = socket.user;
    if (!user || !user._id) {
        console.error("Socket user không hợp lệ");
        return;
    }

    const userId = user._id.toString();

    // === 1. Luôn join room cá nhân (dùng để gửi riêng) ===
    socket.join(`user:${userId}`);

    try {
        // === 2. XỬ LÝ THEO ROLE ===
        if (user.role === "landlord") {
            socket.join(`landlord:${userId}`);
            console.log(`Landlord ${user.fullName || user.username} joined landlord room`);
            return;
        }

        if (user.role === "staff") {
            // Lấy thông tin staff để biết assignedBuildings và landlordId
            const staff = await Employee.findOne({ accountId: user._id, isDeleted: false })
                .select("assignedBuildings landlordId")
                .lean();

            if (!staff) {
                console.warn(`Staff không tìm thấy hoặc đã bị xóa: ${userId}`);
                return;
            }

            // Join landlord room (để nhận thông báo từ landlord hoặc staff khác)
            socket.join(`landlord:${staff.landlordId}`);

            // Join tất cả building đang quản lý → nhận thông báo realtime
            if (staff.assignedBuildings && staff.assignedBuildings.length > 0) {
                staff.assignedBuildings.forEach((buildingId) => {
                    const bid = buildingId.toString();
                    socket.join(`building:${bid}`);
                });
            }

            console.log(`Staff ${user.fullName || user.username} joined ${staff.assignedBuildings?.length || 0} buildings`);
            return;
        }

        if (user.role === "resident") {
            // Tìm các phòng đang thuê (active)
            const rooms = await Room.find({
                currentTenantIds: user._id,
                active: true,
                isDeleted: { $ne: true },
            })
                .select("buildingId floorId _id")
                .lean();

            if (rooms.length === 0) {
                console.log(`Tenant ${userId} chưa thuê phòng nào`);
                return;
            }

            const buildingIds = [];
            rooms.forEach((room) => {
                const bid = room.buildingId.toString();
                buildingIds.push(room.buildingId);
                socket.join(`building:${bid}`);

                if (room.floorId) {
                    socket.join(`floor:${room.floorId}`);
                }
                socket.join(`room:${room._id}`);
            });

            // Join landlord room để nhận thông báo scope: "all"
            const landlordIds = await Building.distinct("landlordId", {
                _id: { $in: buildingIds },
            });

            landlordIds.forEach((lid) => {
                socket.join(`landlord:${lid}`);
            });

            console.log(`Tenant ${user.fullName || user.username} joined ${rooms.length} room(s)`);
        }
    } catch (error) {
        console.error("Lỗi trong joinRooms:", error);
    }
};