const router = require("express").Router();
const bookingController = require("../../controllers/Landlord/BookingManageController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
/**
 * @swagger
 * tags:
 *   - name: Landlord Booking Management
 *     description: Quản lý yêu cầu đặt lịch xem phòng của người thuê
 */

/**
 * @swagger
 * /landlords/bookings:
 *   get:
 *     summary: Lấy danh sách tất cả lịch đặt của chủ trọ
 *     tags: [Landlord Booking Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected, cancelled]
 *         description: Lọc theo trạng thái đặt lịch
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà
 *       - in: query
 *         name: postId
 *         schema:
 *           type: string
 *         description: Lọc theo bài đăng
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
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách đặt lịch của chủ trọ (có phân trang)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Booking'
 */

/**
 * @swagger
 * /landlords/bookings/{id}:
 *   get:
 *     summary: Xem chi tiết lịch đặt của người thuê
 *     tags: [Landlord Booking Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lịch đặt
 *     responses:
 *       200:
 *         description: Thông tin chi tiết lịch đặt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       404:
 *         description: Không tìm thấy lịch đặt
 */

/**
 * @swagger
 * /landlords/bookings/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái đặt lịch (accept, reject, cancel)
 *     tags: [Landlord Booking Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của lịch đặt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accept, reject, cancel]
 *                 example: accept
 *               landlordNote:
 *                 type: string
 *                 example: Hẹn bạn đến lúc 9h sáng nhé!
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
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
 *                   example: Cập nhật trạng thái thành công (accepted)
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         description: Hành động không hợp lệ
 *       404:
 *         description: Không tìm thấy lịch đặt
 */
const checkBuildingIfProvided = (req, res, next) => {
    const buildingId = req.query.buildingId;
    if (!buildingId) return next(); // Không có → bỏ qua, để controller xử lý

    return checkStaffPermission(PERMISSIONS.BOOKING_VIEW, {
        checkBuilding: true,
        buildingField: "buildingId",
    })(req, res, next);
};

router.get("/", checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.BOOKING_VIEW),
    checkBuildingIfProvided,
    checkSubscription,
    bookingController.getAllBookings);
router.get("/:id",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.BOOKING_VIEW),
    checkSubscription,
    bookingController.getBookingDetail);
router.patch("/:id/status",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.BOOKING_EDIT),
    checkSubscription,
    bookingController.updateBookingStatus);

module.exports = router;
