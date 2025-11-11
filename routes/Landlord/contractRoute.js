const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const contractController = require("../controllers/landlord/ContractController");

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
