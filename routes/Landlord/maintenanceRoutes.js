const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Landlord/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

router.get(
  "/",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.listRequests
);


router.get(
  "/:id",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.getRequest
);

router.patch(
  "/:id",
  checkAuthorize(["landlord", "admin"]),
  ctrl.updateRequest
);


router.post(
  "/:id/comment",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.comment
);

module.exports = router;
