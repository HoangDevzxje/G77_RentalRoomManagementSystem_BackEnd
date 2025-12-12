const mongoose = require("mongoose");
const Floor = require("../models/Floor");
const {
  getLaundryStatusForFloor,
} = require("../controllers/Landlord/FloorController");
const {
  getLaundryDevicesInBuilding,
} = require("../controllers/Landlord/BuildingController");

// --- CONFIG ---
const IS_DEBUG = false;

const floorIntervals = new Map();
const buildingIntervals = new Map();

function getRoomSize(io, room) {
  const roomObj = io.sockets.adapter.rooms.get(room);
  return roomObj ? roomObj.size : 0;
}

/**
 * Interval poll trạng thái máy giặt theo TẦNG
 */
function startFloorInterval(io, floorId, intervalMs = 5000) {
  const room = `floor_laundry_${floorId}`;

  if (floorIntervals.has(floorId)) return;

  const intervalId = setInterval(async () => {
    try {
      if (getRoomSize(io, room) === 0) {
        clearInterval(intervalId);
        floorIntervals.delete(floorId);
        if (IS_DEBUG)
          console.log(
            `[Laundry] Stopped interval for floor ${floorId} (empty room)`
          );
        return;
      }

      const data = await getLaundryStatusForFloor(floorId);
      io.to(room).emit("laundry_status", data);
    } catch (err) {
      console.error(`[Laundry][Floor][Err] Floor ${floorId}:`, err.message);
    }
  }, intervalMs);

  floorIntervals.set(floorId, intervalId);
}

/**
 * Interval poll trạng thái máy giặt theo TÒA
 */
function startBuildingInterval(io, buildingId, payload, intervalMs = 5000) {
  const room = `building_laundry_${buildingId}`;

  if (buildingIntervals.has(buildingId)) return;

  const intervalId = setInterval(async () => {
    try {
      if (getRoomSize(io, room) === 0) {
        clearInterval(intervalId);
        buildingIntervals.delete(buildingId);
        if (IS_DEBUG)
          console.log(
            `[Laundry] Stopped interval for building ${buildingId} (empty room)`
          );
        return;
      }

      const data = await getLaundryDevicesInBuilding(payload);
      io.to(room).emit("laundry_building_status", data);
    } catch (err) {
      console.error(
        `[Laundry][Building][Err] Building ${buildingId}:`,
        err.message
      );
    }
  }, intervalMs);

  buildingIntervals.set(buildingId, intervalId);
}

/**
 * Đăng ký các event socket cho giặt sấy.
 */
function setupLaundrySocket(io, socket) {
  if (IS_DEBUG)
    console.log("[Laundry] Handlers attached for socket", socket.id);

  // --- JOIN TẦNG ---
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
        return socket.emit("laundry_error", { message: "Không tìm thấy tầng" });
      }

      const room = `floor_laundry_${floorId}`;
      socket.join(room);

      if (IS_DEBUG)
        console.log(`[Laundry] Socket ${socket.id} join room ${room}`);

      // Gửi trạng thái lần đầu
      try {
        const data = await getLaundryStatusForFloor(floorId);
        socket.emit("laundry_status", data);
      } catch (err) {
        console.error("[Laundry][Floor] First load error:", err.message);
        socket.emit("laundry_error", {
          message: err.message || "Lỗi đọc trạng thái",
        });
      }

      startFloorInterval(io, floorId);
    } catch (err) {
      console.error("[Laundry][Floor] join error:", err.message);
      socket.emit("laundry_error", { message: "Không thể join realtime tầng" });
    }
  });

  socket.on("leave_laundry_floor", ({ floorId }) => {
    const room = `floor_laundry_${floorId}`;
    socket.leave(room);
    if (IS_DEBUG)
      console.log(`[Laundry] Socket ${socket.id} leave room ${room}`);
  });

  // --- JOIN TÒA ---
  socket.on(
    "join_laundry_building",
    async ({ buildingId, floorId, status }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(buildingId)) {
          return socket.emit("laundry_error", {
            message: "buildingId không hợp lệ",
          });
        }

        const payload = { user: socket.user, buildingId, floorId, status };

        try {
          const data = await getLaundryDevicesInBuilding(payload);
          socket.emit("laundry_building_status", data);
        } catch (err) {
          console.error("[Laundry][Building] First load error:", err.message);
          return socket.emit("laundry_error", {
            message: err.message || "Lỗi đọc danh sách",
          });
        }

        const room = `building_laundry_${buildingId}`;
        socket.join(room);
        if (IS_DEBUG)
          console.log(`[Laundry] Socket ${socket.id} join room ${room}`);

        startBuildingInterval(io, buildingId, payload);
      } catch (err) {
        console.error("[Laundry][Building] join error:", err.message);
        socket.emit("laundry_error", {
          message: "Không thể join realtime tòa",
        });
      }
    }
  );

  socket.on("leave_laundry_building", ({ buildingId }) => {
    const room = `building_laundry_${buildingId}`;
    socket.leave(room);
    if (IS_DEBUG)
      console.log(`[Laundry] Socket ${socket.id} leave room ${room}`);
  });
}

module.exports = setupLaundrySocket;
