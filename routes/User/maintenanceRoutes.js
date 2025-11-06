const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/User/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

router.post("/", checkAuthorize(["resident"]), ctrl.createRequest);

router.get("/:id", checkAuthorize(["resident"]), ctrl.getRequest);

router.post("/:id/comment", checkAuthorize(["resident"]), ctrl.comment);

module.exports = router;
