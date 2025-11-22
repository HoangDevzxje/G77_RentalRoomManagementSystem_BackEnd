const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const invoiceController = require("../../controllers/Landlord/InvoiceController");

/**
 * @swagger
 * tags:
 *   - name: Invoices
 *     description: Quản lý hóa đơn tiền phòng + điện/nước
 */

/**
 * @swagger
 * /landlords/invoices:
 *   get:
 *     summary: Lấy danh sách hóa đơn của chủ trọ
 *     description: Phân trang + filter theo trạng thái, phòng, tòa nhà, kỳ tháng/năm, search theo invoiceNumber.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent, paid, overdue, cancelled]
 *         description: Lọc theo trạng thái hóa đơn
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodMonth
 *         schema:
 *           type: integer
 *           example: 11
 *       - in: query
 *         name: periodYear
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo invoiceNumber
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
 *         description: Danh sách hóa đơn
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
 *                       invoiceNumber: { type: string }
 *                       status: { type: string }
 *                       periodMonth: { type: integer }
 *                       periodYear: { type: integer }
 *                       issuedAt: { type: string, format: date-time }
 *                       dueDate: { type: string, format: date-time }
 *                       totalAmount: { type: number }
 *                       paidAt: { type: string, format: date-time }
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           name: { type: string }
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           roomNumber: { type: string }
 *                       tenantId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           email: { type: string }
 *                           userInfo:
 *                             type: object
 *                             properties:
 *                               fullName: { type: string }
 *                               phoneNumber: { type: string }
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       400:
 *         description: Lỗi truy vấn
 */

/**
 * @swagger
 * /landlords/invoices/{id}:
 *   get:
 *     summary: Lấy chi tiết một hóa đơn
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
 *         description: Thông tin chi tiết hóa đơn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 invoiceNumber: { type: string }
 *                 status: { type: string }
 *                 periodMonth: { type: integer }
 *                 periodYear: { type: integer }
 *                 issuedAt: { type: string, format: date-time }
 *                 dueDate: { type: string, format: date-time }
 *                 subtotal: { type: number }
 *                 discountAmount: { type: number }
 *                 lateFee: { type: number }
 *                 totalAmount: { type: number }
 *                 currency: { type: string }
 *                 paidAt: { type: string, format: date-time }
 *                 paymentMethod: { type: string }
 *                 paymentRef: { type: string }
 *                 note: { type: string }
 *                 internalNote: { type: string }
 *                 buildingId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     name: { type: string }
 *                     address: { type: string }
 *                 roomId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     roomNumber: { type: string }
 *                 tenantId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     email: { type: string }
 *                     userInfo:
 *                       type: object
 *                       properties:
 *                         fullName: { type: string }
 *                         phoneNumber: { type: string }
 *                         address: { type: string }
 *                 contractId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     contract:
 *                       type: object
 *                       properties:
 *                         no: { type: string }
 *                         startDate: { type: string, format: date }
 *                         endDate: { type: string, format: date }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type: { type: string }
 *                       label: { type: string }
 *                       description: { type: string }
 *                       quantity: { type: number }
 *                       unitPrice: { type: number }
 *                       amount: { type: number }
 *                       utilityReadingId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           type: { type: string }
 *                           periodMonth: { type: integer }
 *                           periodYear: { type: integer }
 *                           previousIndex: { type: number }
 *                           currentIndex: { type: number }
 *                           consumption: { type: number }
 *                           unitPrice: { type: number }
 *                           amount: { type: number }
 *       404:
 *         description: Không tìm thấy hóa đơn
 */

/**
 * @swagger
 * /landlords/invoices/generate-monthly:
 *   post:
 *     summary: Tạo hóa đơn tháng cho một phòng (tiền phòng + điện/nước)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomId, periodMonth, periodYear]
 *             properties:
 *               roomId:
 *                 type: string
 *               periodMonth:
 *                 type: integer
 *                 example: 11
 *               periodYear:
 *                 type: integer
 *                 example: 2025
 *               includeRent:
 *                 type: boolean
 *                 default: true
 *                 description: Có tính tiền phòng vào hóa đơn hay không
 *     responses:
 *       201:
 *         description: Tạo hóa đơn thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào hoặc đã tồn tại hóa đơn
 */

