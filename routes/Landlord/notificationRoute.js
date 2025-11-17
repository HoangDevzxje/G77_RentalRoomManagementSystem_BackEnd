const express = require("express");
const router = express.Router();
const notificationController = require("../../controllers/Landlord/NotificationController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");


/**
 * @swagger
 * tags:
 *   - name: Landlord Notifications
 *     description: API quản lý thông báo cho Landlord & Staff
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         landlordId:
 *           type: string
 *         createBy:
 *           type: string
 *         createByRole:
 *           type: string
 *           enum: [landlord, staff]
 *         title:
 *           type: string
 *         content:
 *           type: string
 *         type:
 *           type: string
 *           enum: [general, bill, maintenance, reminder, event]
 *         scope:
 *           type: string
 *           enum: [all, staff_buildings, building, floor, room, tenant]
 *         buildingId:
 *           type: string
 *         floorId:
 *           type: string
 *         roomId:
 *           type: string
 *         tenantId:
 *           type: string
 *         buildingIds:
 *           type: array
 *           items:
 *             type: string
 *         isDeleted:
 *           type: boolean
 *         createdAt:
 *           type: string
 *         updatedAt:
 *           type: string
 */

/**
 * @swagger
 * /landlords/notifications:
 *   post:
 *     summary: Tạo thông báo mới
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     description: Landlord hoặc Staff có quyền được phép tạo thông báo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content, scope]
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [general, bill, maintenance, reminder, event]
 *                 example: general
 *               scope:
 *                 type: string
 *                 enum: [all, staff_buildings, building, floor, room, tenant]
 *               buildingId:
 *                 type: string
 *               floorId:
 *                 type: string
 *               roomId:
 *                 type: string
 *               tenantId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo thông báo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   $ref: "#/components/schemas/Notification"
 *       403:
 *         description: Không có quyền tạo thông báo
 *       500:
 *         description: Lỗi server
 */
/**
 * @swagger
 * /landlords/notifications/{id}:
 *   patch:
 *     summary: Cập nhật thông báo
 *     description: 
 *       - Landlord có thể sửa bất kỳ thông báo nào của hệ thống mình.
 *       - Staff CHỈ được chỉnh sửa thông báo mình đã tạo, và chỉ trong 10 phút đầu.
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID của thông báo cần chỉnh sửa
 *         schema:
 *           type: string
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Cập nhật lịch cúp điện"
 *               content:
 *                 type: string
 *                 example: "Điện lực sẽ sửa chữa trong khoảng 14h - 17h."
 *
 *     responses:
 *       200:
 *         description: Cập nhật thông báo thành công
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
 *                   example: "Cập nhật thông báo thành công"
 *                 data:
 *                   type: object
 *                   $ref: "#/components/schemas/Notification"
 *
 *       403:
 *         description: Không có quyền chỉnh sửa thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chỉ được chỉnh sửa thông báo trong 10 phút đầu"
 *
 *       404:
 *         description: Không tìm thấy thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Thông báo không tồn tại"
 *
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/notifications/me:
 *   get:
 *     summary: Lấy danh sách thông báo của tôi
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     description: Trả về danh sách thông báo theo role (tenant, landlord, staff)
 *     parameters:
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
 *         description: Danh sách thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: number }
 *                     limit: { type: number }
 *                     total: { type: number }
 *                     pages: { type: number }
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: "#/components/schemas/Notification"
 *                       - type: object
 *                         properties:
 *                           isRead:
 *                             type: boolean
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/notifications/read:
 *   post:
 *     summary: Đánh dấu thông báo đã đọc (chỉ tenant)
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Đánh dấu đã đọc thành công
 *       400:
 *         description: notificationIds phải là mảng
 *       403:
 *         description: Chỉ tenant được phép đánh dấu đọc
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/notifications/{id}:
 *   delete:
 *     summary: Xóa thông báo
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xóa thông báo thành công
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi server
 *
 *   get:
 *     summary: Lấy chi tiết 1 thông báo
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   $ref: "#/components/schemas/Notification"
 *       403:
 *         description: Không có quyền xem
 *       404:
 *         description: Không tìm thấy thông báo
 *       500:
 *         description: Lỗi server
 */


router.post(
    "/",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_CREATE),
    checkSubscription,
    notificationController.createNotification
);
router.get("/me",
    checkAuthorize(["landlord", "staff", "resident"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_VIEW),
    checkSubscription,
    notificationController.getMyNotifications);
router.post("/read", notificationController.markAsRead);
router.patch("/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_EDIT),
    checkSubscription,
    notificationController.updateNotification
)
router.delete("/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_DELETE),
    checkSubscription,
    notificationController.deleteNotification);
router.get("/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_VIEW),
    checkSubscription,
    notificationController.getNotificationById);

module.exports = router;