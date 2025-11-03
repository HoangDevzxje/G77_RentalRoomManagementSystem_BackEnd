const router = require("express").Router();
const postController = require("../../controllers/User/PostController");

/**
 * @swagger
 * tags:
 *   - name: Resident Post
 *     description: API dành cho người thuê xem bài đăng trọ
 */

/**
 * @swagger
 * /posts:
 *   get:
 *     summary: Lấy danh sách bài đăng trọ đang hoạt động
 *     description: |
 *       Trả về danh sách các bài đăng có trạng thái **active**, chưa bị xóa và không phải bản nháp.
 *       Có thể tìm kiếm theo tiêu đề hoặc địa chỉ và hỗ trợ phân trang.
 *     tags: [Resident Post]
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
 *                       address:
 *                         type: string
 *                         example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                       priceMin:
 *                         type: number
 *                         example: 2500000
 *                       priceMax:
 *                         type: number
 *                         example: 3500000
 *                       areaMin:
 *                         type: number
 *                         example: 20
 *                       areaMax:
 *                         type: number
 *                         example: 30
 *                       landlordId:
 *                         type: object
 *                         properties:
 *                           fullName:
 *                             type: string
 *                           phone:
 *                             type: string
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           address:
 *                             type: string
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
 */

/**
 * @swagger
 * /posts/{id}:
 *   get:
 *     summary: Lấy chi tiết bài đăng trọ
 *     description: |
 *       Trả về thông tin chi tiết của bài đăng bao gồm chủ trọ, tòa nhà, và danh sách phòng có trong bài đăng.
 *     tags: [Resident Post]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 6717e5c3f1a8b4e567123abc
 *         description: ID của bài đăng
 *     responses:
 *       200:
 *         description: Lấy chi tiết bài đăng thành công
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
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     address:
 *                       type: string
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                     landlordId:
 *                       type: object
 *                       properties:
 *                         fullName:
 *                           type: string
 *                         phone:
 *                           type: string
 *                         email:
 *                           type: string
 *                         avatar:
 *                           type: string
 *                     buildingId:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         name:
 *                           type: string
 *                         address:
 *                           type: string
 *                         description:
 *                           type: string
 *                         eIndexType:
 *                           type: string
 *                           enum: [byNumber, included]
 *                         ePrice:
 *                           type: number
 *                         wIndexType:
 *                           type: string
 *                           enum: [byNumber, byPerson, included]
 *                         wPrice:
 *                           type: number
 *                     availableRooms:
 *                       type: array
 *                       description: Danh sách phòng được đăng trong bài (chỉ phòng còn trống)
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           area:
 *                             type: number
 *                           price:
 *                             type: number
 *                           floorNumber:
 *                             type: integer
 *                           description:
 *                             type: string
 *                           images:
 *                             type: array
 *                             items:
 *                               type: string
 *       404:
 *         description: Bài đăng không tồn tại
 *       500:
 *         description: Lỗi hệ thống khi lấy chi tiết bài đăng
 */

/**
 * @swagger
 * /posts/rooms/{roomId}:
 *   get:
 *     summary: Xem chi tiết phòng trọ thuộc bài đăng
 *     description: |
 *       Trả về thông tin chi tiết của một phòng cụ thể (bao gồm thông tin tòa nhà).
 *     tags: [Resident Post]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           example: 6717a244b8234d2a1b7e3f45
 *         description: ID của phòng cần xem chi tiết
 *     responses:
 *       200:
 *         description: Lấy chi tiết phòng thành công
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
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *                     area:
 *                       type: number
 *                     description:
 *                       type: string
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                     buildingId:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         address:
 *                           type: string
 *                         ePrice:
 *                           type: number
 *                         wPrice:
 *                           type: number
 *                         eIndexType:
 *                           type: string
 *                         wIndexType:
 *                           type: string
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi hệ thống khi lấy chi tiết phòng
 */

router.get("/", postController.getAllPostsByTenant);
router.get("/:id", postController.getDetailPostByTenant);
router.get("/rooms/:roomId", postController.getRoomDetailByTenant);

module.exports = router;
