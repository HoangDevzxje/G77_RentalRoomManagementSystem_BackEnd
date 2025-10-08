const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const BuildingCtrl = require("../controllers/BuildingController");
const checkSubscription = require("../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   name: Building
 *   description: API quản lý tòa nhà
 */

/**
 * @swagger
 * /buildings:
 *   get:
 *     summary: Lấy danh sách tòa nhà
 *     description: Lấy danh sách tòa nhà với hỗ trợ phân trang và tìm kiếm theo tên (admin, landlord, resident). Landlord chỉ thấy tòa nhà của mình.
 *     tags: [Building]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Tìm kiếm tòa nhà theo tên (không phân biệt hoa thường)
 *         example: Tòa nhà A
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số lượng tòa nhà mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách tòa nhà
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
 *                         example: 68e3fe79ec7f3071215fd040
 *                       name:
 *                         type: string
 *                         example: Tòa nhà A
 *                       address:
 *                         type: string
 *                         example: 123 Đường Láng, Hà Nội
 *                       eIndexType:
 *                         type: string
 *                         example: per_room
 *                       ePrice:
 *                         type: number
 *                         example: 1500
 *                       wIndexType:
 *                         type: string
 *                         example: per_person
 *                       wPrice:
 *                         type: number
 *                         example: 20000
 *                       description:
 *                         type: string
 *                         example: Tòa nhà 5 tầng, gần trung tâm.
 *                       landlordId:
 *                         type: string
 *                         example: 68d7dad6cadcf51ed611e121
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-07T00:50:00.000Z
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 20
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
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
router.get("/", checkAuthorize(["admin", "landlord", "resident"]), BuildingCtrl.list);

/**
 * @swagger
 * /buildings/{id}:
 *   get:
 *     summary: Lấy chi tiết tòa nhà
 *     description: Lấy thông tin chi tiết của một tòa nhà theo ID (admin, landlord, resident). Landlord chỉ thấy tòa nhà của mình.
 *     tags: [Building]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd040
 *     responses:
 *       200:
 *         description: Chi tiết tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 name:
 *                   type: string
 *                   example: Tòa nhà A
 *                 address:
 *                   type: string
 *                   example: 123 Đường Láng, Hà Nội
 *                 eIndexType:
 *                   type: string
 *                   example: per_room
 *                 ePrice:
 *                   type: number
 *                   example: 1500
 *                 wIndexType:
 *                   type: string
 *                   example: per_person
 *                 wPrice:
 *                   type: number
 *                   example: 20000
 *                 description:
 *                   type: string
 *                   example: Tòa nhà 5 tầng, gần trung tâm.
 *                 landlordId:
 *                   type: string
 *                   example: 68d7dad6cadcf51ed611e121
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T00:50:00.000Z
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền (landlord không sở hữu tòa nhà)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền!
 *       404:
 *         description: Không tìm thấy tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa nhà!
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
router.get("/:id", checkAuthorize(["admin", "landlord", "resident"]), BuildingCtrl.getById);

/**
 * @swagger
 * /buildings:
 *   post:
 *     summary: Tạo tòa nhà mới
 *     description: Tạo một tòa nhà mới (chỉ landlord, yêu cầu subscription active).
 *     tags: [Building]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *                 example: Tòa nhà A
 *               address:
 *                 type: string
 *                 example: 123 Đường Láng, Hà Nội
 *               eIndexType:
 *                 type: string
 *                 enum: [per_room, per_person, per_kwh]
 *                 example: per_room
 *               ePrice:
 *                 type: number
 *                 example: 1500
 *               wIndexType:
 *                 type: string
 *                 enum: [per_room, per_person, per_m3]
 *                 example: per_person
 *               wPrice:
 *                 type: number
 *                 example: 20000
 *               description:
 *                 type: string
 *                 example: Tòa nhà 5 tầng, gần trung tâm.
 *     responses:
 *       201:
 *         description: Tòa nhà được tạo thành công
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
 *                       example: 68e3fe79ec7f3071215fd040
 *                     name:
 *                       type: string
 *                       example: Tòa nhà A
 *                     address:
 *                       type: string
 *                       example: 123 Đường Láng, Hà Nội
 *                     eIndexType:
 *                       type: string
 *                       example: per_room
 *                     ePrice:
 *                       type: number
 *                       example: 1500
 *                     wIndexType:
 *                       type: string
 *                       example: per_person
 *                     wPrice:
 *                       type: number
 *                       example: 20000
 *                     description:
 *                       type: string
 *                       example: Tòa nhà 5 tầng, gần trung tâm.
 *                     landlordId:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:50:00.000Z
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dữ liệu không hợp lệ!
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền hoặc subscription hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Gói dịch vụ đã hết hạn hoặc không tồn tại!
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
router.post("/", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.create);

/**
 * @swagger
 * /buildings/{id}:
 *   put:
 *     summary: Cập nhật tòa nhà
 *     description: Cập nhật thông tin tòa nhà (chỉ landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Building]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd040
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Tòa nhà A (Cập nhật)
 *               address:
 *                 type: string
 *                 example: 456 Đường Láng, Hà Nội
 *               eIndexType:
 *                 type: string
 *                 enum: [per_room, per_person, per_kwh]
 *                 example: per_room
 *               ePrice:
 *                 type: number
 *                 example: 2000
 *               wIndexType:
 *                 type: string
 *                 enum: [per_room, per_person, per_m3]
 *                 example: per_person
 *               wPrice:
 *                 type: number
 *                 example: 25000
 *               description:
 *                 type: string
 *                 example: Tòa nhà 5 tầng, cập nhật thông tin.
 *     responses:
 *       200:
 *         description: Tòa nhà được cập nhật thành công
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
 *                       example: 68e3fe79ec7f3071215fd040
 *                     name:
 *                       type: string
 *                       example: Tòa nhà A (Cập nhật)
 *                     address:
 *                       type: string
 *                       example: 456 Đường Láng, Hà Nội
 *                     eIndexType:
 *                       type: string
 *                       example: per_room
 *                     ePrice:
 *                       type: number
 *                       example: 2000
 *                     wIndexType:
 *                       type: string
 *                       example: per_person
 *                     wPrice:
 *                       type: number
 *                       example: 25000
 *                     description:
 *                       type: string
 *                       example: Tòa nhà 5 tầng, cập nhật thông tin.
 *                     landlordId:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:50:00.000Z
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dữ liệu không hợp lệ!
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền hoặc subscription hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền!
 *       404:
 *         description: Không tìm thấy tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa nhà!
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
router.put("/:id", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.update);

/**
 * @swagger
 * /buildings/{id}:
 *   delete:
 *     summary: Xóa tòa nhà
 *     description: Xóa tòa nhà nếu không có tầng hoặc phòng liên quan (admin hoặc landlord sở hữu, yêu cầu subscription active).
 *     tags: [Building]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd040
 *     responses:
 *       200:
 *         description: Tòa nhà được xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       403:
 *         description: Không có quyền hoặc subscription hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền!
 *       404:
 *         description: Không tìm thấy tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa nhà!
 *       409:
 *         description: Có tầng hoặc phòng liên quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hãy xóa/di chuyển Floors & Rooms trước khi xóa Building!
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
router.delete("/:id", checkAuthorize(["landlord"]), checkSubscription, BuildingCtrl.remove);

module.exports = router;
