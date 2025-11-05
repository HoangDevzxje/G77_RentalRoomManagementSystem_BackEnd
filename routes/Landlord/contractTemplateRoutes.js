const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Landlord/ContractTemplateController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * Landlord CRUD trong phạm vi của họ (không có Admin).
 * POST   /landlords/contract-templates
 * GET    /landlords/contract-templates               (list tất cả template thuộc landlord)
 * GET    /landlords/contract-templates/by-building/:buildingId   (lấy 1 template duy nhất theo tòa)
 * PUT    /landlords/contract-templates/:id           (update)
 * DELETE /landlords/contract-templates/:id           (delete)
 */

router.post("/", checkAuthorize, ctrl.create);
router.get("/", checkAuthorize, ctrl.listMine);
router.get("/by-building/:buildingId", checkAuthorize, ctrl.getByBuilding);
router.put("/:id", checkAuthorize, ctrl.update);
router.delete("/:id", checkAuthorize, ctrl.remove);
router.post("/preview", checkAuthorize, ctrl.previewTemplatePdf);

module.exports = router;
