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
 * /residents/maintenance:
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
 * /residents/maintenance/{id}:
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
 * /residents/maintenance/{id}/comment:
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
