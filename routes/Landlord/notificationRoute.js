const express = require("express");
const router = express.Router();
const notificationController = require("../../controllers/Landlord/NotificationController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
const { uploadMultiple } = require("../../configs/cloudinary");
/**
 * @swagger
 * tags:
 *   - name: Landlord Notifications
 *     description: Quản lý thông báo (Landlord, Staff, Resident) - Hỗ trợ gửi kèm ảnh & file
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         landlordId: { type: string }
 *         createBy: { type: object, properties: { id: {type: string}, name: {type: string} } }
 *         createByRole: { type: string, enum: [landlord, staff] }
 *         title: { type: string }
 *         content: { type: string }
 *         type: { type: string, enum: [general, bill, maintenance, reminder, event] }
 *         target:
 *           type: object
 *           properties:
 *             buildings: { type: array, items: { type: string } }
 *             floors: { type: array, items: { type: string } }
 *             rooms: { type: array, items: { type: string } }
 *             residents: { type: array, items: { type: string } }
 *         images: { type: array, items: { type: string } }
 *         files:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               url: { type: string }
 *               name: { type: string }
 *               size: { type: number }
 *               type: { type: string }
 *         readBy: { type: array }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /landlords/notifications:
 *   post:
 *     summary: Tạo thông báo mới (hỗ trợ ảnh + file đính kèm)
 *     tags: [Landlord Notifications]
 *     security: 
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: 
 *               - title
 *               - content
 *               - target
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Cúp điện khẩn cấp"
 *               content:
 *                 type: string
 *                 example: "Từ 14h-17h ngày 25/11 sẽ cúp điện toàn bộ tòa nhà A"
 *               link:
 *                 type: string
 *                 example: rentalroom.com
 *               type:
 *                 type: string
 *                 enum: [general, bill, maintenance, reminder, event]
 *                 default: general
 *                 example: maintenance
 *               target:
 *                 type: string
 *                 description: |
 *                   JSON string của object target. 
 *                   Ví dụ:
 *                   '{"buildings":["64a1b2c3d4e5f67890123456"],"floors":[],"rooms":[],"residents":[]}'
 *                 example: '{"buildings":["64a1b2c3d4e5f67890123456"],"floors":[],"rooms":[],"residents":[]}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Ảnh đính kèm (jpg, png...) tối đa 20 files
 *     responses:
 *       201:
 *         description: Gửi thông báo thành công
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
 *                   example: "Gửi thông báo thành công"
 *                 data:
 *                   type: object
 *                   description: Thông tin thông báo vừa tạo
 *       400:
 *         description: Thiếu dữ liệu hoặc target không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Thiếu tiêu đề hoặc nội dung"
 *       403:
 *         description: Không có quyền hoặc không quản lý tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Không có quyền tạo thông báo"
 */

/**
 * @swagger
 * /landlords/notifications/me:
 *   get:
 *     summary: Lấy danh sách thông báo tôi NHẬN được
 *     tags: [Landlord Notifications]
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
 * /landlords/notifications/my-sent:
 *   get:
 *     summary: Lấy danh sách thông báo tôi ĐÃ GỬI
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     description: >
 *       - Chỉ landlord & staff.<br>
 *       - Landlord sẽ thấy TẤT CẢ thông báo trong các tòa mà landlord quản lý, bao gồm thông báo do landlord hoặc staff tạo.<br>
 *       - Staff chỉ thấy các thông báo trong **tòa nhà staff được phân công**, dù thông báo đó do landlord hay staff khác tạo.<br>
 *       - Có thể lọc theo `buildingId`.
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
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà mà landlord hoặc staff quản lý
 *     responses:
 *       200:
 *         description: Danh sách thông báo đã gửi kèm số liệu đọc
 *       403:
 *         description: Không có quyền hoặc không quản lý tòa nhà này
 *       500:
 *         description: Lỗi server
 */
/**
 * @swagger
 * /landlords/notifications/unread-count:
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
 *     tags: [Landlord Notifications]
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
 * /landlords/notifications/read:
 *   post:
 *     summary: Đánh dấu đã đọc 
 *     tags: [Landlord Notifications]
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
 * /landlords/notifications/{id}:
 *   patch:
 *     summary: Cập nhật thông báo (có thể thêm ảnh/file mới)
 *     tags: [Landlord Notifications]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Tiêu đề mới
 *               content:
 *                 type: string
 *                 description: Nội dung mới
 *               link:
 *                 type: string
 *                 description: Nội dung mới
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Thêm ảnh mới (upload lên Cloudinary)
 *     responses:
 *       200:
 *         description: Cập nhật thành công
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
 *                   example: "Cập nhật thành công"
 *                 data:
 *                   type: object
 *                   description: Thông tin thông báo đã cập nhật
 *       403:
 *         description: Quá 10 phút hoặc không có quyền
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chỉ được sửa trong 10 phút đầu"
 *
 *   delete:
 *     summary: Xóa thông báo
 *     tags: [Landlord Notifications]
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
 *         description: Xóa thành công
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
 *                   example: "Xóa thành công"
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
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết thông báo
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
 *                   description: Thông tin chi tiết thông báo
 */

router.post(
    "/",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_CREATE),
    checkSubscription,
    uploadMultiple,
    notificationController.createNotification
);

router.get(
    "/me",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_VIEW),
    notificationController.getMyNotifications
);

router.get(
    "/my-sent",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_VIEW),
    checkSubscription,
    notificationController.getMySentNotifications
);

router.post(
    "/read",
    checkAuthorize(["landlord", "staff"]),
    notificationController.markAsRead
);
router.get(
    "/unread-count",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_VIEW),
    notificationController.getUnreadCount
);

router.patch(
    "/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_EDIT),
    checkSubscription,
    uploadMultiple,
    notificationController.updateNotification
);

router.delete(
    "/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.NOTIFICATION_DELETE),
    checkSubscription,
    notificationController.deleteNotification
);

router.get(
    "/:id",
    checkAuthorize(["landlord", "staff"]),
    notificationController.getNotificationById
);

module.exports = router;