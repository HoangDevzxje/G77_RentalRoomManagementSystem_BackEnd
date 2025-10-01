const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const BuildingCtrl = require("../controllers/BuildingController");

router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident"]),
  BuildingCtrl.list
);
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord", "resident"]),
  BuildingCtrl.getById
);
router.post("/", checkAuthorize(["admin", "landlord"]), BuildingCtrl.create);
router.put("/:id", checkAuthorize(["admin", "landlord"]), BuildingCtrl.update);
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  BuildingCtrl.remove
);

module.exports = router;
