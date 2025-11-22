const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const utilityController = require("../../controllers/Landlord/UtilityReadingController");

/**
 * @swagger
 * tags:
 *   - name: Utility Readings
 *     description: Quản lý chỉ số điện / nước theo phòng
 */

/**
 * @swagger
 * /landlords/utility-readings:
 *   get:
 *     summary: Lấy danh sách chỉ số điện/nước
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [electricity, water]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, confirmed, billed]
 *       - in: query
 *         name: periodMonth
 *         schema:
 *           type: integer
 *       - in: query
 *         name: periodYear
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Danh sách chỉ số
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       buildingId: { type: string }
 *                       roomId: { type: string }
 *                       type:
 *                         type: string
 *                         enum: [electricity, water]
 *                       periodMonth: { type: integer }
 *                       periodYear: { type: integer }
 *                       readingDate:
 *                         type: string
 *                         format: date-time
 *                       previousIndex: { type: number }
 *                       currentIndex: { type: number }
 *                       consumption: { type: number }
 *                       unitPrice: { type: number }
 *                       amount: { type: number }
 *                       status:
 *                         type: string
 *                         enum: [draft, confirmed, billed]
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get("/", checkAuthorize("landlord"), utilityController.listReadings);

/**
 * @swagger
 * /landlords/utility-readings:
 *   post:
 *     summary: Tạo kỳ đọc chỉ số điện/nước cho một phòng
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomId, type, periodMonth, periodYear, currentIndex]
 *             properties:
 *               roomId:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [electricity, water]
 *               periodMonth:
 *                 type: integer
 *                 example: 11
 *               periodYear:
 *                 type: integer
 *                 example: 2025
 *               currentIndex:
 *                 type: number
 *                 example: 150
 *               unitPrice:
 *                 type: number
 *                 example: 3500
 *               readingDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.post("/", checkAuthorize("landlord"), utilityController.createReading);

/**
 * @swagger
 * /landlords/utility-readings/{id}:
 *   get:
 *     summary: Xem chi tiết một kỳ chỉ số
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thông tin chỉ số
 *       404:
 *         description: Không tìm thấy
 */
router.get("/:id", checkAuthorize("landlord"), utilityController.getReading);

/**
 * @swagger
 * /landlords/utility-readings/{id}:
 *   patch:
 *     summary: Cập nhật chỉ số khi còn draft
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentIndex:
 *                 type: number
 *               unitPrice:
 *                 type: number
 *               readingDate:
 *                 type: string
 *                 format: date-time
 *               periodMonth:
 *                 type: integer
 *               periodYear:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Không cho sửa vì đã confirmed/billed
 */
router.patch(
  "/:id",
  checkAuthorize("landlord"),
  utilityController.updateReading
);

/**
 * @swagger
 * /landlords/utility-readings/{id}/confirm:
 *   post:
 *     summary: Xác nhận và khóa chỉ số
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đã xác nhận
 *       400:
 *         description: Không thể xác nhận
 */
router.post(
  "/:id/confirm",
  checkAuthorize("landlord"),
  utilityController.confirmReading
);

/**
 * @swagger
 * /landlords/utility-readings/{id}:
 *   delete:
 *     summary: Xóa mềm một kỳ chỉ số (khi chưa lên hóa đơn)
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đã xóa
 *       400:
 *         description: Không thể xóa (đã billed)
 */
router.delete(
  "/:id",
  checkAuthorize("landlord"),
  utilityController.deleteReading
);

module.exports = router;