/**
 * @swagger
 * /landlords/invoices/generate:
 *   post:
 *     summary: Tạo hóa đơn tùy chỉnh từ danh sách items (tiền phòng, dịch vụ, điện/nước...)
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
 *               - tenantId
 *               - roomId
 *               - contractId
 *               - periodMonth
 *               - periodYear
 *               - items
 *             properties:
 *               tenantId: { type: string }
 *               roomId: { type: string }
 *               contractId: { type: string }
 *               periodMonth:
 *                 type: integer
 *                 example: 11
 *               periodYear:
 *                 type: integer
 *                 example: 2025
 *               invoiceNumber:
 *                 type: string
 *                 description: Nếu không truyền sẽ tự generate
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [type, label, amount]
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [rent, electric, water, service, other]
 *                     label:
 *                       type: string
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                       default: 1
 *                     unitPrice:
 *                       type: number
 *                     amount:
 *                       type: number
 *                     utilityReadingId:
 *                       type: string
 *     responses:
 *       201:
 *         description: Tạo hóa đơn thành công
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 */

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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, bank_transfer, online_gateway]
 *                 example: bank_transfer
 *               paidAt:
 *                 type: string
 *                 format: date-time
 *                 description: Thời điểm thanh toán (nếu không truyền sẽ lấy thời điểm hiện tại)
 *               note:
 *                 type: string
 *                 example: "Thanh toán tiền mặt tại quầy"
 *     responses:
 *       200:
 *         description: Đã ghi nhận thanh toán hóa đơn
 *       400:
 *         description: Lỗi trạng thái hoặc dữ liệu
 *       404:
 *         description: Không tìm thấy hóa đơn
 */

/**
 * @swagger
 * /landlords/invoices/{id}/send:
 *   post:
 *     summary: Gửi hóa đơn cho người thuê qua email
 *     description: |
 *       Gửi email hóa đơn cho tenant dựa trên template HTML.
 *       - Nếu gửi thành công:
 *         - Cập nhật emailStatus = "sent", emailSentAt.
 *         - Nếu invoice đang ở trạng thái "draft" thì chuyển sang "sent".
 *       - Không cho gửi nếu hóa đơn đã ở trạng thái "paid" hoặc "cancelled".
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
 *         description: Đã gửi email hóa đơn cho người thuê
 *       400:
 *         description: Hóa đơn không hợp lệ hoặc không thể gửi
 *       404:
 *         description: Không tìm thấy hóa đơn
 *       500:
 *         description: Lỗi khi gửi email
 */

// Tạo hóa đơn tháng auto từ UtilityReading + tiền phòng
router.post(
  "/generate-monthly",
  checkAuthorize("landlord"),
  invoiceController.generateMonthlyInvoice
);

// Tạo hóa đơn custom (truyền items)
router.post(
  "/generate",
  checkAuthorize("landlord"),
  invoiceController.generateInvoice
);

// Danh sách hóa đơn
router.get("/", checkAuthorize("landlord"), invoiceController.listInvoices);

// Chi tiết hóa đơn
router.get(
  "/:id",
  checkAuthorize("landlord"),
  invoiceController.getInvoiceDetail
);

// Đánh dấu đã thanh toán
router.post(
  "/:id/pay",
  checkAuthorize("landlord"),
  invoiceController.markInvoicePaid
);

// Gửi hóa đơn cho tenant qua email
router.post(
  "/:id/send",
  checkAuthorize("landlord"),
  invoiceController.sendInvoiceEmail
);

router.post(
  "/generate-monthly-bulk",
  checkAuthorize("landlord"),
  invoiceController.generateMonthlyBulk
);

module.exports = router;
