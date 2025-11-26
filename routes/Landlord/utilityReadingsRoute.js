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
 *       Trả về danh sách phòng đang có hợp đồng hiệu lực trong kỳ (tháng/năm) để nhập chỉ số điện nước.
 *       Mỗi phòng bao gồm thông tin tòa nhà, trạng thái chỉ số hiện tại trong kỳ và template để FE bind form nhập.
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
 *           minimum: 1
 *           maximum: 12
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
 *         description: Tìm theo số phòng (roomNumber, contains, không phân biệt hoa thường)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Trang hiện tại (mặc định = 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Số phòng trên mỗi trang (mặc định = 20)
 *     responses:
 *       200:
 *         description: Danh sách phòng và trạng thái chỉ số trong kỳ
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
 *                     description: Thông tin phòng + trạng thái chỉ số tiện ích
 *                     properties:
 *                       _id:
 *                         type: string
 *                       roomNumber:
 *                         type: string
 *                       status:
 *                         type: string
 *                       buildingId:
 *                         type: object
 *                         description: Tòa nhà chứa phòng
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           address:
 *                             type: string
 *                       floorId:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           _id:
 *                             type: string
 *                           floorNumber:
 *                             type: integer
 *                           level:
 *                             type: integer
 *                       meterStatus:
 *                         type: object
 *                         description: Trạng thái chỉ số trong kỳ
 *                         properties:
 *                           hasReading:
 *                             type: boolean
 *                             description: Đã có record UtilityReading cho kỳ này hay chưa
 *                           status:
 *                             type: string
 *                             nullable: true
 *                             description: Trạng thái reading (draft, confirmed, billed)
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
 *                           eCurrentIndex:
 *                             type: number
 *                             nullable: true
 *                             description: Chỉ số điện hiện tại (FE nhập)
 *                           wCurrentIndex:
 *                             type: number
 *                             nullable: true
 *                             description: Chỉ số nước hiện tại (FE nhập)
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
 */

/**
 * @swagger
 * /landlords/utility-readings:
 *   get:
 *     summary: Danh sách các kỳ chỉ số tiện ích
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, confirmed, billed]
 *       - in: query
 *         name: periodMonth
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *       - in: query
 *         name: periodYear
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
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
 *                       _id:
 *                         type: string
 *                       landlordId:
 *                         type: string
 *                       buildingId:
 *                         type: string
 *                       roomId:
 *                         type: string
 *                       periodMonth:
 *                         type: integer
 *                       periodYear:
 *                         type: integer
 *                       readingDate:
 *                         type: string
 *                         format: date-time
 *                       ePreviousIndex:
 *                         type: number
 *                       eCurrentIndex:
 *                         type: number
 *                         nullable: true
 *                       eConsumption:
 *                         type: number
 *                       eUnitPrice:
 *                         type: number
 *                       eAmount:
 *                         type: number
 *                       wPreviousIndex:
 *                         type: number
 *                       wCurrentIndex:
 *                         type: number
 *                         nullable: true
 *                       wConsumption:
 *                         type: number
 *                       wUnitPrice:
 *                         type: number
 *                       wAmount:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: [draft, confirmed, billed]
 *                       note:
 *                         type: string
 *                       invoiceId:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
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
 *     summary: Tạo mới một kỳ chỉ số tiện ích cho 1 phòng (cả điện + nước)
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - periodMonth
 *               - periodYear
 *             properties:
 *               roomId:
 *                 type: string
 *               periodMonth:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 12
 *               periodYear:
 *                 type: integer
 *               eCurrentIndex:
 *                 type: number
 *                 nullable: true
 *                 minimum: 0
 *                 description: Chỉ số điện hiện tại
 *               wCurrentIndex:
 *                 type: number
 *                 nullable: true
 *                 minimum: 0
 *                 description: Chỉ số nước hiện tại
 *     responses:
 *       201:
 *         description: Tạo chỉ số thành công
 *       400:
 *         description: Lỗi validate hoặc trùng kỳ
 */

/**
 * @swagger
 * /landlords/utility-readings/bulk:
 *   post:
 *     summary: Tạo nhiều kỳ chỉ số tiện ích hàng loạt (cả điện + nước)
 *     description: >
 *       Dùng để import nhanh chỉ số cho nhiều phòng. Mỗi phần tử trong `readings` là
 *       một record tương ứng với 1 phòng - 1 kỳ.
 *     tags: [Utility Readings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - readings
 *             properties:
 *               readings:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - roomId
 *                     - periodMonth
 *                     - periodYear
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     periodMonth:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 12
 *                     periodYear:
 *                       type: integer
 *                     eCurrentIndex:
 *                       type: number
 *                       nullable: true
 *                       minimum: 0
 *                     wCurrentIndex:
 *                       type: number
 *                       nullable: true
 *                       minimum: 0
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
 *                       roomId:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       error:
 *                         type: string
 *                         nullable: true
 *                       readingId:
 *                         type: string
 *                         nullable: true
 *                 total:
 *                   type: integer
 *                 successCount:
 *                   type: integer
 *                 failCount:
 *                   type: integer
 *       400:
 *         description: Tất cả phần tử đều lỗi
 */

/**
 * @swagger
 * /landlords/utility-readings/{id}/confirm:
 *   post:
 *     summary: Xác nhận chỉ số tiện ích (chuyển từ draft sang confirmed)
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

/**
 * @swagger
 * /landlords/utility-readings/{id}:
 *   patch:
 *     summary: Cập nhật thông tin một kỳ chỉ số
 *     description: >
 *       Không cho phép thay đổi phòng / tòa / kỳ qua API update. Nếu record đã được
 *       lập hoá đơn (status = billed hoặc có invoiceId) thì chỉ được sửa note / status.
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ePreviousIndex:
 *                 type: number
 *                 minimum: 0
 *               eCurrentIndex:
 *                 type: number
 *                 minimum: 0
 *               eUnitPrice:
 *                 type: number
 *                 minimum: 0
 *               wPreviousIndex:
 *                 type: number
 *                 minimum: 0
 *               wCurrentIndex:
 *                 type: number
 *                 minimum: 0
 *               wUnitPrice:
 *                 type: number
 *                 minimum: 0
 *               status:
 *                 type: string
 *                 enum: [draft, confirmed, billed]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Lỗi validate hoặc đã bị lock
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
