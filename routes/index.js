const authRoutes = require('./authRoute');
const buildingRoutes = require("./buildingRoutes");
const floorRoutes = require("./floorsRoutes");
const roomRoutes = require("./roomsRoutes");
const routes = (app) => {
    app.use('/auth', authRoutes);
    app.use("/buildings", buildingRoutes);
    app.use("/floors", floorRoutes);
    app.use("/rooms", roomRoutes);
}

module.exports = routes