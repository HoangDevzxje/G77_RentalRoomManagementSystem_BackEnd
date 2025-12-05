const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const invoiceController = require("../../controllers/Landlord/InvoiceController");
const checkSubscription = require("../../middleware/checkSubscription");
const { PERMISSIONS } = require("../../constants/permissions");
const {
  checkStaffPermission,
} = require("../../middleware/checkStaffPermission");
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
router.get(
  "/",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_VIEW),
  invoiceController.getInvoices
);

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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_VIEW),
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
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
 *               extraItems:
 *                 type: array
 *                 description: Các chi phí phát sinh giống nhau áp dụng cho mọi phòng
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
 *       200:
 *         description: Kết quả xử lý từng phòng
 */
router.post(
  "/generate-monthly-bulk",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_VIEW),
  invoiceController.getInvoiceDetail
);

/**
 * @swagger
 * /landlords/invoices/{id}:
 *   patch:
 *     summary: Cập nhật một số thông tin hóa đơn (theo trạng thái)
 *     description: >
 *       Quy tắc theo trạng thái hiện tại của hóa đơn:
 *
 *       - **draft**:
 *         - Được chỉnh full các field: `items`, `note`, `discountAmount`, `lateFee`, `status`.
 *         - Cho phép chỉnh sửa / thêm / xoá mọi loại dòng: `rent`, `electric`, `water`, `service`, `other`.
 *
 *       - **sent**:
 *         - Chỉ được chỉnh: `items`, `note`, `discountAmount`, `lateFee`.
 *         - Trong `items`:
 *           * **KHÔNG** được sửa / xoá / thêm các dòng có `type` ∈ [`rent`, `service`].
 *           * **KHÔNG** được thêm mới dòng `electric` hoặc `water`.
 *           * Được phép **cập nhật chỉ số cuối** (`meta.currentIndex`) của các dòng `electric` / `water` đã tồn tại
 *             (dựa trên `utilityReadingId`). Hệ thống sẽ tự tính lại `quantity`, `amount` từ bảng UtilityReading
 *             và đồng bộ ngược lại UtilityReading.
 *           * Được phép thêm mới / chỉnh sửa các dòng `type = "other"` (các khoản thu phát sinh).
 *
 *       - **overdue**:
 *         - Chỉ được chỉnh: `note`, `discountAmount`, `lateFee`.
 *         - Mọi thay đổi `items` đều bị từ chối (API sẽ trả lỗi 400).
 *
 *       - **transfer_pending / paid / cancelled**:
 *         - Không được phép cập nhật. API sẽ trả lỗi 400.
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
 *                 description: >
 *                   Danh sách các dòng khoản thu, cấu trúc theo `Invoice.items`.
 *                   - Ở trạng thái **draft**: được phép chỉnh full rent/electric/water/service/other.
 *                   - Ở trạng thái **sent**:
 *                     * Giữ nguyên các dòng `rent` và `service` (không được sửa/xóa/thêm).
 *                     * Cho phép thêm mới/cập nhật các dòng `electric`/`water` thông qua `utilityReadingId`
 *                       và `meta.currentIndex`.
 *                     * Cho phép thêm mới/chỉnh sửa các dòng `other`.
 *                   - Ở trạng thái **overdue**: không được phép chỉnh `items`.
 *               note:
 *                 type: string
 *                 description: Ghi chú gửi kèm cho người thuê.
 *               discountAmount:
 *                 type: number
 *                 description: Số tiền giảm giá áp dụng cho hóa đơn (cho phép chỉnh ở draft/sent/overdue).
 *               lateFee:
 *                 type: number
 *                 description: Phí trễ hạn (cho phép chỉnh ở draft/sent/overdue).
 *               status:
 *                 type: string
 *                 description: >
 *                   Chỉ hóa đơn ở trạng thái **draft** mới được phép đổi status qua API này.
 *                   Không được phép đặt trạng thái `paid` hoặc `transfer_pending` qua API này.
 *                 enum: [draft, sent, cancelled, overdue]
 *     responses:
 *       200:
 *         description: Cập nhật hóa đơn thành công
 */
router.patch(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_EDIT),
  checkSubscription,
  invoiceController.updateInvoice
);

/**
 * @swagger
 * /landlords/invoices/{id}:
 *   delete:
 *     summary: Xóa hóa đơn (chỉ draft)
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
 *         description: Xóa hóa đơn thành công
 */
router.delete(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_EDIT),
  checkSubscription,
  invoiceController.deleteInvoice
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
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
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_CREATE),
  checkSubscription,
  invoiceController.sendInvoiceEmail
);
/**
 * @swagger
 * /landlords/invoices/{id}/history:
 *   get:
 *     summary: Xem lịch sử chỉnh sửa hóa đơn (sau khi đã gửi)
 *     description: >
 *       Trả về danh sách các lần cập nhật hóa đơn khi hóa đơn đang ở trạng thái **sent**,
 *       bao gồm thay đổi ở dòng điện/nước, các khoản `other` và thay đổi `note`, `discountAmount`, `lateFee`.
 *
 *       Dữ liệu được lưu trong trường `history` của Invoice:
 *       - `action`: loại hành động (hiện tại là `"update_sent_invoice"`).
 *       - `itemsDiff`: diff các dòng khoản thu:
 *         * `updated`: các dòng thay đổi (quantity, unitPrice, amount, currentIndex...).
 *         * `added`: các dòng được thêm (thường là `other`).
 *         * `removed`: các dòng bị xóa (thường là `other`).
 *       - `metaDiff`: thay đổi ở `note`, `discountAmount`, `lateFee`.
 *       - `updatedBy`: người chỉnh sửa.
 *       - `updatedAt`: thời điểm chỉnh sửa.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của hóa đơn
 *     responses:
 *       200:
 *         description: Lấy lịch sử chỉnh sửa hóa đơn thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invoiceId:
 *                   type: string
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                       itemsDiff:
 *                         type: object
 *                       metaDiff:
 *                         type: object
 *                       updatedBy:
 *                         type: object
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Không tìm thấy hóa đơn
 */
router.get(
  "/:id/history",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.INVOICE_VIEW),
  checkSubscription,
  invoiceController.getInvoiceHistory
);

module.exports = router;
