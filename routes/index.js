const authRoutes = require("./authRoute");
const buildingRoutes = require("./buildingRoutes");
const floorRoutes = require("./floorsRoutes");
const roomRoutes = require("./roomsRoutes");
const packageRoutes = require("././Admin/packageRoutes");
const subscriptionRoutes = require("./subscriptionRoutes");
const furnitureRoutes = require("./furnitureRoutes");
const userRoutes = require("./userRoute");
const regulationRoutes = require("./regulationRoutes");
const buildingServiceRoutes = require("./buildingServiceRoutes");
const postLandlord = require("././Landlord/postRoute");
const postUser = require("././User/postRoute");
const accountAdmin = require("././Admin/accountRoute");
const scheduleRoute = require("././Landlord/scheduleRoute");
const bookingRoute = require("././User/bookingRoute");
const bookingLandlord = require("././Landlord/bookingRoute");

const routes = (app) => {
  app.use("/auth", authRoutes);
  app.use("/buildings", buildingRoutes);
  app.use("/buildings", buildingServiceRoutes);
  app.use("/floors", floorRoutes);
  app.use("/rooms", roomRoutes);
  app.use("/subscriptions", subscriptionRoutes);
  app.use("/admin/packages", packageRoutes);
  app.use("/furnitures", furnitureRoutes);
  app.use("/users", userRoutes);
  app.use("/regulations", regulationRoutes);
  app.use("/landlords", postLandlord);
  app.use("/landlords/schedules", scheduleRoute);
  app.use("/landlords/bookings", bookingLandlord);
  app.use("/posts", postUser);
  app.use("/admin", accountAdmin);
  app.use("/bookings", bookingRoute);
};

module.exports = routes;
