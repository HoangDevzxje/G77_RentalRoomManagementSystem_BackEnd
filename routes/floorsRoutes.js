const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const FloorCtrl = require("../controllers/FloorController");

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
router.post("/", checkAuthorize(["admin", "landlord"]), FloorCtrl.create);
router.put("/:id", checkAuthorize(["admin", "landlord"]), FloorCtrl.update);
router.delete("/:id", checkAuthorize(["admin", "landlord"]), FloorCtrl.remove);

module.exports = router;
