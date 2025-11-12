const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const contractController = require("../../controllers/Landlord/ContractController");
const checkSubscription = require("../../middleware/checkSubscription");

router.post(
  "/from-contact",
  checkAuthorize("landlord"),
  contractController.createFromContact
);
router.put("/:id", checkAuthorize("landlord"), contractController.updateData);
router.post(
  "/:id/sign-landlord",
  checkAuthorize("landlord"),
  contractController.signByLandlord
);
router.post(
  "/:id/send-to-tenant",
  checkAuthorize("landlord"),
  contractController.sendToTenant
);
router.get("/:id", checkAuthorize("landlord"), contractController.getDetail);

module.exports = router;
