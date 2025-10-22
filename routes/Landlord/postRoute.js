const router = require('express').Router();
const postController = require("../../controllers/Landlord/PostController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { uploadMultiple, uploadSingle } = require("../../configs/cloudinary");


/**
 * @swagger
 * tags:
 *   - name: Post by Landlord
 *     description: API quản lý bài đăng cho landlord
 */

/**
 * @swagger
 * /landlords/posts/ai-generate:
 *   post:
 *     summary: Gợi ý nội dung mô tả bài đăng bằng AI
 *     description: Sinh phần mô tả hấp dẫn cho bài đăng cho thuê trọ dựa trên các thông tin cơ bản (title, price, area, address). Kết quả trả về ở dạng HTML có thể hiển thị trực tiếp trên trang.
 *     tags: [Post by Landlord]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - price
 *               - area
 *               - address
 *             properties:
 *               title:
 *                 type: string
 *                 example: Phòng trọ gần ĐH Bách Khoa, sạch đẹp, an ninh
 *               price:
 *                 type: number
 *                 example: 3500000
 *               area:
 *                 type: number
 *                 example: 25
 *               address:
 *                 type: string
 *                 example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *     responses:
 *       200:
 *         description: Thành công — Trả về mô tả được AI sinh ra ở dạng HTML
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
 *                   properties:
 *                     aiDescription:
 *                       type: string
 *                       example: |
 *                         <p><b>🏠 Phòng trọ cao cấp</b> gần <i>ĐH Bách Khoa</i>, diện tích 25m², sạch sẽ, thoáng mát.</p>
 *                         <p>💡 Trang bị đầy đủ nội thất, an ninh đảm bảo, giờ giấc tự do.</p>
 *                         <p><b>Giá thuê:</b> 3.500.000đ/tháng</p>
 *       400:
 *         description: Thiếu thông tin yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thiếu thông tin cần thiết!
 *       500:
 *         description: Lỗi hệ thống hoặc lỗi AI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi khi gọi AI
 */
router.post("/posts/ai-generate", checkAuthorize(["landlord"]), postController.generateDescription);

/**
 * @swagger
 * /landlords/posts:
 *   post:
 *     summary: Tạo bài đăng cho thuê trọ
 *     description: Tạo một bài đăng mới. Chủ trọ có thể nhập thủ công hoặc dùng phần mô tả đã được AI sinh ra. Hỗ trợ upload nhiều ảnh bằng multipart/form-data.
 *     tags: [Post by Landlord]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - price
 *               - area
 *               - address
 *             properties:
 *               title:
 *                 type: string
 *                 example: Phòng trọ mini full nội thất Quận 10
 *               description:
 *                 type: string
 *                 description: Mô tả ở dạng HTML (có thể được tạo bởi AI)
 *                 example: |
 *                   <p><b>✨ Phòng trọ mini</b> mới xây, diện tích 25m², trang bị đầy đủ nội thất.</p>
 *                   <p>🚿 Toilet riêng, có cửa sổ thoáng mát. <i>Phù hợp sinh viên và nhân viên văn phòng.</i></p>
 *                   <p><b>💰 Giá thuê:</b> 3.500.000đ/tháng</p>
 *               price:
 *                 type: number
 *                 example: 3500000
 *               area:
 *                 type: number
 *                 example: 25
 *               address:
 *                 type: string
 *                 example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *               buildingId:
 *                 type: string
 *                 example: 6717a244b8234d2a1b7e3f45
 *               isDraft:
 *                 type: boolean
 *                 example: false
 *               images:
 *                 type: array
 *                 description: Danh sách ảnh upload (có thể chọn nhiều ảnh)
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Tạo bài đăng thành công
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
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 6717a54acb312c9c4e7d22b3
 *                     title:
 *                       type: string
 *                       example: Phòng trọ mini full nội thất Quận 10
 *                     slug:
 *                       type: string
 *                       example: phong-tro-mini-full-noi-that-quan-10
 *                     address:
 *                       type: string
 *                       example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *                     price:
 *                       type: number
 *                       example: 3500000
 *                     area:
 *                       type: number
 *                       example: 25
 *                     status:
 *                       type: string
 *                       enum: [active, hidden, expired]
 *                       example: active
 *       400:
 *         description: Thiếu dữ liệu cần thiết
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thiếu thông tin bài đăng!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */
router.post("/posts", checkAuthorize(["landlord"]), uploadMultiple, postController.createPost);

/**
 * @swagger
 * /landlords/posts:
 *   get:
 *     summary: Lấy danh sách bài đăng của chủ trọ
 *     description: Trả về danh sách tất cả bài đăng (chưa bị xóa mềm) của chủ trọ đang đăng nhập.
 *     tags: [Post by Landlord]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách bài đăng của chủ trọ
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
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 6717e5c3f1a8b4e567123abc
 *                       title:
 *                         type: string
 *                         example: Phòng trọ 25m2 giá 2 triệu/tháng tại Quận 7
 *                       slug:
 *                         type: string
 *                         example: phong-tro-25m2-gia-2-trieu-thang-tai-quan-7
 *                       description:
 *                         type: string
 *                         example: Phòng sạch sẽ, có gác, gần ĐH Tôn Đức Thắng.
 *                       price:
 *                         type: number
 *                         example: 2000000
 *                       area:
 *                         type: number
 *                         example: 25
 *                       address:
 *                         type: string
 *                         example: 123 Nguyễn Văn Linh, Quận 7, TP.HCM
 *                       isDraft:
 *                         type: boolean
 *                         example: false
 *                       isDeleted:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-22T13:00:00.000Z
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       500:
 *         description: Lỗi server
 */
router.get("/posts", checkAuthorize(["landlord"]), postController.listByLandlord);

/**
 * @swagger
 * /landlords/posts/{id}/soft-delete:
 *   patch:
 *     summary: Xóa mềm bài đăng
 *     description: Đánh dấu bài đăng là đã xóa (isDeleted=true, status=hidden). Chỉ chủ trọ có quyền xóa bài của mình.
 *     tags: [Post by Landlord]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID của bài đăng cần xóa mềm
 *         schema:
 *           type: string
 *           example: 6717e5c3f1a8b4e567123abc
 *     responses:
 *       200:
 *         description: Xóa mềm thành công
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
 *                   example: Xóa bài đăng (mềm) thành công!
 *       404:
 *         description: Không tìm thấy bài đăng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy bài đăng!
 *       401:
 *         description: Token không hợp lệ hoặc hết hạn
 *       500:
 *         description: Lỗi server
 */
router.patch("/posts/:id/soft-delete", checkAuthorize(["landlord"]), postController.softDelete);
module.exports = router;
