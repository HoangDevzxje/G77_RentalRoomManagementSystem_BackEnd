const router = require("express").Router();
const notificationController = require("../../controllers/Landlord/NotificationController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Resident Notification
 *     description: API dành cho người thuê xem thông báo
 */

/**
 * @swagger
 * /notifications/me:
 *   get:
 *     summary: Lấy danh sách thông báo tôi NHẬN được
 *     tags: [Resident Notification]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách thông báo nhận được
 */

/**
 * @swagger
 * /notifications/read:
 *   post:
 *     summary: Đánh dấu đã đọc (chỉ Resident)
 *     tags: [Resident Notification]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationIds:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["64a1b2c3d4e5f67890123456", "64a1b2c3d4e5f67890123457"]
 *     responses:
 *       200: { description: "Đánh dấu thành công" }
 */
/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Đếm số thông báo chưa đọc
 *     description: |
 *       Trả về số lượng thông báo chưa đọc cho user hiện tại.
 *       
 *       **Quy tắc theo role:**
 *       - **Resident:** chỉ xem thông báo thuộc các tòa/floor/phòng/resident liên quan đến mình.
 *       - **Landlord:** xem tất cả thông báo do resident gửi thuộc tất cả tòa mà landlord quản lý.
 *       - **Staff:** xem thông báo từ resident trong phạm vi tòa mà staff được phân công.
 *       
 *       Mọi role chỉ đếm các thông báo **chưa có trong readBy.accountId** của user hiện tại.
 *     tags: [Resident Notification]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Số lượng thông báo chưa đọc.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 unreadCount:
 *                   type: number
 *                   example: 5
 *       403:
 *         description: Không có quyền truy cập.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bạn không có quyền truy cập"
 *       500:
 *         description: Lỗi server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lỗi server"
 */


/**
 * @swagger
 * /notifications/{id}:
 *   get:
 *     summary: Lấy chi tiết 1 thông báo
 *     tags: [Resident Notification]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200: { description: "Chi tiết thông báo" }
 */
router.get(
    "/me",
    checkAuthorize(["resident"]),
    notificationController.getMyNotifications
);

router.post(
    "/read",
    checkAuthorize(["resident"]),
    notificationController.markAsRead
);
router.get(
    "/unread-count",
    checkAuthorize(["resident"]),
    notificationController.getUnreadCount
);
router.get(
    "/:id",
    checkAuthorize(["resident"]),
    notificationController.getNotificationById
);

module.exports = router;
