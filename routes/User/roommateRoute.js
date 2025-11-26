const router = require("express").Router();
const roommateController = require("../../controllers/User/RoommateController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Resident Roommates
 *     description: API dành cho người thuê thêm roomate
 */

/**
 * @swagger
 * /roommates/add:
 *   post:
 *     summary: Thêm một hoặc nhiều người ở cùng vào phòng
 *     tags: [Resident Roommates]
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
 *               - userIds
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "67a881bd5a0ce02b58ccbc19"
 *               userIds:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: string
 *                     example: ["67b1abfa5433ef1a0193a111", "67b1ac1e5433ef1a0193a112"]
 *                   - type: string
 *                     example: "67b1abfa5433ef1a0193a111"
 *             description: >
 *               - **userIds** có thể là 1 `string` hoặc một **mảng string**.  
 *               - Hệ thống sẽ tự chuyển thành mảng.
 *     responses:
 *       200:
 *         description: Thêm roommate thành công
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
 *                   example: "Đã thêm thành công 2 người vào phòng"
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomNumber:
 *                       type: string
 *                       example: "P302"
 *                     addedCount:
 *                       type: number
 *                       example: 2
 *                     currentCount:
 *                       type: number
 *                       example: 4
 *                     maxTenants:
 *                       type: number
 *                       example: 6
 *       400:
 *         description: Lỗi từ phía người dùng (input không hợp lệ, vượt quá số người...)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Phòng chỉ cho phép tối đa 6 người. Hiện tại: 4, muốn thêm: 3"
 *       403:
 *         description: Không có quyền thêm người
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chỉ người đứng tên hợp đồng mới được thêm người ở cùng"
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lỗi hệ thống, vui lòng thử lại"
 */

/**
 * @swagger
 * /roommates/remove:
 *   post:
 *     summary: Xóa một hoặc nhiều người ở cùng khỏi phòng
 *     tags: [Resident Roommates]
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
 *               - userIds
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "67a881bd5a0ce02b58ccbc19"
 *               userIds:
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: string
 *                     example: ["67b1abfa5433ef1a0193a111", "67b1ac1e5433ef1a0193a112"]
 *                   - type: string
 *                     example: "67b1abfa5433ef1a0193a111"
 *             description: >
 *               - **userIds** có thể là 1 `string` hoặc một **mảng string**.  
 *               - Hệ thống sẽ tự chuyển thành mảng.
 *     responses:
 *       200:
 *         description: Xóa roommate thành công
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
 *                   example: "Đã xóa thành công 2 người khỏi phòng"
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomNumber:
 *                       type: string
 *                       example: "P302"
 *                     removedCount:
 *                       type: number
 *                       example: 2
 *                     currentCount:
 *                       type: number
 *                       example: 2
 *                     maxTenants:
 *                       type: number
 *                       example: 6
 *       400:
 *         description: Lỗi dữ liệu đầu vào hoặc người không thuộc phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Một số người không có trong phòng này"
 *       403:
 *         description: Không có quyền xóa người
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Chỉ người đứng tên hợp đồng mới được xóa người ở cùng"
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lỗi hệ thống, vui lòng thử lại"
 */


/**
 * @swagger
 * /roommates/search:
 *   get:
 *     summary: Tìm kiếm người dùng để thêm vào phòng
 *     tags: [Resident Roommates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         description: Từ khóa tìm kiếm email
 *         schema:
 *           type: string
 *           example: "nguyen"
 *     responses:
 *       200:
 *         description: Danh sách người dùng phù hợp
 *       400:
 *         description: Từ khóa phải có ít nhất 2 ký tự
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /roommates/{roomId}:
 *   get:
 *     summary: Lấy danh sách người ở cùng của phòng
 *     tags: [Resident Roommates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           example: "67a4cb90263d4c8dacf44e59"
 *     responses:
 *       200:
 *         description: Danh sách người ở cùng
 *       403:
 *         description: Bạn không thuộc phòng này
 *       404:
 *         description: Không tìm thấy phòng
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /roommates/{userId}/detail:
 *   get:
 *     summary: Lấy thông tin chi tiết của 1 người ở cùng
 *     description: Chỉ xem được thông tin người đang ở chung phòng với mình
 *     tags: [Resident Roommates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           example: "67b5fe90263d4c8dacf44e10"
 *     responses:
 *       200:
 *         description: Thành công
 *       403:
 *         description: Không có quyền xem thông tin người này
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi server
 */


router.post("/add", checkAuthorize(["resident"]), roommateController.addRoommate);
router.post("/remove", checkAuthorize(["resident"]), roommateController.removeRoommate);
router.get("/search", checkAuthorize(["resident"]), roommateController.searchUser);
router.get("/:roomId", checkAuthorize(["resident"]), roommateController.getMyRoommates);
router.get("/:userId/detail", checkAuthorize(["resident"]), roommateController.getRoommateDetail);

module.exports = router;
