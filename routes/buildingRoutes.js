const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const BuildingCtrl = require("../controllers/BuildingController");
const checkSubscription = require("../middleware/checkSubscription");

router.get("/", checkAuthorize(["admin", "landlord", "resident"]), BuildingCtrl.list);
router.get("/:id", checkAuthorize(["admin", "landlord", "resident"]), BuildingCtrl.getById);
router.post("/", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.create);
router.put("/:id", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.update);
router.delete("/:id", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.remove);

module.exports = router;
