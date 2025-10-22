const router = require('express').Router();
const postController = require("../../controllers/User/PostController");


/**
 * @swagger
 * tags:
 *   - name: Post for User
 *     description: API post by User
 */

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Lấy danh sách bài đăng trọ đang hoạt động
 *     description: |
 *       Trả về danh sách các bài đăng có trạng thái **active**, chưa bị xóa và không phải bản nháp.  
 *       Có thể tìm kiếm theo tiêu đề hoặc địa chỉ và hỗ trợ phân trang.
 *     tags: [Post for User]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại (mặc định = 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *         description: Số lượng bài mỗi trang (mặc định = 20)
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *           example: quận 10
 *         description: Từ khóa tìm kiếm theo tiêu đề hoặc địa chỉ
 *     responses:
 *       200:
 *         description: Lấy danh sách bài đăng thành công
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
 *                         example: Phòng trọ 25m² gần ĐH Bách Khoa
 *                       description:
 *                         type: string
 *                         description: Mô tả ở dạng HTML
 *                         example: |
 *                           <p><b>✨ Phòng trọ mini</b> sạch sẽ, có cửa sổ thoáng mát.</p>
 *                           <p><b>Giá:</b> 3.000.000đ/tháng</p>
 *                       address:
 *                         type: string
 *                         example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *                       area:
 *                         type: number
 *                         example: 25
 *                       price:
 *                         type: number
 *                         example: 3000000
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                           example: https://example.com/image1.jpg
 *                       landlordId:
 *                         type: object
 *                         properties:
 *                           fullName:
 *                             type: string
 *                             example: Nguyễn Văn A
 *                           phone:
 *                             type: string
 *                             example: 0909123456
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: KTX Bách Khoa
 *                           address:
 *                             type: string
 *                             example: 12A Tô Hiến Thành, Quận 10
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-22T13:00:00.000Z
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 120
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     totalPages:
 *                       type: integer
 *                       example: 6
 *       500:
 *         description: Lỗi hệ thống khi lấy danh sách bài đăng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống khi lấy danh sách bài đăng!
 */
router.get("/", postController.list);
module.exports = router;