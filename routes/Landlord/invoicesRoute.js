const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const invoiceController = require("../../controllers/Landlord/InvoiceController");

/**
 * @swagger
 * tags:
 *   - name: Invoices
 *     description: Quản lý hóa đơn tiền phòng, điện/nước và dịch vụ
 */

/**
 * @swagger
 * /landlords/invoices:
 *   get:
 *     summary: Lấy danh sách hóa đơn
 *     description: Phân trang + filter theo trạng thái, tòa nhà, phòng, kỳ và search.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent, paid, overdue, cancelled]
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *       - in: query
 *         name: contractId
 *         schema:
 *           type: string
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
 *         name: q
 *         schema:
 *           type: string
 *         description: Tìm theo số hóa đơn / phòng / tòa / tên người thuê
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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: issuedAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Danh sách hóa đơn
 */
router.get("/", checkAuthorize("landlord"), invoiceController.getInvoices);

/**
 * @swagger
 * /landlords/invoices/rooms:
 *   get:
 *     summary: Danh sách phòng + hợp đồng đang active để tạo hóa đơn
 *     tags: [Invoices]
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
 *         name: q
 *         schema:
 *           type: string
 *           description: Tìm theo số phòng
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
 *         description: Danh sách phòng và hợp đồng phù hợp
 */
router.get(
  "/rooms",
  checkAuthorize("landlord"),
  invoiceController.listRoomsForInvoice
);

/**
 * @swagger
 * /landlords/invoices/generate:
 *   post:
 *     summary: Tạo 1 hóa đơn cho 1 phòng / 1 kỳ
 *     description: >
 *       Tự động lấy tiền phòng (nếu includeRent), điện/nước từ UtilityReading đã xác nhận,
 *       dịch vụ tòa, và chi phí phát sinh.
 *     tags: [Invoices]
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
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 description: Hạn thanh toán (optional, mặc định = ngày 10 tháng sau)
 *               includeRent:
 *                 type: boolean
 *                 default: true
 *               extraItems:
 *                 type: array
 *                 description: Các chi phí phát sinh
 *                 items:
 *                   type: object
 *                   properties:
 *                     label:
 *                       type: string
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     amount:
 *                       type: number
 *     responses:
 *       201:
 *         description: Tạo hóa đơn thành công
 */
router.post(
  "/generate",
  checkAuthorize("landlord"),
  invoiceController.generateInvoice
);

/**
 * @swagger
 * /landlords/invoices/generate-monthly:
 *   post:
 *     summary: Tạo hóa đơn tháng cho 1 phòng
 *     description: API này tương tự /generate nhưng dùng cho luồng "tạo theo tháng".
 *     tags: [Invoices]
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
 *               periodYear:
 *                 type: integer
 *               includeRent:
 *                 type: boolean
 *                 default: true
 *               extraItems:
 *                 type: array
 *     responses:
 *       201:
 *         description: Tạo hóa đơn thành công
 */
router.post(
  "/generate-monthly",
  checkAuthorize("landlord"),
  invoiceController.generateMonthlyInvoice
);

/**
 * @swagger
 * /landlords/invoices/generate-monthly-bulk:
 *   post:
 *     summary: Tạo hóa đơn tháng hàng loạt cho toàn bộ phòng đang rented trong 1 tòa
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *               - periodMonth
 *               - periodYear
 *             properties:
 *               buildingId:
 *                 type: string
 *               periodMonth:
 *                 type: integer
 *               periodYear:
 *                 type: integer
 *               includeRent:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Kết quả xử lý từng phòng
 */
router.post(
  "/generate-monthly-bulk",
  checkAuthorize("landlord"),
  invoiceController.generateMonthlyInvoicesBulk
);

/**
 * @swagger
 * /landlords/invoices/send-drafts:
 *   post:
 *     summary: Gửi email tất cả hóa đơn đang draft
 *     description: >
 *       Gửi email cho tất cả hóa đơn ở trạng thái draft của landlord hiện tại.
 *       Có thể lọc theo tòa nhà và kỳ tháng/năm.
 *       Sau khi gửi thành công sẽ tự chuyển trạng thái hóa đơn sang "sent".
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               buildingId:
 *                 type: string
 *                 description: Lọc theo tòa (optional)
 *               periodMonth:
 *                 type: integer
 *                 description: Lọc theo tháng (1–12, optional)
 *               periodYear:
 *                 type: integer
 *                 description: Lọc theo năm (>= 2000, optional)
 *     responses:
 *       200:
 *         description: Kết quả gửi email cho từng hóa đơn
 */
router.post(
  "/send-drafts",
  checkAuthorize("landlord"),
  invoiceController.sendAllDraftInvoices
);

/**
 * @swagger
 * /landlords/invoices/{id}:
 *   get:
 *     summary: Xem chi tiết hóa đơn
 *     tags: [Invoices]
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
 *         description: Chi tiết hóa đơn
 */
router.get(
  "/:id",
  checkAuthorize("landlord"),
  invoiceController.getInvoiceDetail
);

/**
 * @swagger
 * /landlords/invoices/{id}:
 *   patch:
 *     summary: Cập nhật một số thông tin hóa đơn
 *     tags: [Invoices]
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
 *               items:
 *                 type: array
 *               note:
 *                 type: string
 *               discountAmount:
 *                 type: number
 *               lateFee:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [draft, sent, paid, overdue, cancelled]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.patch(
  "/:id",
  checkAuthorize("landlord"),
  invoiceController.updateInvoice
);

/**
 * @swagger
 * /landlords/invoices/{id}/pay:
 *   post:
 *     summary: Đánh dấu hóa đơn đã thanh toán
 *     tags: [Invoices]
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
 *         description: Cập nhật trạng thái thành công
 */
router.post(
  "/:id/pay",
  checkAuthorize("landlord"),
  invoiceController.markInvoicePaid
);

/**
 * @swagger
 * /landlords/invoices/{id}/send:
 *   post:
 *     summary: Gửi hóa đơn cho tenant qua email
 *     tags: [Invoices]
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
 *         description: Đã gửi email
 */
router.post(
  "/:id/send",
  checkAuthorize("landlord"),
  invoiceController.sendInvoiceEmail
);

module.exports = router;
