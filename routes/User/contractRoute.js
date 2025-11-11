const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const contractController = require("../controllers/landlord/ContractController");

router.get("/", checkAuthorize("resident"), contractController.listMyContracts);
router.get(
  "/:id",
  checkAuthorize("resident"),
  contractController.getMyContract
);
router.post(
  "/:id/sign",
  checkAuthorize("resident"),
  contractController.signByTenant
);

module.exports = router;
