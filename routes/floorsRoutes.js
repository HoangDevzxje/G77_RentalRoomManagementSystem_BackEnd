const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const FloorCtrl = require("../controllers/FloorController");
const checkSubscription = require("../middleware/checkSubscription");

router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident"]),
  FloorCtrl.list
);
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord", "resident"]),
  FloorCtrl.getById
);
router.post(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.create
);
router.post(
  "/quick-create",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.quickCreate
);
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.update
);
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.remove
);

module.exports = router;
