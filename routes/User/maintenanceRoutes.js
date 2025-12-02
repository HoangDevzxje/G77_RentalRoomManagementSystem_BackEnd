const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/User/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { uploadMultiple } = require("../../configs/cloudinary");

/**
 * @swagger
 * tags:
 *   name: Resident Maintenance
 *   description: Cư dân tạo và theo dõi yêu cầu bảo trì
 */

/**
 * @swagger
 * /maintenance:
 *   post:
 *     summary: Người thuê tạo yêu cầu bảo trì mới
 *     description: |
 *       - Hỗ trợ báo hỏng mọi thứ trong phòng (không chỉ nội thất)
 *       - Bắt buộc chọn danh mục (category)
 *       - Chỉ yêu cầu furnitureId khi category = furniture
 *       - Hỗ trợ upload tối đa 5 ảnh
 *     tags: [Resident Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - category
 *               - title
 *             properties:
 *               roomId:
 *                 type: string
 *                 description: ID của phòng đang thuê
 *                 example: 667f8d9e1a2b3c4d5e6f7a8b
 *               
 *               category:
 *                 type: string
 *                 enum:
 *                   - furniture
 *                   - electrical
 *                   - plumbing
 *                   - air_conditioning
 *                   - door_lock
 *                   - wall_ceiling
 *                   - flooring
 *                   - windows
 *                   - appliances
 *                   - internet_wifi
 *                   - pest_control
 *                   - cleaning
 *                   - safety
 *                   - other
 *                 description: Danh mục sự cố (bắt buộc)
 *                 example: plumbing
 *               
 *               furnitureId:
 *                 type: string
 *                 description: >-
 *                   Chỉ bắt buộc khi category = "furniture".  
 *                   Có thể truyền ObjectId hoặc tên đồ nội thất (ví dụ: "Ghế sofa", "Tủ lạnh")
 *                 example: 667f8d9e1a2b3c4d5e6f7a9c
 *               
 *               title:
 *                 type: string
 *                 description: Tiêu đề ngắn gọn về sự cố
 *                 example: Vòi sen phòng tắm bị rò rỉ nước
 *               
 *               description:
 *                 type: string
 *                 description: Mô tả chi tiết sự cố (khuyến khích)
 *                 example: Nước vẫn nhỏ giọt dù đã khóa van hoàn toàn, có tiếng kêu lạ khi mở nước.
 *               
 *               affectedQuantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *                 description: Số lượng thiết bị/vật dụng bị hỏng
 *                 example: 2
 *               
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 maxItems: 5
 *                 description: Ảnh chụp hiện trường (jpg, png, tối đa 5MB/ảnh)
 *     
 *     responses:
 *       201:
 *         description: Tạo yêu cầu bảo trì thành công
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
 *                   example: Đã gửi yêu cầu bảo trì thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     roomId: { type: object, properties: { roomNumber: { type: string } } }
 *                     furnitureId: { type: object, nullable: true }
 *                     category: { type: string }
 *                     title: { type: string }
 *                     status: { type: string, example: open }
 *                     photos: { type: array, items: { type: object } }
 *                     createdAt: { type: string, format: date-time }
 *       
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             examples:
 *               missing_fields:
 *                 value:
 *                   success: false
 *                   message: Thiếu phòng, danh mục hoặc tiêu đề
 *               invalid_category:
 *                 value:
 *                   success: false
 *                   message: Danh mục bảo trì không hợp lệ
 *               not_in_room:
 *                 value:
 *                   success: false
 *                   message: Bạn không phải cư dân đang ở phòng này
 *       
 *       403:
 *         description: Không có quyền truy cập
 *       
 *       500:
 *         description: Lỗi máy chủ
 */
router.post(
  "/",
  checkAuthorize(["resident"]),
  uploadMultiple,
  ctrl.createRequest
);

