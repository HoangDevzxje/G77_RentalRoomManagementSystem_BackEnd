const router = require("express").Router();
const FurnitureCtrl = require("../controllers/FurnitureController");
const BuildingFurnitureCtrl = require("../controllers/BuildingFurnitureController");
const RoomFurnitureCtrl = require("../controllers/RoomFurnitureController");
const { checkAuthorize } = require("../middleware/authMiddleware");

// FURNITURE
router.post("/", checkAuthorize(["admin", "landlord"]), FurnitureCtrl.create);
router.get("/", checkAuthorize(["admin", "landlord"]), FurnitureCtrl.getAll);
router.get("/:id", checkAuthorize(["admin", "landlord"]), FurnitureCtrl.getOne);
router.put("/:id", checkAuthorize(["admin", "landlord"]), FurnitureCtrl.update);
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  FurnitureCtrl.remove
);

// BUILDING FURNITURE
router.post(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.create
);

router.post(
  "/building/bulk",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.bulkCreate
);

router.get(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.getAll
);
router.get(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.getOne
);
router.put(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.update
);
router.delete(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.remove
);
// Áp định mức nội thất của tòa xuống các phòng
router.post(
  "/:buildingId/apply-to-rooms",
  checkAuthorize(["admin", "landlord"]),
  BuildingFurnitureCtrl.applyToRooms
);

// ROOM FURNITURE
router.post(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  RoomFurnitureCtrl.create
);
router.get(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  RoomFurnitureCtrl.getAll
);
router.get(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  RoomFurnitureCtrl.getOne
);
router.put(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  RoomFurnitureCtrl.update
);
router.delete(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  RoomFurnitureCtrl.remove
);

module.exports = router;
