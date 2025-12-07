const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/SubscriptionController');
const { checkAuthorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Subscription
 *   description: API quản lý gói thuê bao (dùng thử, mua, gia hạn, lịch sử)
 */

/**
 * @swagger
 * /subscriptions/start-trial:
 *   post:
 *     summary: Bắt đầu dùng thử miễn phí
 *     description: Kích hoạt gói dùng thử 7 ngày (chỉ 1 lần duy nhất).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kích hoạt thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: Dùng thử kích hoạt thành công!
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription:
 *                       $ref: '#/components/schemas/Subscription'
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Đã dùng trial hoặc đang có gói active
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không phải landlord
 */
router.post('/start-trial', checkAuthorize(['landlord']), subscriptionController.startTrial);

/**
 * @swagger
 * /subscriptions/buy:
 *   post:
 *     summary: Mua gói trả phí
 *     description: Tạo subscription và trả về URL thanh toán VNPay.
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
 *         description: URL thanh toán
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                     subscriptionId:
 *                       type: string
 *       400:
 *         description: Gói không hợp lệ hoặc đang dùng gói khác
 *       404:
 *         description: Không tìm thấy gói
 */
router.post('/buy', checkAuthorize(['landlord']), subscriptionController.buyPackage);

/**
 * @swagger
 * /subscriptions/renew:
 *   post:
 *     summary: Gia hạn gói hiện tại
 *     description: Tạo subscription mới nối tiếp gói hiện tại (chỉ khi còn ≤ 30 ngày).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URL thanh toán gia hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     paymentUrl:
 *                       type: string
 *                     subscriptionId:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Không có gói active hoặc còn quá nhiều ngày
 */
router.post('/renew', checkAuthorize(['landlord']), subscriptionController.renewPackage);

/**
 * @swagger
 * /subscriptions/return:
 *   get:
 *     summary: Callback VNPay
 *     description: Xử lý thanh toán từ VNPay (mua hoặc gia hạn).
 *     tags: [Subscription]
 *     parameters:
 *       - in: query
 *         name: vnp_ResponseCode
 *         schema:
 *           type: string
 *         example: '00'
 *       - in: query
 *         name: vnp_OrderInfo
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd03f
 *       - in: query
 *         name: vnp_SecureHash
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Thanh toán thành công
 *       400:
 *         description: Thanh toán thất bại
 */
router.get('/return', subscriptionController.paymentCallback);

/**
 * @swagger
 * /subscriptions/status:
 *   get:
 *     summary: Trạng thái hiện tại
 *     description: Gợi ý hành động (dùng thử, mua, gia hạn, cảnh báo).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trạng thái + hành động
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasActive:
 *                       type: boolean
 *                     isTrial:
 *                       type: boolean
 *                     action:
 *                       type: string
 *                       enum: [start_trial, buy_package, upgrade_warning, null]
 *                     daysLeft:
 *                       type: integer
 *                     package:
 *                       $ref: '#/components/schemas/Package'
 */
router.get('/status', checkAuthorize(['landlord']), subscriptionController.getStatusPackage);

/**
 * @swagger
 * /subscriptions/history:
 *   get:
 *     summary: Lịch sử gói
 *     description: Danh sách tất cả subscription (lọc, phân trang).
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_payment, active, expired]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Danh sách gói
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Subscription'
 */
router.get('/history', checkAuthorize(['landlord']), subscriptionController.historyBuyPackage);

/**
 * @swagger
 * /subscriptions/detail/{subscriptionId}:
 *   get:
 *     summary: Chi tiết 1 gói
 *     description: Xem thông tin chi tiết + thống kê ngày dùng.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd03f
 *     responses:
 *       200:
 *         description: Chi tiết gói
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription:
 *                       $ref: '#/components/schemas/Subscription'
 *                     stats:
 *                       type: object
 *                       properties:
 *                         daysUsed:
 *                           type: integer
 *                         daysLeft:
 *                           type: integer
 *                         isActive:
 *                           type: boolean
 *                         isExpired:
 *                           type: boolean
 *       404:
 *         description: Không tìm thấy
 */
router.get('/detail/:subscriptionId', checkAuthorize(['landlord']), subscriptionController.getDetailPackage);
/**
 * @swagger
 * /subscriptions/current:
 *   get:
 *     summary: Xem gói đang dùng hiện tại + thống kê ngày
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gói hiện tại + stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   $ref: '#/components/schemas/Subscription'
 *                 stats:
 *                   type: object
 *                   properties:
 *                     daysUsed:
 *                       type: integer
 *                     daysLeft:
 *                       type: integer
 *                     totalDays:
 *                       type: integer
 *                     percentageUsed:
 *                       type: integer
 *                     percentageLeft:
 *                       type: integer
 *                     isActive:
 *                       type: boolean
 *                     isExpired:
 *                       type: boolean
 */
router.get('/current', checkAuthorize(['landlord']), subscriptionController.getCurrentPackage);

/**
 * @swagger
 * /subscriptions/cancel/{id}:
 *   patch:
 *     summary: Hủy một gói dịch vụ cụ thể (active hoặc upcoming)
 *     description: Người dùng có thể hủy bất kỳ gói nào có trạng thái active hoặc upcoming. Không áp dụng cho gói trial. Hủy nhằm đổi sang gói khác hoặc dừng gia hạn.
 *     tags: [Subscription]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của subscription cần hủy
 *     responses:
 *       200:
 *         description: Hủy gói thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cancelledSubscription:
 *                   $ref: '#/components/schemas/Subscription'
 *                 message:
 *                   type: string
 *                   example: Đã hủy gói thành công.
 *       400:
 *         description: Không thể hủy gói
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Không tìm thấy subscription
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/cancel/:id', checkAuthorize(['landlord']), subscriptionController.cancelledSubscription);

// === SCHEMAS ===
/**
 * @swagger
 * components:
 *   schemas:
 *     Package:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         price:
 *           type: number
 *         durationDays:
 *           type: integer
 *         roomLimit:
 *           type: integer
 *         type:
 *           type: string
 *           enum: [trial, paid]
 *         description:
 *           type: string
 *     Subscription:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         landlordId:
 *           type: string
 *         packageId:
 *           $ref: '#/components/schemas/Package'
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [pending_payment, active, expired, cancelled, upgraded]
 *         paymentId:
 *           type: string
 *         amount:
 *           type: number
 *         paymentMethod:
 *           type: string
 *           enum: [vnpay, momo, manual, system]
 *         isTrial:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

module.exports = router;