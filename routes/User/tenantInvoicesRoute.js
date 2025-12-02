const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const tenantInvoiceController = require("../../controllers/User/TenantInvoiceController");
const { uploadTransferProof } = require("../../configs/cloudinary");
/**
 * @swagger
 * tags:
 *   - name: Resident Invoices
 *     description: Người thuê xem và thanh toán hóa đơn của mình
 */

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: Tenant xem danh sách hóa đơn của mình
 *     tags: [Resident Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, sent, transfer_pending, paid, overdue, cancelled]
 *         description: Lọc theo trạng thái hóa đơn
 *       - name: periodMonth
 *         in: query
 *         schema:
 *           type: integer
 *         description: Tháng kỳ hóa đơn
 *       - name: periodYear
 *         in: query
 *         schema:
 *           type: integer
 *         description: Năm kỳ hóa đơn
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *         description: Tìm theo số hóa đơn (invoiceNumber)
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Danh sách hóa đơn của tenant
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
 *                       issuedAt:
 *                         type: string
 *                         format: date-time
 *                       dueDate:
 *                         type: string
 *                         format: date-time
 *                       totalAmount: { type: number }
 *                       paidAt:
 *                         type: string
 *                         format: date-time
 *                       building:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           name: { type: string }
 *                       room:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           roomNumber: { type: string }
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get(
  "/",
  checkAuthorize("resident"),
  tenantInvoiceController.listMyInvoices
);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Tenant xem chi tiết một hóa đơn
 *     tags: [Resident Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết hóa đơn
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
 *                 issuedAt:
 *                   type: string
 *                   format: date-time
 *                 dueDate:
 *                   type: string
 *                   format: date-time
 *                 subtotal: { type: number }
 *                 discountAmount: { type: number }
 *                 lateFee: { type: number }
 *                 totalAmount: { type: number }
 *                 currency: { type: string }
 *                 paidAt:
 *                   type: string
 *                   format: date-time
 *                 paymentMethod: { type: string }
 *                 paymentRef: { type: string }
 *                 note: { type: string }
 *                 building:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     name: { type: string }
 *                     address: { type: string }
 *                 room:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     roomNumber: { type: string }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [rent, electric, water, service, other]
 *                       label: { type: string }
 *                       description: { type: string }
 *                       quantity: { type: number }
 *                       unitPrice: { type: number }
 *                       amount: { type: number }
 *       404:
 *         description: Không tìm thấy hoặc không thuộc tenant
 */
router.get(
  "/:id",
  checkAuthorize("resident"),
  tenantInvoiceController.getMyInvoiceDetail
);
/**
 * @swagger
 * /invoices/{id}/pay:
 *   post:
 *     summary: Tạo link thanh toán MoMo cho hóa đơn
 *     description: >
 *       Tenant yêu cầu thanh toán online. Hệ thống tạo yêu cầu thanh toán qua cổng MoMo Sandbox
 *       và trả về payUrl để FE redirect người dùng sang MoMo.
 *     tags: [Resident Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của hóa đơn
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method:
 *                 type: string
 *                 description: Phương thức thanh toán, hiện tại chỉ hỗ trợ online_gateway (MoMo)
 *                 enum: [online_gateway]
 *     responses:
 *       200:
 *         description: Tạo link thanh toán MoMo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 payUrl:
 *                   type: string
 *                   description: URL thanh toán MoMo, FE redirect người dùng đến URL này
 *                 momo:
 *                   type: object
 *                   description: Toàn bộ response từ MoMo
 *       400:
 *         description: Hóa đơn không hợp lệ hoặc tạo yêu cầu MoMo thất bại
 *       404:
 *         description: Không tìm thấy hóa đơn
 */
router.post(
  "/:id/pay",
  checkAuthorize("resident"),
  tenantInvoiceController.payMyInvoice
);
/**
 * @swagger
 * /invoices/{id}/request-transfer-confirmation:
 *   post:
 *     summary: Tenant gửi yêu cầu xác nhận đã chuyển khoản (kèm ảnh)
 *     tags: [Resident Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *               proofImageUrl:
 *                 type: string
 *               amount:
 *                 type: number
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Gửi yêu cầu thành công
 *       400:
 *         description: Hóa đơn không hợp lệ hoặc đã được xử lý
 */
router.post(
  "/:id/request-transfer-confirmation",
  uploadTransferProof,
  checkAuthorize("resident"),
  tenantInvoiceController.requestBankTransferConfirmation
);
module.exports = router;
