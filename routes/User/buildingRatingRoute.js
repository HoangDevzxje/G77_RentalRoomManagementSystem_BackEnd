const router = require("express").Router();
const buildingRatingController = require("../../controllers/User/BuildingRatingController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { uploadMultiple } = require("../../configs/cloudinary");
/**
 * @swagger
 * tags:
 *   - name: Resident Building Rating
 *     description: API đánh giá tòa nhà dành cho cư dân
 */

/**
 * @swagger
 * /ratings:
 *   post:
 *     summary: Tạo hoặc cập nhật đánh giá tòa nhà (hỗ trợ upload tối đa 5 ảnh)
 *     tags: [Resident Building Rating]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *               - rating
 *             properties:
 *               buildingId:
 *                 type: string
 *                 description: ID tòa nhà cần đánh giá
 *                 example: "67b2a991222ce25e59871cc8"
 *               rating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Điểm đánh giá (1–5)
 *                 example: 4
 *               comment:
 *                 type: string
 *                 description: Nội dung đánh giá
 *                 example: "Tòa nhà sạch sẽ, dịch vụ tốt"
 *               images:
 *                 type: array
 *                 description: Upload tối đa 5 ảnh
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Tạo hoặc cập nhật đánh giá thành công
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
 *                   example: "Đánh giá của bạn đã được cập nhật"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "67c25d0f5c24cc0d226d7288"
 *                     buildingId:
 *                       type: string
 *                       example: "67b2a991222ce25e59871cc8"
 *                     rating:
 *                       type: number
 *                       example: 4
 *                     comment:
 *                       type: string
 *                       example: "Phòng đẹp, dịch vụ tốt"
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: "https://cdn.example.com/upload/img1.jpg"
 *                     user:
 *                       type: object
 *                       nullable: true
 *                       example:
 *                         fullName: "Nguyễn Văn A"
 *                     createdAt:
 *                       type: string
 *                       example: "2025-02-04T10:20:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       example: "2025-02-04T11:45:00.000Z"
 *       400:
 *         description: Lỗi dữ liệu đầu vào
 *       403:
 *         description: Không có quyền đánh giá tòa nhà (không sống trong tòa)
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /ratings/{ratingId}:
 *   delete:
 *     summary: Xóa đánh giá của chính người dùng
 *     tags: [Resident Building Rating]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ratingId
 *         in: path
 *         required: true
 *         description: ID của đánh giá cần xóa
 *         schema:
 *           type: string
 *           example: "67c260745c24cc0d226d72ab"
 *     responses:
 *       200:
 *         description: Xóa đánh giá thành công
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
 *                   example: "Đã xóa đánh giá thành công"
 *       400:
 *         description: ID đánh giá không hợp lệ
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
 *                   example: "ID đánh giá không hợp lệ"
 *       404:
 *         description: Không tìm thấy đánh giá hoặc người dùng không có quyền xóa
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
 *                   example: "Không tìm thấy đánh giá hoặc bạn không có quyền xóa"
 *       500:
 *         description: Lỗi hệ thống
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
 *                   example: "Lỗi hệ thống, vui lòng thử lại"
 */


/**
 * @swagger
 * /ratings/{buildingId}:
 *   get:
 *     summary: Lấy danh sách đánh giá của một tòa nhà
 *     tags: [Resident Building Rating]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "67b2a991222ce25e59871cc8"
 *     responses:
 *       200:
 *         description: Lấy danh sách đánh giá thành công
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
 *                     buildingId:
 *                       type: string
 *                     totalRatings:
 *                       type: number
 *                       example: 12
 *                     averageRating:
 *                       type: number
 *                       example: 4.2
 *                 ratings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       rating:
 *                         type: number
 *                         example: 5
 *                       comment:
 *                         type: string
 *                         example: "Rất hài lòng!"
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                       isAnonymous:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         example: "2025-01-30T12:45:00.000Z"
 *                       user:
 *                         type: object
 *                         nullable: true
 *                         example:
 *                           fullName: "Nguyễn Văn A"
 *                           avatar: "https://example.com/avatar.jpg"
 *       403:
 *         description: Không có quyền xem đánh giá
 *       500:
 *         description: Lỗi server
 */

router.post("/", checkAuthorize(["resident"]), uploadMultiple, buildingRatingController.createOrUpdateRating);
router.delete("/:ratingId", checkAuthorize(["resident"]), buildingRatingController.deleteMyRating);
router.get("/:buildingId", buildingRatingController.getBuildingRatings);

module.exports = router;
