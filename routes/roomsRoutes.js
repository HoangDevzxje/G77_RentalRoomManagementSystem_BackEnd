const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const RoomCtrl = require("../controllers/RoomController");
/**
 * @swagger
 * tags:
 *   name: Room
 *   description: API quản lý phòng
 */

/**
 * @swagger
 * /rooms:
 *   get:
 *     summary: Lấy danh sách phòng
 *     description: Lấy danh sách phòng với hỗ trợ phân trang và lọc theo buildingId, floorId, status, hoặc tìm kiếm theo roomNumber. Landlord chỉ thấy phòng trong tòa nhà của mình.
 *     tags: [Room]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: ID của tòa nhà để lọc phòng
 *         example: 68e3fe79ec7f3071215fd040
 *       - in: query
 *         name: floorId
 *         schema:
 *           type: string
 *         description: ID của tầng để lọc phòng
 *         example: 68e3fe79ec7f3071215fd041
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [available, occupied, maintenance]
 *         description: Trạng thái phòng (available, occupied, maintenance)
 *         example: available
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Tìm kiếm phòng theo roomNumber (không phân biệt hoa thường)
 *         example: 101
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
 *         description: Số lượng phòng mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách phòng
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
 *                         example: 68e3fe79ec7f3071215fd042
 *                       buildingId:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd040
 *                       floorId:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd041
 *                       roomNumber:
 *                         type: string
 *                         example: 101
 *                       area:
 *                         type: number
 *                         example: 25.5
 *                       price:
 *                         type: number
 *                         example: 3000000
 *                       maxTenants:
 *                         type: integer
 *                         example: 4
 *                       status:
 *                         type: string
 *                         enum: [available, occupied, maintenance]
 *                         example: available
 *                       description:
 *                         type: string
 *                         example: Phòng 1 phòng ngủ, có ban công
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-07T10:50:00.000Z
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
router.get("/", checkAuthorize(["admin", "landlord", "resident"]), RoomCtrl.list);

/**
 * @swagger
 * /rooms/{id}:
 *   get:
 *     summary: Lấy chi tiết phòng
 *     description: Lấy thông tin chi tiết của một phòng theo ID (admin, landlord, resident). Landlord chỉ thấy phòng trong tòa nhà của mình.
 *     tags: [Room]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd042
 *     responses:
 *       200:
 *         description: Chi tiết phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd042
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 floorId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 roomNumber:
 *                   type: string
 *                   example: 101
 *                 area:
 *                   type: number
 *                   example: 25.5
 *                 price:
 *                   type: number
 *                   example: 3000000
 *                 maxTenants:
 *                   type: integer
 *                   example: 4
 *                 status:
 *                   type: string
 *                   enum: [available, occupied, maintenance]
 *                   example: available
 *                 description:
 *                   type: string
 *                   example: Phòng 1 phòng ngủ, có ban công
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
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
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng!
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
router.get("/:id", checkAuthorize(["admin", "landlord", "resident"]), RoomCtrl.getById);

/**
 * @swagger
 * /rooms:
 *   post:
 *     summary: Tạo phòng mới
 *     description: Tạo một phòng mới trong tòa nhà và tầng được chỉ định (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Room]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *               - floorId
 *               - roomNumber
 *               - area
 *               - price
 *               - maxTenants
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: 68e3fe79ec7f3071215fd040
 *               floorId:
 *                 type: string
 *                 example: 68e3fe79ec7f3071215fd041
 *               roomNumber:
 *                 type: string
 *                 example: 101
 *               area:
 *                 type: number
 *                 example: 25.5
 *               price:
 *                 type: number
 *                 example: 3000000
 *               maxTenants:
 *                 type: integer
 *                 example: 4
 *               status:
 *                 type: string
 *                 enum: [available, occupied, maintenance]
 *                 example: available
 *               description:
 *                 type: string
 *                 example: Phòng 1 phòng ngủ, có ban công
 *     responses:
 *       201:
 *         description: Phòng được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd042
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 floorId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 roomNumber:
 *                   type: string
 *                   example: 101
 *                 area:
 *                   type: number
 *                   example: 25.5
 *                 price:
 *                   type: number
 *                   example: 3000000
 *                 maxTenants:
 *                   type: integer
 *                   example: 4
 *                 status:
 *                   type: string
 *                   enum: [available, occupied, maintenance]
 *                   example: available
 *                 description:
 *                   type: string
 *                   example: Phòng 1 phòng ngủ, có ban công
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc floorId không thuộc buildingId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: floorId không thuộc buildingId đã chọn
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
 *         description: Không có quyền, chưa mua gói, gói hết hạn, hoặc vượt giới hạn phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum:
 *                     - Bạn không có quyền thực hiện hành động này!
 *                     - Bạn chưa mua gói dịch vụ!
 *                     - Gói dịch vụ đã hết hạn!
 *                     - Vượt quá giới hạn phòng. Vui lòng nâng cấp gói!
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy tòa nhà hoặc tầng
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
router.post("/", checkAuthorize(["admin", "landlord"]), RoomCtrl.create);

/**
 * @swagger
 * /rooms/{id}:
 *   put:
 *     summary: Cập nhật phòng
 *     description: Cập nhật thông tin phòng (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Room]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd042
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roomNumber:
 *                 type: string
 *                 example: 101
 *               area:
 *                 type: number
 *                 example: 25.5
 *               price:
 *                 type: number
 *                 example: 3000000
 *               maxTenants:
 *                 type: integer
 *                 example: 4
 *               status:
 *                 type: string
 *                 enum: [available, occupied, maintenance]
 *                 example: available
 *               description:
 *                 type: string
 *                 example: Phòng 1 phòng ngủ, có ban công
 *               floorId:
 *                 type: string
 *                 example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Phòng được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd042
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 floorId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 roomNumber:
 *                   type: string
 *                   example: 101
 *                 area:
 *                   type: number
 *                   example: 25.5
 *                 price:
 *                   type: number
 *                   example: 3000000
 *                 maxTenants:
 *                   type: integer
 *                   example: 4
 *                 status:
 *                   type: string
 *                   enum: [available, occupied, maintenance]
 *                   example: available
 *                 description:
 *                   type: string
 *                   example: Phòng 1 phòng ngủ, có ban công
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc tầng không thuộc cùng tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tầng mới không thuộc cùng tòa nhà
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
 *         description: Không có quyền, chưa mua gói, gói hết hạn, hoặc vượt giới hạn phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum:
 *                     - Bạn không có quyền thực hiện hành động này!
 *                     - Bạn chưa mua gói dịch vụ!
 *                     - Gói dịch vụ đã hết hạn!
 *                     - Vượt quá giới hạn phòng. Vui lòng nâng cấp gói!
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy phòng hoặc tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng!
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
router.put("/:id", checkAuthorize(["admin", "landlord"]), RoomCtrl.update);

/**
 * @swagger
 * /rooms/{id}:
 *   delete:
 *     summary: Xóa phòng
 *     description: Xóa một phòng theo ID (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Room]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd042
 *     responses:
 *       200:
 *         description: Phòng được xóa thành công
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
 *         description: Không có quyền, chưa mua gói, gói hết hạn, hoặc vượt giới hạn phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum:
 *                     - Bạn không có quyền thực hiện hành động này!
 *                     - Bạn chưa mua gói dịch vụ!
 *                     - Gói dịch vụ đã hết hạn!
 *                     - Vượt quá giới hạn phòng. Vui lòng nâng cấp gói!
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng!
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
router.delete("/:id", checkAuthorize(["admin", "landlord"]), RoomCtrl.remove);

module.exports = router;
