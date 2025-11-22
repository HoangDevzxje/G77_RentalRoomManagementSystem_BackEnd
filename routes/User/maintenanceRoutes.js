const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/User/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Resident - Maintenance
 *   description: Cư dân tạo và theo dõi yêu cầu bảo trì
 */

/**
 * @swagger
 * /maintenance:
 *   post:
 *     summary: Tạo yêu cầu bảo trì mới
 *     tags: [Resident - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - furnitureId
 *               - title
 *             properties:
 *               roomId:
 *                 type: string
 *                 description: ID phòng xảy ra sự cố
 *               furnitureId:
 *                 type: string
 *                 description: ID đồ nội thất hỏng
 *               title:
 *                 type: string
 *                 example: "Vòi nước bị rò rỉ"
 *               description:
 *                 type: string
 *                 example: "Rò rỉ tại bồn rửa, nước chảy liên tục"
 *               photos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     note:
 *                       type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 example: medium
 *               affectedQuantity:
 *                 type: number
 *                 example: 1
 *     responses:
 *       200:
 *         description: Tạo yêu cầu thành công
 *       400:
 *         description: Thiếu hoặc sai dữ liệu
 *       500:
 *         description: Lỗi server
 */
router.post("/", checkAuthorize(["resident"]), ctrl.createRequest);

/**
 * @swagger
 * /maintenance/my-room:
 *   get:
 *     summary: Resident xem danh sách yêu cầu bảo trì của phòng hiện tại
 *     description: |
 *       Trả về danh sách các yêu cầu bảo trì thuộc phòng mà cư dân đang ở.
 *
 *       Logic:
 *       - Xác định phòng hiện tại dựa trên `Room.currentTenantIds` chứa ID cư dân
 *       - Chỉ lấy phiếu có `roomId` = phòng đó
 *       - Có thể lọc thêm theo `status`, `priority`, phân trang qua `page`, `limit`
 *
 *     tags: [Resident - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, rejected]
 *         required: false
 *         description: Lọc theo trạng thái phiếu
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         required: false
 *         description: Lọc theo độ ưu tiên
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *         description: Trang hiện tại (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Số item mỗi trang (mặc định 10, tối đa 100)
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu bảo trì của phòng hiện tại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 room:
 *                   type: object
 *                   description: Thông tin phòng hiện tại của cư dân
 *                   properties:
 *                     id:
 *                       type: string
 *                     roomNumber:
 *                       type: string
 *                     floorId:
 *                       type: string
 *                     area:
 *                       type: number
 *                     price:
 *                       type: number
 *                     status:
 *                       type: string
 *                     building:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         address:
 *                           type: string
 *                 data:
 *                   type: array
 *                   description: Danh sách phiếu bảo trì
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       status:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       roomId:
 *                         type: string
 *                       furnitureId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       assigneeName:
 *                         type: string
 *                       scheduledAt:
 *                         type: string
 *                         format: date-time
 *                       estimatedCost:
 *                         type: number
 *                       actualCost:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       resolvedAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 sort:
 *                   type: string
 *             examples:
 *               success:
 *                 value:
 *                   room:
 *                     id: "667fb7e523adf2e34f8b9123"
 *                     roomNumber: "A501"
 *                     floorId: "667fb7c123adf2e34f8b9001"
 *                     area: 25
 *                     price: 4500000
 *                     status: "rented"
 *                     building:
 *                       _id: "667fb7b923adf2e34f8b8fff"
 *                       name: "Tòa nhà Trúc Xanh"
 *                       address: "123 Đường ABC, Quận 9, TP.HCM"
 *                   data:
 *                     - _id: "6680bb1c89c1f255a0e3df01"
 *                       title: "Vòi nước bị rò rỉ"
 *                       status: "in_progress"
 *                       priority: "medium"
 *                       roomId: "667fb7e523adf2e34f8b9123"
 *                       furnitureId:
 *                         _id: "667fba0023adf2e34f8b9555"
 *                         name: "Bồn rửa chén"
 *                       assigneeName: "Nguyễn Văn B"
 *                       scheduledAt: "2025-11-20T09:00:00.000Z"
 *                       estimatedCost: 150000
 *                       actualCost: null
 *                       createdAt: "2025-11-18T03:20:00.000Z"
 *                       resolvedAt: null
 *                   total: 1
 *                   page: 1
 *                   limit: 10
 *                   pages: 1
 *                   sort: "-createdAt"
 *       403:
 *         description: Không phải resident
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Chỉ resident mới được dùng API này"
 *       404:
 *         description: Cư dân chưa được gán vào phòng nào
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Bạn chưa được gán vào phòng nào hoặc phòng chưa active"
 *       500:
 *         description: Lỗi server
 */
router.get("/my-room", checkAuthorize(["resident"]), ctrl.listMyRoomRequests);

/**
 * @swagger
 * /maintenance/{id}:
 *   get:
 *     summary: Xem chi tiết yêu cầu bảo trì của cư dân
 *     tags: [Resident - Maintenance]
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
 *     summary: Thêm bình luận/ghi chú vào yêu cầu bảo trì
 *     tags: [Resident - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Đã cập nhật thêm hình ảnh sự cố"
 *     responses:
 *       200:
 *         description: Thêm bình luận thành công
 *       403:
 *         description: Không có quyền bình luận
 *       404:
 *         description: Không tìm thấy yêu cầu
 *       500:
 *         description: Lỗi server
 */
router.post("/:id/comment", checkAuthorize(["resident"]), ctrl.comment);

module.exports = router;
