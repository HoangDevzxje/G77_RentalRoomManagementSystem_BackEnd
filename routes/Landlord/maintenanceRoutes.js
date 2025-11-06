const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Landlord/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Landlord - Maintenance
 *   description: Quản lý yêu cầu bảo trì của tòa nhà
 */

/**
 * @swagger
 * /landlords/maintenance:
 *   get:
 *     summary: Lấy danh sách yêu cầu bảo trì
 *     tags: [Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *       - name: roomId
 *         in: query
 *         schema:
 *           type: string
 *         description: ID của phòng
 *       - name: furnitureId
 *         in: query
 *         schema:
 *           type: string
 *         description: ID của đồ nội thất
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, rejected]
 *         description: Trạng thái yêu cầu
 *       - name: priority
 *         in: query
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Mức độ ưu tiên
 *       - name: q
 *         in: query
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tiêu đề hoặc mô tả
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Số lượng mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu bảo trì
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       buildingId:
 *                         type: string
 *                       roomId:
 *                         type: object
 *                       furnitureId:
 *                         type: object
 *                       reporterAccountId:
 *                         type: object
 *                       assigneeAccountId:
 *                         type: object
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       photos:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             url:
 *                               type: string
 *                             note:
 *                               type: string
 *                       priority:
 *                         type: string
 *                         enum: [low, medium, high, urgent]
 *                       status:
 *                         type: string
 *                         enum: [open, in_progress, resolved, rejected]
 *                       affectedQuantity:
 *                         type: number
 *                       estimatedCost:
 *                         type: number
 *                       actualCost:
 *                         type: number
 *                       scheduledAt:
 *                         type: string
 *                         format: date-time
 *                       resolvedAt:
 *                         type: string
 *                         format: date-time
 *                       timeline:
 *                         type: array
 *                         items:
 *                           type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       500:
 *         description: Lỗi server
 */
router.get(
  "/",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.listRequests
);

/**
 * @swagger
 * /landlords/maintenance/{id}:
 *   get:
 *     summary: Lấy chi tiết yêu cầu bảo trì
 *     tags: [Landlord - Maintenance]
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
 *         description: Chi tiết yêu cầu bảo trì
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     buildingId:
 *                       type: object
 *                     roomId:
 *                       type: object
 *                     furnitureId:
 *                       type: object
 *                     reporterAccountId:
 *                       type: object
 *                     assigneeAccountId:
 *                       type: object
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     photos:
 *                       type: array
 *                       items:
 *                         type: object
 *                     priority:
 *                       type: string
 *                       enum: [low, medium, high, urgent]
 *                     status:
 *                       type: string
 *                       enum: [open, in_progress, resolved, rejected]
 *                     affectedQuantity:
 *                       type: number
 *                     estimatedCost:
 *                       type: number
 *                     actualCost:
 *                       type: number
 *                     scheduledAt:
 *                       type: string
 *                       format: date-time
 *                     resolvedAt:
 *                       type: string
 *                       format: date-time
 *                     timeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Không tìm thấy yêu cầu bảo trì
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       500:
 *         description: Lỗi server
 */
router.get(
  "/:id",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.getRequest
);

/**
 * @swagger
 * /landlords/maintenance/{id}:
 *   patch:
 *     summary: Cập nhật yêu cầu bảo trì
 *     description: Cập nhật trạng thái, người được giao, lịch hẹn, chi phí của yêu cầu bảo trì (chỉ landlord và admin)
 *     tags: [Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của yêu cầu bảo trì
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, rejected]
 *                 description: Trạng thái mới của yêu cầu
 *                 example: in_progress
 *               assigneeAccountId:
 *                 type: string
 *                 description: ID tài khoản người được giao xử lý
 *                 example: 68d7dad6cadcf51ed611e121
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: Thời gian lên lịch xử lý
 *                 example: 2024-01-20T10:00:00.000Z
 *               estimatedCost:
 *                 type: number
 *                 description: Chi phí ước tính
 *                 example: 500000
 *               actualCost:
 *                 type: number
 *                 description: Chi phí thực tế
 *                 example: 450000
 *               note:
 *                 type: string
 *                 description: Ghi chú khi cập nhật
 *                 example: Đã kiểm tra và sửa chữa
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã cập nhật
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     buildingId:
 *                       type: string
 *                     roomId:
 *                       type: string
 *                     furnitureId:
 *                       type: string
 *                     title:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [open, in_progress, resolved, rejected]
 *                     assigneeAccountId:
 *                       type: string
 *                     scheduledAt:
 *                       type: string
 *                       format: date-time
 *                     estimatedCost:
 *                       type: number
 *                     actualCost:
 *                       type: number
 *                     resolvedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       403:
 *         description: Không có quyền cập nhật yêu cầu này
 *       404:
 *         description: Không tìm thấy yêu cầu bảo trì
 *       500:
 *         description: Lỗi server
 */
router.patch(
  "/:id",
  checkAuthorize(["landlord", "admin"]),
  ctrl.updateRequest
);

/**
 * @swagger
 * /landlords/maintenance/{id}/comment:
 *   post:
 *     summary: Thêm bình luận/ghi chú vào yêu cầu bảo trì
 *     description: Thêm bình luận hoặc ghi chú vào timeline của yêu cầu bảo trì
 *     tags: [Landlord - Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của yêu cầu bảo trì
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
 *                 description: Nội dung bình luận/ghi chú
 *                 example: Đã kiểm tra, cần thay thế linh kiện mới
 *     responses:
 *       200:
 *         description: Thêm bình luận thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã thêm ghi chú
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     timeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           at:
 *                             type: string
 *                             format: date-time
 *                           by:
 *                             type: string
 *                           action:
 *                             type: string
 *                             example: comment
 *                           note:
 *                             type: string
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       403:
 *         description: Không có quyền thêm bình luận cho yêu cầu này
 *       404:
 *         description: Không tìm thấy yêu cầu bảo trì
 *       500:
 *         description: Lỗi server
 */
router.post(
  "/:id/comment",
  checkAuthorize(["resident", "landlord", "admin"]),
  ctrl.comment
);

module.exports = router;
