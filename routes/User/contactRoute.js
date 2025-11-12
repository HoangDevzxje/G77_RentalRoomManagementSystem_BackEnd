const router = require("express").Router();
const contactController = require("../../controllers/User/ContactController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Resident Contact Request
 *     description: Quản lý yêu cầu tạo hợp đồng của người thuê
 */

/**
 * @swagger
 * /contacts:
 *   post:
 *     summary: Gửi yêu cầu tạo hợp đồng thuê phòng
 *     description: |
 *       Người thuê có thể gửi yêu cầu tạo hợp đồng đến **chủ trọ**.
 *       Yêu cầu này có thể được gửi từ **bài đăng** hoặc **trang chi tiết tòa nhà**.
 *
 *       🔹 Nếu gửi từ **bài đăng**, cần có `postId` và `buildingId` phải thuộc bài đăng đó.
 *       🔹 Nếu gửi từ **tòa nhà**, chỉ cần `buildingId` và `roomId`.
 *
 *       Hệ thống sẽ tự động xác định chủ trọ (`landlordId`) từ tòa nhà.
 *     tags: [Resident Contact Request]
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
 *               - roomId
 *               - contactName
 *               - contactPhone
 *             properties:
 *               postId:
 *                 type: string
 *                 nullable: true
 *                 description: ID bài đăng (tùy chọn — chỉ cần khi gửi từ bài đăng)
 *                 example: 67201df5c1234ab987654321
 *               buildingId:
 *                 type: string
 *                 description: ID của tòa nhà
 *                 example: 671ff7c9b1234f2f0a345678
 *               roomId:
 *                 type: string
 *                 description: ID của phòng muốn thuê
 *                 example: 671ff8d1b1234f2f0a789012
 *               contactName:
 *                 type: string
 *                 description: Họ tên người liên hệ
 *                 example: Nguyễn Văn A
 *               contactPhone:
 *                 type: string
 *                 description: Số điện thoại liên hệ
 *                 example: 0909123456
 *               tenantNote:
 *                 type: string
 *                 description: Ghi chú thêm của người thuê (nếu có)
 *                 example: Tôi muốn thuê trong 6 tháng, bắt đầu từ tháng sau.
 *     responses:
 *       201:
 *         description: Gửi yêu cầu tạo hợp đồng thành công
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
 *                   example: Gửi yêu cầu hợp đồng thành công!
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 672024f5a4567cd8e9012345
 *                     tenantId:
 *                       type: string
 *                       example: 671fe0a9123456bcde789012
 *                     landlordId:
 *                       type: string
 *                       example: 671ff7a8123456bcde789013
 *                     buildingId:
 *                       type: string
 *                       example: 671ff7c9b1234f2f0a345678
 *                     roomId:
 *                       type: string
 *                       example: 671ff8d1b1234f2f0a789012
 *                     postId:
 *                       type: string
 *                       nullable: true
 *                       example: 67201df5c1234ab987654321
 *                     status:
 *                       type: string
 *                       enum: [pending, accepted, rejected, cancelled]
 *                       example: pending
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-26T12:00:00.000Z
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc thiếu thông tin bắt buộc
 *       404:
 *         description: Không tìm thấy bài đăng, phòng hoặc tòa nhà
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc không có quyền
 *       500:
 *         description: Lỗi hệ thống khi gửi yêu cầu
 */

/**
 * @swagger
 * /contacts:
 *   get:
 *     summary: Lấy danh sách yêu cầu hợp đồng của người thuê
 *     description: |
 *       Hiển thị danh sách các yêu cầu hợp đồng mà người thuê đã gửi đến các chủ trọ.
 *       Có thể lọc theo trạng thái (pending, accepted, rejected, cancelled).
 *     tags: [Resident Contact Request]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected, cancelled]
 *         description: Lọc theo trạng thái yêu cầu
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số bản ghi mỗi trang (mặc định 10)
 *     responses:
 *       200:
 *         description: Lấy danh sách yêu cầu thành công
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
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       landlordId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                           phone:
 *                             type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, accepted, rejected, cancelled]
 *                       landlordNote:
 *                         type: string
 *       401:
 *         description: Người dùng chưa đăng nhập hoặc không có quyền
 *       500:
 *         description: Lỗi hệ thống khi lấy danh sách yêu cầu
 */

/**
 * @swagger
 * /contacts/{id}/status:
 *   patch:
 *     summary: Hủy yêu cầu tạo hợp đồng
 *     description: |
 *       Người thuê có thể hủy yêu cầu hợp đồng nếu chủ trọ chưa chấp nhận.
 *       Trạng thái sẽ chuyển sang **cancelled**.
 *     tags: [Resident Contact Request]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của yêu cầu hợp đồng
 *     responses:
 *       200:
 *         description: Hủy yêu cầu thành công
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
 *                   example: "Hủy yêu cầu hợp đồng thành công"
 *       400:
 *         description: Không thể hủy do yêu cầu đã được xử lý
 *       404:
 *         description: Không tìm thấy yêu cầu hợp đồng
 *       500:
 *         description: Lỗi hệ thống khi hủy yêu cầu
 */

router.post("/", checkAuthorize(["resident"]), contactController.createContact);
router.get("/", checkAuthorize(["resident"]), contactController.getMyContacts);
router.patch(
  "/:id/status",
  checkAuthorize(["resident"]),
  contactController.cancelContact
);

module.exports = router;
