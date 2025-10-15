const express = require("express");
const router = express.Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const RegulationCtrl = require("../controllers/RegulationController");

// Tenant & Landlord đều xem được
router.get(
  "/",
  checkAuthorize(["admin", "landlord", "tenant"]),
  RegulationCtrl.getList
);

// Landlord: CRUD
router.post("/", checkAuthorize(["admin", "landlord"]), RegulationCtrl.create);
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  RegulationCtrl.update
);
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  RegulationCtrl.remove
);

module.exports = router;
