const router = require("express").Router();
const { checkAuthorize } = require("../middleware/authMiddleware");
const FloorCtrl = require("../controllers/FloorController");
const checkSubscription = require("../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   name: Floor
 *   description: API quản lý tầng
 */

/**
 * @swagger
 * /floors:
 *   get:
 *     summary: Lấy danh sách tầng
 *     description: Lấy danh sách tầng, có thể lọc theo buildingId. Landlord chỉ thấy tầng trong tòa nhà của mình.
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: ID của tòa nhà để lọc tầng
 *         example: 68e91c7be25f897d2da77944
 *     responses:
 *       200:
 *         description: Danh sách tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: 68e3fe79ec7f3071215fd041
 *                   buildingId:
 *                     type: string
 *                     example: 68e3fe79ec7f3071215fd040
 *                   label:
 *                     type: string
 *                     example: Tầng 1
 *                   level:
 *                     type: integer
 *                     example: 1
 *                   description:
 *                     type: string
 *                     example: Tầng 1 với 5 phòng
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     example: 2025-10-07T10:50:00.000Z
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
router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident"]),
  FloorCtrl.list
);

/**
 * @swagger
 * /floors/{id}:
 *   get:
 *     summary: Lấy chi tiết tầng
 *     description: Lấy thông tin chi tiết của một tầng theo ID (admin, landlord, resident). Landlord chỉ thấy tầng trong tòa nhà của mình.
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Chi tiết tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 description:
 *                   type: string
 *                   example: Tầng 1 với 5 phòng
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
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord", "resident"]),
  FloorCtrl.getById
);

/**
 * @swagger
 * /floors:
 *   post:
 *     summary: Tạo tầng mới
 *     description: Tạo một tầng mới trong tòa nhà được chỉ định (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *               - label
 *               - level
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: 68e3fe79ec7f3071215fd040
 *               label:
 *                 type: string
 *                 example: Tầng 1
 *               level:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: Tầng 1 với 5 phòng
 *     responses:
 *       201:
 *         description: Tầng được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 description:
 *                   type: string
 *                   example: Tầng 1 với 5 phòng
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
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
router.post(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.create
);

/**
 * @swagger
 * /floors/quick-create:
 *   post:
 *     summary: Tạo nhanh nhiều tầng
 *     description: Tạo nhanh nhiều tầng cho một tòa nhà (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: 68e3fe79ec7f3071215fd040
 *                 description: ID của tòa nhà
 *               fromLevel:
 *                 type: integer
 *                 example: 1
 *                 description: Tầng bắt đầu (dùng cùng với toLevel)
 *               toLevel:
 *                 type: integer
 *                 example: 5
 *                 description: Tầng kết thúc (dùng cùng với fromLevel)
 *               count:
 *                 type: integer
 *                 example: 3
 *                 description: Số lượng tầng cần tạo (dùng cùng với startLevel)
 *               startLevel:
 *                 type: integer
 *                 example: 1
 *                 description: Tầng bắt đầu (dùng cùng với count)
 *               description:
 *                 type: string
 *                 example: Mô tả chung cho các tầng
 *                 description: Mô tả chung cho tất cả tầng được tạo
 *     responses:
 *       201:
 *         description: Tầng được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tạo nhanh tầng thành công.
 *                 createdCount:
 *                   type: integer
 *                   example: 3
 *                   description: Số lượng tầng đã được tạo
 *                 createdLevels:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 2, 3]
 *                   description: Danh sách level của các tầng đã tạo
 *                 skippedLevels:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [4, 5]
 *                   description: Danh sách level đã tồn tại (bị bỏ qua)
 *       200:
 *         description: Tất cả level yêu cầu đã tồn tại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tất cả level yêu cầu đã tồn tại, không có tầng nào được tạo.
 *                 createdCount:
 *                   type: integer
 *                   example: 0
 *                 createdLevels:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: []
 *                 skippedLevels:
 *                   type: array
 *                   items:
 *                     type: integer
 *                   example: [1, 2, 3, 4, 5]
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   enum:
 *                     - Cần (fromLevel,toLevel) hoặc (count,startLevel)
 *                     - fromLevel phải <= toLevel
 *                   example: Cần (fromLevel,toLevel) hoặc (count,startLevel)
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
 *         description: Một số level bị trùng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Một số level bị trùng (unique index). Vui lòng thử lại.
 *                 error:
 *                   type: string
 *                   example: E11000 duplicate key error
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
router.post(
  "/quick-create",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.quickCreate
);

/**
 * @swagger
 * /floors/{id}:
 *   put:
 *     summary: Cập nhật tầng
 *     description: Cập nhật thông tin tầng (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 example: Tầng 1 (Cập nhật)
 *               level:
 *                 type: integer
 *                 example: 1
 *               description:
 *                 type: string
 *                 example: Tầng 1 với 5 phòng, cập nhật thông tin
 *     responses:
 *       200:
 *         description: Tầng được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1 (Cập nhật)
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 description:
 *                   type: string
 *                   example: Tầng 1 với 5 phòng, cập nhật thông tin
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
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
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.update
);

/**
 * @swagger
 * /floors/{id}/hard-delete:
 *   delete:
 *     summary: Xóa vĩnh viễn tầng
 *     description: Xóa vĩnh viễn một tầng (chỉ admin, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Tầng được xóa vĩnh viễn thành công
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
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
 *       409:
 *         description: Có phòng liên quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hãy xóa/di chuyển Rooms trước khi xóa Floor!
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

/**
 * @swagger
 * /floors/{id}/soft:
 *   delete:
 *     summary: Xóa mềm tầng
 *     description: Xóa mềm một tầng (admin và landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Tầng được xóa mềm thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 isDeleted:
 *                   type: boolean
 *                   example: true
 *                 deletedAt:
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
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.delete(
  "/:id/soft",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FloorCtrl.softDelete
);

/**
 * @swagger
 * /floors/{id}/hard-delete:
 *   delete:
 *     summary: Xóa vĩnh viễn tầng
 *     description: Xóa vĩnh viễn một tầng (chỉ admin, yêu cầu subscription active).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Tầng được xóa vĩnh viễn thành công
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
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
 *       409:
 *         description: Có phòng liên quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hãy xóa/di chuyển Rooms trước khi xóa Floor!
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
router.delete(
  "/:id/hard-delete",
  checkAuthorize(["admin"]),
  checkSubscription,
  FloorCtrl.remove
);

/**
 * @swagger
 * /floors/{id}:
 *   delete:
 *     summary: Xóa mềm tầng
 *     description: Xóa mềm một tầng (admin và landlord sở hữu tòa nhà).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Tầng được xóa mềm thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 isDeleted:
 *                   type: boolean
 *                   example: true
 *                 deletedAt:
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
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  FloorCtrl.softDelete
);
/**
 * @swagger
 * /floors/{id}/restore:
 *   post:
 *     summary: Khôi phục tầng đã xóa
 *     description: Khôi phục một tầng đã bị xóa mềm (chỉ admin hoặc landlord sở hữu tòa nhà).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     responses:
 *       200:
 *         description: Tầng được khôi phục thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 description:
 *                   type: string
 *                   example: Tầng 1 với 5 phòng
 *                 isDeleted:
 *                   type: boolean
 *                   example: false
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
 *       403:
 *         description: Không có quyền thực hiện hành động này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.post(
  "/:id/restore",
  checkAuthorize(["admin", "landlord"]),
  FloorCtrl.restore
);
/**
 * @swagger
 * /floors/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái tầng
 *     description: Cập nhật trạng thái của một tầng (chỉ admin hoặc landlord sở hữu tòa nhà).
 *     tags: [Floor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd041
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, maintenance]
 *                 example: active
 *                 description: Trạng thái của tầng
 *     responses:
 *       200:
 *         description: Trạng thái tầng được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd041
 *                 buildingId:
 *                   type: string
 *                   example: 68e3fe79ec7f3071215fd040
 *                 label:
 *                   type: string
 *                   example: Tầng 1
 *                 level:
 *                   type: integer
 *                   example: 1
 *                 status:
 *                   type: string
 *                   example: active
 *                 description:
 *                   type: string
 *                   example: Tầng 1 với 5 phòng
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: 2025-10-07T10:50:00.000Z
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
 *         description: Không có quyền thực hiện hành động này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tầng!
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
router.patch(
  "/:id/status",
  checkAuthorize(["admin", "landlord"]),
  FloorCtrl.updateStatus
);

module.exports = router;
