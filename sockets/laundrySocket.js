const mongoose = require("mongoose");
const Floor = require("../models/Floor");
const {
  getLaundryStatusForFloor,
} = require("../controllers/Landlord/FloorController");
const {
  getWashersInBuilding,
} = require("../controllers/Landlord/BuildingController");

// floorId -> intervalId
const floorIntervals = new Map();
// buildingId -> intervalId
const buildingIntervals = new Map();

/**
 * Đếm số client đang ở room đó
 */
function getRoomSize(io, room) {
  const roomObj = io.sockets.adapter.rooms.get(room);
  return roomObj ? roomObj.size : 0;
}

/**
 * Interval poll trạng thái máy giặt theo TẦNG
 */
function startFloorInterval(io, floorId, intervalMs = 5000) {
  const room = `floor_laundry_${floorId}`;

  // Đã có interval cho floor này rồi thì bỏ qua
  if (floorIntervals.has(floorId)) return;

  const intervalId = setInterval(async () => {
    try {
      // Không còn client trong room thì dừng interval
      if (getRoomSize(io, room) === 0) {
        clearInterval(intervalId);
        floorIntervals.delete(floorId);
        return;
      }

      const data = await getLaundryStatusForFloor(floorId);
      io.to(room).emit("laundry_status", data);
    } catch (err) {
      console.error("[Laundry][Floor] Interval error:", err.message);
    }
  }, intervalMs);

  floorIntervals.set(floorId, intervalId);
}

/**
 * Interval poll trạng thái máy giặt theo TÒA
 * Dùng chung payload (user + buildingId [+ optional filter]) cho tất cả client trong cùng tòa.
 */
function startBuildingInterval(io, buildingId, payload, intervalMs = 5000) {
  const room = `building_laundry_${buildingId}`;

  if (buildingIntervals.has(buildingId)) return;

  const intervalId = setInterval(async () => {
    try {
      if (getRoomSize(io, room) === 0) {
        clearInterval(intervalId);
        buildingIntervals.delete(buildingId);
        return;
      }

      const data = await getWashersInBuilding(payload);
      io.to(room).emit("laundry_building_status", data);
    } catch (err) {
      console.error("[Laundry][Building] Interval error:", err.message);
    }
  }, intervalMs);

  buildingIntervals.set(buildingId, intervalId);
}

/**
 * Đăng ký các event socket cho giặt sấy.
 * Hàm này được gọi MỖI KHI có connection mới:
 *   setupLaundrySocket(io, socket);
 */
function setupLaundrySocket(io, socket) {
  console.log("[Laundry] Handlers attached for socket", socket.id);

  /**
   * Join realtime theo TẦNG
   * payload: { floorId }
   */
  socket.on("join_laundry_floor", async ({ floorId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(floorId)) {
        return socket.emit("laundry_error", {
          message: "floorId không hợp lệ",
        });
      }

      const floor = await Floor.findById(floorId)
        .select("buildingId isDeleted")
        .lean();

      if (!floor || floor.isDeleted) {
        return socket.emit("laundry_error", {
          message: "Không tìm thấy tầng",
        });
      }

      // TODO: nếu cần, reuse checkManageFloorPermission ở đây với socket.user

      const room = `floor_laundry_${floorId}`;
      socket.join(room);
      console.log(`[Laundry] Socket ${socket.id} join room ${room}`);

      // Gửi trạng thái lần đầu
      try {
        const data = await getLaundryStatusForFloor(floorId);
        socket.emit("laundry_status", data);
      } catch (err) {
        console.error("[Laundry][Floor] First load error:", err.message);
        socket.emit("laundry_error", {
          message: err.message || "Lỗi đọc trạng thái máy giặt",
        });
      }

      // Bắt đầu interval nếu chưa có
      startFloorInterval(io, floorId);
    } catch (err) {
      console.error("[Laundry][Floor] join_laundry_floor error:", err);
      socket.emit("laundry_error", {
        message: "Không thể join realtime tầng",
      });
    }
  });

  socket.on("leave_laundry_floor", ({ floorId }) => {
    const room = `floor_laundry_${floorId}`;
    socket.leave(room);
    console.log(`[Laundry] Socket ${socket.id} leave room ${room}`);
    // Interval tự dừng khi không còn client trong room (check ở startFloorInterval)
  });

  /**
   * Join realtime theo TÒA
   * payload: { buildingId, floorId?, status? }
   * - Quyền / validate đã xử lý bên trong getWashersInBuilding
   */
  socket.on(
    "join_laundry_building",
    async ({ buildingId, floorId, status }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(buildingId)) {
          return socket.emit("laundry_error", {
            message: "buildingId không hợp lệ",
          });
        }

        const payload = {
          user: socket.user,
          buildingId,
          floorId,
          status,
        };

        // Gửi trạng thái lần đầu
        try {
          const data = await getWashersInBuilding(payload);
          socket.emit("laundry_building_status", data);
        } catch (err) {
          console.error("[Laundry][Building] First load error:", err.message);
          return socket.emit("laundry_error", {
            message: err.message || "Lỗi đọc danh sách máy giặt tòa",
          });
        }

        const room = `building_laundry_${buildingId}`;
        socket.join(room);
        console.log(`[Laundry] Socket ${socket.id} join room ${room}`);

        // Interval cho tòa
        startBuildingInterval(io, buildingId, payload);
      } catch (err) {
        console.error("[Laundry][Building] join_laundry_building error:", err);
        socket.emit("laundry_error", {
          message: "Không thể join realtime tòa",
        });
      }
    }
  );

  socket.on("leave_laundry_building", ({ buildingId }) => {
    const room = `building_laundry_${buildingId}`;
    socket.leave(room);
    console.log(`[Laundry] Socket ${socket.id} leave room ${room}`);
    // Interval tự dừng khi không còn client trong room (check ở startBuildingInterval)
  });
}

module.exports = setupLaundrySocket;
