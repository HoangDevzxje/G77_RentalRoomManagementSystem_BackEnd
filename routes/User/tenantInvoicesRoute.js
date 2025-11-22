const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const tenantInvoiceController = require("../../controllers/User/TenantInvoiceController");

/**
 * @swagger
 * tags:
 *   - name: Tenant Invoices
 *     description: Người thuê xem và thanh toán hóa đơn của mình
 */

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: Tenant xem danh sách hóa đơn của mình
 *     tags: [Tenant Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, sent, paid, overdue, cancelled]
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
 *     tags: [Tenant Invoices]
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
 *     summary: Tenant báo đã thanh toán / trigger thanh toán online
 *     description: |
 *       Tuỳ implementation:
 *       - Nếu dùng cổng online (VNPay...), endpoint này có thể tạo URL thanh toán.
 *       - Nếu chỉ báo đã chuyển khoản, landlord sẽ verify phía sau.
 *     tags: [Tenant Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *               method:
 *                 type: string
 *                 enum: [bank_transfer, online_gateway]
 *               note:
 *                 type: string
 *                 description: 'Ghi chú (VD: "Em đã chuyển khoản, đính kèm mã giao dịch...")'
 *     responses:
 *       200:
 *         description: Đã ghi nhận yêu cầu thanh toán / trả về link thanh toán
 *       400:
 *         description: Hóa đơn không hợp lệ
 *       404:
 *         description: Không tìm thấy
 */
// router.post(
//   "/:id/pay",
//   checkAuthorize("resident"),
//   tenantInvoiceController.payMyInvoice
// );

module.exports = router;
