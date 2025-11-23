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
 * /notifications/{id}:
 *   patch:
 *     summary: Cập nhật thông báo (có thể thêm ảnh/file mới)
 *     tags: [Resident Notification]
 *     security: [ { bearerAuth: [] } ]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *               files:
 *                 type: array
 *                 items:
 *                   type: file
 *                 description: Thêm ảnh/file mới vào thông báo
 *     responses:
 *       200: { description: "Cập nhật thành công" }
 *       403: { description: "Quá 10 phút hoặc không có quyền" }
 *
 *   delete:
 *     summary: Xóa thông báo
 *     tags: [Resident Notification]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200: { description: "Xóa thành công" }
 *
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
    "/:id",
    checkAuthorize(["resident"]),
    notificationController.getNotificationById
);

module.exports = router;
