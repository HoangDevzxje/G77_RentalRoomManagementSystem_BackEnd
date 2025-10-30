const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/SubscriptionController');
const { checkAuthorize } = require('../middleware/authMiddleware');


/**
 * @swagger
 * tags:
 *   name: Subscription
 *   description: API quản lý gói thuê bao
 */

/**
 * @swagger
 * /subscriptions/buy:
 *   post:
 *     summary: Mua gói dịch vụ
 *     description: Tạo subscription và trả về URL thanh toán VNPay (chỉ landlord).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - packageId
 *             properties:
 *               packageId:
 *                 type: string
 *                 example: 68d7dad6cadcf51ed611e123
 *     responses:
 *       200:
 *         description: URL thanh toán được tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                       example: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dữ liệu không hợp lệ!
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền (không phải landlord)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy gói dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy gói dịch vụ!
 */
router.post('/buy', checkAuthorize(['landlord']), subscriptionController.buy);

/**
 * @swagger
 * /subscriptions/return:
 *   get:
 *     summary: Xử lý callback thanh toán VNPay
 *     description: Xử lý callback từ VNPay để cập nhật trạng thái subscription.
 *     tags: [Subscription]
 *     parameters:
 *       - in: query
 *         name: vnp_Amount
 *         schema:
 *           type: number
 *         example: 50000000
 *       - in: query
 *         name: vnp_BankCode
 *         schema:
 *           type: string
 *         example: NCB
 *       - in: query
 *         name: vnp_BankTranNo
 *         schema:
 *           type: string
 *         example: VNP15193032
 *       - in: query
 *         name: vnp_CardType
 *         schema:
 *           type: string
 *         example: ATM
 *       - in: query
 *         name: vnp_OrderInfo
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd03f
 *       - in: query
 *         name: vnp_PayDate
 *         schema:
 *           type: string
 *         example: 20251007004102
 *       - in: query
 *         name: vnp_ResponseCode
 *         schema:
 *           type: string
 *         example: '00'
 *       - in: query
 *         name: vnp_TmnCode
 *         schema:
 *           type: string
 *         example: 6LMM17RA
 *       - in: query
 *         name: vnp_TransactionNo
 *         schema:
 *           type: string
 *         example: 15193032
 *       - in: query
 *         name: vnp_TransactionStatus
 *         schema:
 *           type: string
 *         example: '00'
 *       - in: query
 *         name: vnp_TxnRef
 *         schema:
 *           type: string
 *         example: 20251007003801
 *       - in: query
 *         name: vnp_SecureHash
 *         schema:
 *           type: string
 *         example: 57f632afe2479c77fcb7042fb708b33213e96ca246a82e6c2cef087155641a7dbb52be6dddd9f956d73e265cd125d799d6846d004b19ac1ff073d2f24c3da7fd
 *     responses:
 *       200:
 *         description: Thanh toán được xử lý thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Thanh toán thành công!
 *       400:
 *         description: Thanh toán thất bại hoặc chữ ký không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Sai chữ ký bảo mật!
 *       404:
 *         description: Không tìm thấy subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy subscription!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi server!
 */
router.get('/return', subscriptionController.paymentCallback);

/**
 * @swagger
 * /api/subscriptions:
 *   get:
 *     summary: Lấy danh sách subscription
 *     description: Lấy tất cả subscription của landlord (chỉ landlord).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách subscription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd03f
 *                       landlordId:
 *                         type: string
 *                         example: 68d7dad6cadcf51ed611e121
 *                       packageId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 68d7dad6cadcf51ed611e123
 *                           name:
 *                             type: string
 *                             example: Premium Package
 *                           price:
 *                             type: number
 *                             example: 500000
 *                           durationDays:
 *                             type: number
 *                             example: 30
 *                           roomLimit:
 *                             type: number
 *                             example: 50
 *                           description:
 *                             type: string
 *                             example: Gói Premium cho phép quản lý tối đa 50 phòng trong 30 ngày.
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-07T00:38:01.000Z
 *                       endDate:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-11-06T00:38:01.000Z
 *                       status:
 *                         type: string
 *                         enum: [pending_payment, active, expired]
 *                         example: active
 *                       paymentId:
 *                         type: string
 *                         example: 15193032
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền (không phải landlord)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */
router.get('/', checkAuthorize(['landlord', 'admin']), subscriptionController.list);

/**
 * @swagger
 * /subscriptions/history:
 *   get:
 *     summary: Lấy lịch sử mua gói của landlord
 *     description: Trả về danh sách tất cả các gói mà landlord đã mua, bao gồm thông tin chi tiết của từng gói và trạng thái thanh toán.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_payment, active, expired]
 *         description: Lọc theo trạng thái gói đăng ký
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại (phân trang)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số lượng kết quả mỗi trang
 *     responses:
 *       200:
 *         description: Lấy lịch sử gói thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 6717cfc7f7a12345c9b8c912
 *                       packageId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 6717cf80d3c3bb238ed9a9e3
 *                           name:
 *                             type: string
 *                             example: Gói Cao Cấp
 *                           price:
 *                             type: number
 *                             example: 300000
 *                           durationDays:
 *                             type: number
 *                             example: 30
 *                           description:
 *                             type: string
 *                             example: Gói cao cấp cho phép quản lý 50 phòng trong 30 ngày
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-20T10:00:00.000Z
 *                       endDate:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-11-20T10:00:00.000Z
 *                       status:
 *                         type: string
 *                         enum: [pending_payment, active, expired]
 *                         example: active
 *                       paymentId:
 *                         type: string
 *                         example: VN123456789
 *                       transactionRef:
 *                         type: string
 *                         example: 20251020100000
 *                       amount:
 *                         type: number
 *                         example: 300000
 *                       paymentMethod:
 *                         type: string
 *                         enum: [vnpay, momo, manual]
 *                         example: vnpay
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-20T09:58:00.000Z
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-20T10:05:00.000Z
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền (chỉ landlord)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền truy cập lịch sử mua gói!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */
router.get('/history', checkAuthorize(['landlord']), subscriptionController.getByLandlordId);
module.exports = router;