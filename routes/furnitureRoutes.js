const router = require("express").Router();
const FurnitureCtrl = require("../controllers/FurnitureController");
const BuildingFurnitureCtrl = require("../controllers/BuildingFurnitureController");
const RoomFurnitureCtrl = require("../controllers/RoomFurnitureController");
const { checkAuthorize } = require("../middleware/authMiddleware");
const checkSubscription = require("../middleware/checkSubscription");

// FURNITURE LIST/CREATE trước
router.post(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.create
);
router.get(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.getAll
);

// BUILDING FURNITURE (đặt TRƯỚC :id)
router.post(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.create
);
router.post(
  "/building/bulk",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.bulkCreate
);
router.get(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.getAll
);
router.get(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.getOne
);
router.put(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.update
);
router.delete(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.remove
);
router.post(
  "/:buildingId/apply-to-rooms",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.applyToRooms
);

// ROOM FURNITURE (đặt TRƯỚC :id)
router.post(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.create
);
router.get(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.getAll
);
router.get(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.getOne
);
router.put(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.update
);
router.delete(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.remove
);

// Cuối cùng mới là các route theo ID của FURNITURE
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.getOne
);
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.update
);
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.remove
);

module.exports = router;
