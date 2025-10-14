const authRoutes = require('./authRoute');
const buildingRoutes = require("./buildingRoutes");
const floorRoutes = require("./floorsRoutes");
const roomRoutes = require("./roomsRoutes");
const packageRoutes = require("./packageRoutes");
const subscriptionRoutes = require("./subscriptionRoutes");
const furnitureRoutes = require("./furnitureRoutes");
const userRoutes = require("./userRoute");
const routes = (app) => {
    app.use('/auth', authRoutes);
    app.use("/buildings", buildingRoutes);
    app.use("/floors", floorRoutes);
    app.use("/rooms", roomRoutes);
    app.use("/subscriptions", subscriptionRoutes);
    app.use("/packages", packageRoutes);
    app.use("/furnitures", furnitureRoutes);
    app.use("/users", userRoutes);
}

module.exports = routes