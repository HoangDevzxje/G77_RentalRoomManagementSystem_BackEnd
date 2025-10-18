const express = require("express");
const router = express.Router();
const svc = require("../controllers/BuildingServiceController");
const { checkAuthorize } = require("../middleware/authMiddleware");

// Lấy danh sách dịch vụ của 1 tòa
router.get(
  "/:buildingId/services",
  checkAuthorize(["admin", "landlord"]),
  svc.listByBuilding
);

// Tạo dịch vụ mới
router.post(
  "/:buildingId/services",
  checkAuthorize(["admin", "landlord"]),
  svc.create
);

// Cập nhật dịch vụ
router.patch(
  "/:buildingId/services/:id",
  checkAuthorize(["admin", "landlord"]),
  svc.update
);

// Xóa mềm dịch vụ
router.delete(
  "/:buildingId/services/:id",
  checkAuthorize(["admin", "landlord"]),
  svc.remove
);

// Khôi phục dịch vụ đã xóa
router.post(
  "/:buildingId/services/:id/restore",
  checkAuthorize(["admin", "landlord"]),
  svc.restore
);

module.exports = router;
