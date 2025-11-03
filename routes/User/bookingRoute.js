const router = require("express").Router();
const bookingController = require("../../controllers/User/BookingController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Resident Booking
 *     description: API đặt lịch xem phòng dành cho người thuê
 */

/**
 * @swagger
 * /bookings:
 *   post:
 *     summary: Đặt lịch xem phòng
 *     description: |
 *       Người thuê **phải đăng nhập** để đặt lịch xem phòng.  
 *       Hệ thống sẽ **kiểm tra lịch khả dụng của chủ trọ** và **xác minh rằng tòa nhà (`buildingId`) trùng khớp với bài đăng (`postId`)**.  
 *       Nếu hợp lệ, yêu cầu đặt lịch sẽ được tạo ở trạng thái `pending` chờ chủ trọ xác nhận.  
 *       
 *       ⚠️ Lưu ý:
 *       - `timeSlot` phải nằm trong khung giờ rảnh mà chủ trọ đã thiết lập.  
 *       - Không thể đặt lịch vào ngày mà chủ trọ đã đánh dấu là **bận** hoặc **nghỉ**.
 *     tags: [Resident Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - postId
 *               - buildingId
 *               - date
 *               - timeSlot
 *               - contactName
 *               - contactPhone
 *             properties:
 *               postId:
 *                 type: string
 *                 example: 6719dfc7b2a9a3f2b4567890
 *                 description: ID của bài đăng (Post)
 *               buildingId:
 *                 type: string
 *                 example: 6719dfee3b1f4b3a67f12345
 *                 description: ID của tòa nhà thuộc bài đăng
 *               date:
 *                 type: string
 *                 format: date
 *                 example: 2025-11-01
 *                 description: Ngày muốn xem phòng
 *               timeSlot:
 *                 type: string
 *                 example: "09:00-10:00"
 *                 description: Khung giờ mong muốn (trùng với khung giờ khả dụng)
 *               contactName:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               contactPhone:
 *                 type: string
 *                 example: 0909123456
 *               tenantNote:
 *                 type: string
 *                 example: Tôi muốn xem thêm phòng có ban công.
 *     responses:
 *       201:
 *         description: Đặt lịch thành công
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
 *                   example: Đặt lịch xem phòng thành công, vui lòng chờ chủ trọ xác nhận!
 *                 data:
 *                   $ref: '#/components/schemas/Booking'
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc khung giờ không khả dụng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Tòa nhà không khớp với bài đăng!" 
 *       404:
 *         description: Không tìm thấy bài đăng hoặc lịch rảnh của chủ trọ
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /bookings/my:
 *   get:
 *     summary: Xem danh sách lịch xem phòng của người thuê
 *     description: |
 *       Lấy toàn bộ các lịch xem phòng mà người thuê đã đặt (bao gồm trạng thái đang chờ, đã chấp nhận, đã hủy...).
 *     tags: [Resident Booking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
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
 *                     $ref: '#/components/schemas/Booking'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /bookings/available-slots/{buildingId}:
 *   get:
 *     summary: Lấy lịch khả dụng của chủ trọ theo tòa nhà
 *     description: |
 *       Trả về danh sách các ngày và khung giờ khả dụng để người thuê có thể đặt lịch xem phòng.  
 *       Mặc định hiển thị tuần hiện tại nếu không truyền startDate và endDate.
 *     tags: [Resident Booking]
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-10-27
 *         description: Ngày bắt đầu (mặc định = đầu tuần hiện tại)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: 2025-11-02
 *         description: Ngày kết thúc (mặc định = hết tuần hiện tại)
 *     responses:
 *       200:
 *         description: Lấy lịch khả dụng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 buildingId:
 *                   type: string
 *                   example: 671a5bcb8a1b1b2345f67890
 *                 landlordId:
 *                   type: string
 *                   example: 671a5bc08a1b1b2345f12345
 *                 availableDays:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         example: 2025-11-02
 *                       slots:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             startTime:
 *                               type: string
 *                               example: "09:00"
 *                             endTime:
 *                               type: string
 *                               example: "11:00"
 *                       note:
 *                         type: string
 *                         example: "Chủ trọ nghỉ ngày này"
 *       404:
 *         description: Không tìm thấy lịch của chủ trọ
 *       500:
 *         description: Lỗi hệ thống khi lấy lịch khả dụng
 */

/**
 * @swagger
 * /bookings/{id}/cancel:
 *   patch:
 *     summary: Hủy lịch xem phòng
 *     description: |
 *       Người thuê có thể hủy lịch xem phòng **trước khi được chủ trọ xác nhận** (trạng thái `pending`).  
 *       Nếu lịch đã được chấp nhận thì không thể hủy.
 *     tags: [Resident Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 671a0ef8a8f11a22c7123456
 *         description: ID của lịch đặt muốn hủy
 *     responses:
 *       200:
 *         description: Hủy lịch thành công
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
 *                   example: Hủy lịch thành công!
 *       400:
 *         description: Không thể hủy lịch đã được chấp nhận
 *       404:
 *         description: Không tìm thấy lịch
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Booking:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         tenantId:
 *           type: string
 *         landlordId:
 *           type: string
 *         buildingId:
 *           type: string
 *         postId:
 *           type: string
 *         contactName:
 *           type: string
 *         contactPhone:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         timeSlot:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, accepted, rejected, cancelled]
 *         tenantNote:
 *           type: string
 *         landlordNote:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

router.post("/", checkAuthorize(["resident"]), bookingController.create);
router.get("/my", checkAuthorize(["resident"]), bookingController.getMyBookings);
router.get("/available-slots/:buildingId", bookingController.getAvailableSlots);
router.patch("/:id/cancel", checkAuthorize(["resident"]), bookingController.cancel);

module.exports = router;
