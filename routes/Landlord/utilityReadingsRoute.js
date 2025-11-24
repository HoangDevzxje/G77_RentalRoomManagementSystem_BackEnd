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
 * /landlords/utility-readings/rooms:
 *   get:
 *     summary: Lấy danh sách phòng để nhập chỉ số điện nước theo kỳ
 *     description: >
 *       Trả về danh sách phòng thuộc landlord hiện tại, đang được thuê và có hợp đồng completed,
 *       hiệu lực trong kỳ periodMonth/periodYear. Kèm trạng thái đã nhập điện/nước và template
 *       để FE bind form nhập nhanh.
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà
 *       - in: query
 *         name: periodMonth
 *         schema:
 *           type: integer
 *         description: Tháng kỳ cần nhập chỉ số (mặc định = tháng hiện tại)
 *       - in: query
 *         name: periodYear
 *         schema:
 *           type: integer
 *         description: Năm kỳ cần nhập chỉ số (mặc định = năm hiện tại)
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Tìm theo số phòng (roomNumber)
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
 *         description: Danh sách phòng đủ điều kiện nhập chỉ số trong kỳ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       roomNumber:
 *                         type: string
 *                       status:
 *                         type: string
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           address:
 *                             type: string
 *                       floorId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           floorNumber:
 *                             type: integer
 *                       meterStatus:
 *                         type: object
 *                         description: Trạng thái đã nhập chỉ số điện/nước trong kỳ
 *                         properties:
 *                           electricity:
 *                             type: object
 *                             properties:
 *                               hasReading:
 *                                 type: boolean
 *                               status:
 *                                 type: string
 *                                 nullable: true
 *                                 description: Trạng thái reading (draft, confirmed, billed)
 *                           water:
 *                             type: object
 *                             properties:
 *                               hasReading:
 *                                 type: boolean
 *                               status:
 *                                 type: string
 *                                 nullable: true
 *                                 description: Trạng thái reading (draft, confirmed, billed)
 *                       readingTemplate:
 *                         type: object
 *                         description: Template để FE bind form nhập chỉ số
 *                         properties:
 *                           roomId:
 *                             type: string
 *                           periodMonth:
 *                             type: integer
 *                           periodYear:
 *                             type: integer
 *                           electricity:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 enum: [electricity]
 *                               currentIndex:
 *                                 type: number
 *                                 nullable: true
 *                               unitPrice:
 *                                 type: number
 *                                 nullable: true
 *                               readingDate:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                           water:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 enum: [water]
 *                               currentIndex:
 *                                 type: number
 *                                 nullable: true
 *                               unitPrice:
 *                                 type: number
 *                                 nullable: true
 *                               readingDate:
 *                                 type: string
 *                                 format: date-time
 *                                 nullable: true
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 periodMonth:
 *                   type: integer
 *                 periodYear:
 *                   type: integer
 *       401:
 *         description: Không có quyền truy cập
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

/**
 * @swagger
 * /landlords/utility-readings/bulk:
 *   post:
 *     summary: Tạo hàng loạt chỉ số điện/nước cho nhiều phòng trong một kỳ
 *     description: >
 *       Cho phép landlord nhập chỉ số điện/nước cho nhiều phòng trong cùng một kỳ.
 *       Mỗi object trong mảng readings tương ứng với một chỉ số (1 phòng, 1 loại, 1 kỳ).
 *       Mỗi phần tử được xử lý độc lập: phòng nào lỗi sẽ có error riêng, không chặn các phòng khác.
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               readings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - roomId
 *                     - type
 *                     - periodMonth
 *                     - periodYear
 *                     - currentIndex
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [electricity, water]
 *                     periodMonth:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 12
 *                     periodYear:
 *                       type: integer
 *                     currentIndex:
 *                       type: number
 *                       minimum: 0
 *                     unitPrice:
 *                       type: number
 *                       description: Đơn giá trên mỗi đơn vị tiêu thụ (tuỳ loại điện/nước)
 *                     readingDate:
 *                       type: string
 *                       format: date-time
 *                       description: Ngày ghi nhận chỉ số (mặc định = thời điểm hiện tại nếu không truyền)
 *     responses:
 *       200:
 *         description: Xử lý thành công (có thể có một số phòng lỗi, xem chi tiết trong data)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   description: Kết quả theo từng phần tử readings
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                         description: Vị trí trong mảng readings gốc
 *                       roomId:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [electricity, water]
 *                       periodMonth:
 *                         type: integer
 *                       periodYear:
 *                         type: integer
 *                       success:
 *                         type: boolean
 *                       error:
 *                         type: string
 *                         nullable: true
 *                       data:
 *                         type: object
 *                         nullable: true
 *                         description: Document UtilityReading đã tạo (nếu success = true)
 *                 total:
 *                   type: integer
 *                   description: Tổng số phần tử readings đã xử lý
 *                 successCount:
 *                   type: integer
 *                 failCount:
 *                   type: integer
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc toàn bộ readings đều lỗi
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */

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
router.get(
  "/rooms",
  checkAuthorize("landlord"),
  utilityController.listRoomsForUtility
);
router.get("/", checkAuthorize("landlord"), utilityController.listReadings);
router.post("/", checkAuthorize("landlord"), utilityController.createReading);

router.post(
  "/bulk",
  checkAuthorize("landlord"),
  utilityController.bulkCreateReadings
);
router.post(
  "/:id/confirm",
  checkAuthorize("landlord"),
  utilityController.confirmReading
);
router.delete(
  "/:id",
  checkAuthorize("landlord"),
  utilityController.deleteReading
);
router.patch(
  "/:id",
  checkAuthorize("landlord"),
  utilityController.updateReading
);
router.get("/:id", checkAuthorize("landlord"), utilityController.getReading);

module.exports = router;