/**
 * @swagger
 * /maintenance/my-room:
 *   get:
 *     summary: Resident xem toàn bộ yêu cầu bảo trì của phòng mình đang ở
 *     description: |
 *       - Trả về tất cả phiếu bảo trì (của mình + bạn cùng phòng + người thuê trước) trong các phòng đang ở
 *       - Rất hữu ích để biết lịch sử hỏng hóc, tình trạng sửa chữa chung của phòng
 *       - Hỗ trợ lọc theo trạng thái, danh mục, phân trang
 *     tags: [Resident Maintenance]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, rejected]
 *         description: Lọc theo trạng thái phiếu
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: 
 *             - furniture
 *             - electrical
 *             - plumbing
 *             - air_conditioning
 *             - door_lock
 *             - wall_ceiling
 *             - flooring
 *             - windows
 *             - appliances
 *             - internet_wifi
 *             - pest_control
 *             - cleaning
 *             - safety
 *             - other
 *         description: Lọc theo danh mục sự cố
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 15
 *         description: Số phiếu mỗi trang
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
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: integer
 *                       example: 24
 *                     activeRooms:
 *                       type: integer
 *                       example: 1
 *                 rooms:
 *                   type: array
 *                   description: Danh sách phòng cư dân đang ở (hữu ích nếu ở nhiều phòng)
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       roomNumber:
 *                         type: string
 *                         example: "A501"
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                         example: "Điều hòa không mát"
 *                       category:
 *                         type: string
 *                         example: "air_conditioning"
 *                       status:
 *                         type: string
 *                         enum: [open, in_progress, resolved, rejected]
 *                       itemName:
 *                         type: string
 *                         nullable: true
 *                         description: Tên đồ nội thất (nếu category = furniture)
 *                         example: "Điều hòa Panasonic"
 *                       roomNumber:
 *                         type: string
 *                         example: "A501"
 *                       reportedBy:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "Nguyễn Văn A"
 *                           isMe:
 *                             type: boolean
 *                             description: Có phải chính mình báo không
 *                             example: true
 *                       assignee:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "Anh Hùng - Thợ điện"
 *                           phone:
 *                             type: string
 *                             nullable: true
 *                             example: "0909123456"
 *                       photoCount:
 *                         type: integer
 *                         example: 3
 *                       hasPhoto:
 *                         type: boolean
 *                         example: true
 *                       affectedQuantity:
 *                         type: integer
 *                         example: 1
 *                       scheduledAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       resolvedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *
 *             examples:
 *               success:
 *                 summary: Ví dụ thành công
 *                 value:
 *                   success: true
 *                   summary:
 *                     totalRequests: 8
 *                     activeRooms: 1
 *                   rooms:
 *                     - id: "667fb7e523adf2e34f8b9123"
 *                       roomNumber: "A501"
 *                   requests:
 *                     - _id: "669a1b2c89d3f412a5e7f890"
 *                       title: "Vòi sen phòng tắm rò rỉ"
 *                       category: "plumbing"
 *                       status: "in_progress"
 *                       itemName: null
 *                       roomNumber: "A501"
 *                       reportedBy:
 *                         name: "Trần Thị B"
 *                         isMe: false
 *                       assignee:
 *                         name: "Anh Hùng thợ nước"
 *                         phone: "0909123456"
 *                       photoCount: 2
 *                       hasPhoto: true
 *                       createdAt: "2025-11-15T08:30:00.000Z"
 *                   pagination:
 *                     page: 1
 *                     limit: 15
 *                     total: 8
 *                     pages: 1
 *                     hasNext: false
 *                     hasPrev: false
 *
 *       403:
 *         description: Không phải resident hoặc không có quyền
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Chỉ cư dân mới được sử dụng chức năng này"
 *
 *       404:
 *         description: Chưa ở phòng nào
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Bạn hiện chưa ở phòng nào"
 *
 *       500:
 *         description: Lỗi server
 */
router.get("/my-room", checkAuthorize(["resident"]), ctrl.listMyRoomRequests);

/**
 * @swagger
 * /maintenance/{id}:
 *   get:
 *     summary: Xem chi tiết yêu cầu bảo trì của cư dân
 *     tags: [Resident Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của yêu cầu bảo trì
 *     responses:
 *       200:
 *         description: Chi tiết yêu cầu
 *       404:
 *         description: Không tìm thấy yêu cầu
 *       500:
 *         description: Lỗi server
 */
router.get("/:id", checkAuthorize(["resident"]), ctrl.getRequest);

/**
 * @swagger
 * /maintenance/{id}/comment:
 *   post:
 *     summary: Thêm bình luận vào phiếu bảo trì
 *     description: |
 *       - Resident đang ở phòng hoặc Landlord/Staff mới được thêm bình luận
 *       - Tạo thông báo realtime cho Landlord + Staff + các resident khác trong phòng
 *     tags: [Resident Maintenance, Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phiếu bảo trì
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 minLength: 1
 *                 example: "Vẫn chưa thấy thợ đến sửa, nước vẫn nhỏ giọt ạ"
 *     responses:
 *       200:
 *         description: Thêm bình luận thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Đã thêm bình luận thành công" }
 *                 data: { type: object }
 *       400:
 *         description: Thiếu nội dung bình luận
 *       403:
 *         description: Không có quyền (không phải resident trong phòng hoặc landlord/staff)
 *       404:
 *         description: Không tìm thấy phiếu bảo trì
 */

/**
 * @swagger
 * /maintenance/{id}/comment/{commentId}:
 *   put:
 *     summary: Sửa bình luận
 *     description: Chỉ người viết bình luận hoặc Landlord/Staff mới được sửa
 *     tags: [Resident Maintenance, Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID phiếu bảo trì
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *         description: ID bình luận (trong mảng timeline)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 minLength: 1
 *                 example: "Đã sửa: thợ đã đến và đang xử lý"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Đã cập nhật bình luận"
 *       403:
 *         description: Không có quyền sửa
 *       404:
 *         description: Không tìm thấy phiếu hoặc bình luận
 */

/**
 * @swagger
 * /maintenance/{id}/comment/{commentId}:
 *   delete:
 *     summary: Xóa bình luận
 *     description: Chỉ người viết hoặc Landlord/Staff mới được xóa
 *     tags: [Resident Maintenance, Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: ID phiếu bảo trì
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *         description: ID bình luận cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Đã xóa bình luận"
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy phiếu hoặc bình luận
 */
router.post("/:id/comment", checkAuthorize(["resident"]), ctrl.addComment);
router.put(
  "/:id/comment/:commentId",
  checkAuthorize(["resident"]),
  ctrl.updateComment
);

router.delete(
  "/:id/comment/:commentId",
  checkAuthorize(["resident"]),
  ctrl.deleteComment
);
module.exports = router;
