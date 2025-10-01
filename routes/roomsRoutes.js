const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const RoomCtrl = require("../controllers/RoomController");

router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident"]),
  RoomCtrl.list
);
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord", "resident"]),
  RoomCtrl.getById
);
router.post("/", checkAuthorize(["admin", "landlord"]), RoomCtrl.create);
router.put("/:id", checkAuthorize(["admin", "landlord"]), RoomCtrl.update);
router.delete("/:id", checkAuthorize(["admin", "landlord"]), RoomCtrl.remove);

module.exports = router;
