const router = require('express').Router();
const postController = require("../../controllers/Landlord/PostController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { uploadMultiple } = require("../../configs/cloudinary");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Landlord Post Management
 *     description: API quản lý bài đăng của chủ trọ
 */

/**
 * @swagger
 * /landlords/posts/ai-generate:
 *   post:
 *     summary: Gợi ý mô tả bài đăng bằng AI
 *     description: Sinh phần mô tả hấp dẫn cho bài đăng cho thuê phòng trọ. Kết quả trả về ở dạng HTML có thể hiển thị trực tiếp trong trình duyệt hoặc trình soạn thảo.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
*         application/json:
*           schema:
*             type: object
*             required:
*               - title
*               - address
*             properties:
*               title:
*                 type: string
*                 example: Phòng trọ mini gần ĐH Bách Khoa
*               address:
*                 type: string
*                 example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
*               minPrice:
*                 type: number
*                 example: 3000000
*               maxPrice:
*                 type: number
*                 example: 4500000
*               minArea:
*                 type: number
*                 example: 20
*               maxArea:
*                 type: number
*                 example: 30
*               buildingInfo:
*                 type: object
*                 properties:
*                   eIndexType:
*                     type: string
*                     example: byNumber
*                   ePrice:
*                     type: number
*                     example: 3500
*                   wIndexType:
*                     type: string
*                     example: byPerson
*                   wPrice:
*                     type: number
*                     example: 15000
*                   services:
*                     type: array
*                     items:
*                       type: object
*                       properties:
*                         label:
*                           type: string
*                           example: Internet tốc độ cao
*                         fee:
*                           type: number
*                           example: 100000
*                   regulations:
*                     type: array
*                     items:
*                       type: object
*                       properties:
*                         title:
*                           type: string
*                           example: Giờ ra vào
*                         description:
*                           type: string
*                           example: Tự do 24/24, có khóa vân tay
 *     responses:
 *       200:
 *         description: Mô tả được sinh ra bởi AI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     aiDescription:
 *                       type: string
 *                       example: "<p>🏠 Phòng trọ đầy đủ nội thất, gần ĐH Bách Khoa...</p>"
 */
router.post("/ai-generate", checkAuthorize(["landlord"]), checkSubscription, postController.generateDescription);

/**
 * @swagger
 * /landlords/posts/{buildingId}/info:
 *   get:
 *     summary: Lấy thông tin chi tiết của tòa nhà
 *     description: "Trả về thông tin chi tiết của tòa nhà gồm: danh sách phòng trống, dịch vụ, nội quy và giá điện nước."
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *     responses:
 *       200:
 *         description: Thông tin chi tiết của tòa nhà
 */
router.get("/:buildingId/info", checkAuthorize(["landlord"]), checkSubscription, postController.getBuildingInfo);

/**
 * @swagger
 * /landlords/posts:
 *   post:
 *     summary: Tạo bài đăng mới
 *     description: Tạo bài đăng cho thuê phòng trọ, có thể chọn nhiều phòng và upload nhiều ảnh.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, priceMin, priceMax, areaMin, areaMax, address, buildingId, roomIds]
 *             properties:
 *               title:
 *                 type: string
 *                 example: Cho thuê phòng tầng 3, full nội thất
 *               description:
 *                 type: string
 *                 description: Nội dung mô tả ở dạng HTML
 *               buildingId:
 *                 type: string
 *               roomIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6719b244b8234d2a1b7e3f45", "6719b244b8234d2a1b7e3f46"]
 *               priceMin:
 *                 type: number
 *                 example: 2500000
 *               priceMax:
 *                 type: number
 *                 example: 2800000
 *               areaMin:
 *                 type: number
 *                 example: 20
 *               areaMax:
 *                 type: number
 *                 example: 25
 *               address:
 *                 type: string
 *                 example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *               isDraft:
 *                 type: boolean
 *                 example: false
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Tạo bài đăng thành công
 */
router.post("/", checkAuthorize(["landlord"]), checkSubscription, uploadMultiple, postController.createPost);

/**
 * @swagger
 * /landlords/posts:
 *   get:
 *     summary: Lấy danh sách bài đăng của chủ trọ (có phân trang & lọc)
 *     description: |
 *       API cho phép **chủ trọ** xem danh sách các bài đăng mà họ đã tạo.  
 *       Có thể lọc theo trạng thái bản nháp (`isDraft`) và phân trang kết quả.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Số trang (mặc định = 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số lượng bài đăng trên mỗi trang (mặc định = 10)
 *       - in: query
 *         name: isDraft
 *         schema:
 *           type: boolean
 *           example: false
 *         description: |
 *           Lọc bài đăng theo trạng thái:  
 *           - `true`: chỉ hiển thị bài **nháp**  
 *           - `false`: chỉ hiển thị bài **đã đăng**
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
 *                         example: 6719dfee3b1f4b3a67f12345
 *                       title:
 *                         type: string
 *                         example: Phòng trọ cao cấp trung tâm quận 1
 *                       description:
 *                         type: string
 *                         example: Phòng có ban công, máy lạnh, gần chợ...
 *                       priceMin:
 *                         type: number
 *                         example: 3000000
 *                       priceMax:
 *                         type: number
 *                         example: 4500000
 *                       areaMin:
 *                         type: number
 *                         example: 20
 *                       areaMax:
 *                         type: number
 *                         example: 30
 *                       isDraft:
 *                         type: boolean
 *                         example: false
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 6719dfee3b1f4b3a67f99999
 *                           name:
 *                             type: string
 *                             example: Tòa nhà Minh Anh
 *                           address:
 *                             type: string
 *                             example: 123 Nguyễn Trãi, Quận 1, TP.HCM
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống khi lấy danh sách bài đăng
 */
router.get("/", checkAuthorize(["landlord"]), checkSubscription, postController.listByLandlord);

/**
 * @swagger
 * /landlords/posts/{id}:
 *   get:
 *     summary: Lấy chi tiết bài đăng
 *     description: Trả về toàn bộ thông tin bài đăng, kèm thông tin tòa nhà, phòng, dịch vụ, nội quy.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bài đăng
 *     responses:
 *       200:
 *         description: Thông tin chi tiết bài đăng
 */
router.get("/:id", checkAuthorize(["landlord"]), checkSubscription, postController.getPostDetail);

/**
 * @swagger
 * /landlords/posts/{id}:
 *   put:
 *     summary: Cập nhật bài đăng
 *     description: Cập nhật thông tin bài đăng (tiêu đề, mô tả, địa chỉ, tòa nhà, phòng, hình ảnh...). Nếu thay đổi danh sách phòng thì hệ thống sẽ tự động cập nhật lại giá và diện tích min/max dựa trên các phòng đã chọn.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID của bài đăng cần cập nhật
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: Cập nhật bài đăng phòng trọ quận 10
 *               description:
 *                 type: string
 *                 example: <p>Phòng sạch, mới sơn, có gác lửng, gần chợ Hòa Hưng.</p>
 *               address:
 *                 type: string
 *                 example: 25 Lý Thường Kiệt, Quận 10, TP.HCM
 *               buildingId:
 *                 type: string
 *                 example: 6717a244b8234d2a1b7e3f45
 *               roomIds:
 *                 type: array
 *                 description: Danh sách ID các phòng được liên kết với bài đăng
 *                 items:
 *                   type: string
 *                 example: ["6717a244b8234d2a1b7e3f45", "6717a244b8234d2a1b7e3f46"]
 *               isDraft:
 *                 type: boolean
 *                 example: false
 *               images:
 *                 type: array
 *                 description: Ảnh mới (nếu có). Có thể upload nhiều ảnh cùng lúc.
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Cập nhật bài đăng thành công
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
 *                   example: Cập nhật bài đăng thành công!
 *                 data:
 *                   $ref: '#/components/schemas/Post'
 *       404:
 *         description: Không tìm thấy bài đăng
 *       500:
 *         description: Lỗi server
 */
router.put("/:id", checkAuthorize(["landlord"]), checkSubscription, uploadMultiple, postController.updatePost);

/**
 * @swagger
 * /landlords/posts/{id}/soft-delete:
 *   patch:
 *     summary: Xóa mềm bài đăng
 *     description: Đánh dấu bài đăng là đã xóa (isDeleted=true, status=hidden). Chỉ chủ trọ có quyền xóa bài của mình.
 *     tags: [Landlord Post Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xóa mềm thành công
 */
router.patch("/:id/soft-delete", checkAuthorize(["landlord"]), checkSubscription, postController.softDelete);

module.exports = router;
