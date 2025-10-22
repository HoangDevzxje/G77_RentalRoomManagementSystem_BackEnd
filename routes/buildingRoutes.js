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
router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident"]),
  BuildingCtrl.list
);

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
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord", "resident"]),
  BuildingCtrl.getById
);

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
router.post(
  "/",
  checkAuthorize(["landlord"]),
  checkSubscription,
  BuildingCtrl.create
);

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
router.put(
  "/:id",
  checkAuthorize(["landlord"]),
  checkSubscription,
  BuildingCtrl.update
);

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
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  BuildingCtrl.softDelete
);
router.post(
  "/:id/restore",
  checkAuthorize(["admin", "landlord"]),
  BuildingCtrl.restore
);
router.patch(
  "/:id/status",
  checkAuthorize(["admin", "landlord"]),
  BuildingCtrl.updateStatus
);
router.delete(
  "/:id",
  checkAuthorize(["admin"]),
  checkSubscription,
  BuildingCtrl.remove
);
/**
 * @swagger
 * /buildings/quick-setup:
 *   post:
 *     summary: Thiết lập nhanh tòa nhà
 *     description: Tạo tòa nhà với cấu hình mặc định và thiết lập sẵn các tầng, phòng cơ bản (admin, landlord, yêu cầu subscription active). Hỗ trợ dry-run để xem trước kết quả.
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
 *               - floors
 *               - rooms
 *             properties:
 *               name:
 *                 type: string
 *                 example: Tòa nhà A
 *                 description: Tên tòa nhà
 *               address:
 *                 type: string
 *                 example: 123 Đường Láng, Hà Nội
 *                 description: Địa chỉ tòa nhà
 *               landlordId:
 *                 type: string
 *                 example: 68d7dad6cadcf51ed611e121
 *                 description: ID của landlord (chỉ admin mới có thể chỉ định)
 *               floors:
 *                 type: object
 *                 required:
 *                   - count
 *                   - startLevel
 *                 properties:
 *                   count:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 20
 *                     example: 5
 *                     description: Số tầng cần tạo
 *                   startLevel:
 *                     type: integer
 *                     example: 1
 *                     description: Tầng bắt đầu (1 = tầng trệt, 2 = tầng 1, ...)
 *                   description:
 *                     type: string
 *                     example: Tầng dành cho sinh viên
 *                     description: Mô tả chung cho các tầng
 *               rooms:
 *                 type: object
 *                 required:
 *                   - perFloor
 *                 properties:
 *                   perFloor:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 50
 *                     example: 10
 *                     description: Số phòng mỗi tầng
 *                   seqStart:
 *                     type: integer
 *                     default: 1
 *                     example: 1
 *                     description: Số thứ tự bắt đầu cho phòng
 *                   roomNumberTemplate:
 *                     type: string
 *                     default: "{floor}{seq:02}"
 *                     example: "{floor}{seq:02}"
 *                     description: Template tạo số phòng (hỗ trợ {floor}, {seq}, {block})
 *                   defaults:
 *                     type: object
 *                     properties:
 *                       area:
 *                         type: number
 *                         example: 25.5
 *                         description: Diện tích mặc định (m²)
 *                       price:
 *                         type: number
 *                         example: 2000000
 *                         description: Giá thuê mặc định (VND)
 *                       maxTenants:
 *                         type: integer
 *                         default: 1
 *                         example: 2
 *                         description: Số người tối đa
 *                       status:
 *                         type: string
 *                         enum: [available, occupied, maintenance]
 *                         default: available
 *                         example: available
 *                         description: Trạng thái phòng
 *                       description:
 *                         type: string
 *                         example: Phòng cho sinh viên
 *                         description: Mô tả phòng
 *                   templateVars:
 *                     type: object
 *                     properties:
 *                       block:
 *                         type: string
 *                         example: A
 *                         description: Ký hiệu block (dùng trong template)
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *                 description: Chế độ xem trước (không tạo dữ liệu thực)
 *     responses:
 *       200:
 *         description: Xem trước kết quả (dry-run mode)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dryRun:
 *                   type: boolean
 *                   example: true
 *                 preview:
 *                   type: object
 *                   properties:
 *                     building:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: 68e3fe79ec7f3071215fd040
 *                         name:
 *                           type: string
 *                           example: Tòa nhà A
 *                         address:
 *                           type: string
 *                           example: 123 Đường Láng, Hà Nội
 *                         landlordId:
 *                           type: string
 *                           example: 68d7dad6cadcf51ed611e121
 *                     floors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd041
 *                           buildingId:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd040
 *                           level:
 *                             type: integer
 *                             example: 1
 *                           description:
 *                             type: string
 *                             example: Tầng dành cho sinh viên
 *                     rooms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd042
 *                           buildingId:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd040
 *                           floorId:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd041
 *                           roomNumber:
 *                             type: string
 *                             example: 101
 *                           area:
 *                             type: number
 *                             example: 25.5
 *                           price:
 *                             type: number
 *                             example: 2000000
 *                           maxTenants:
 *                             type: integer
 *                             example: 2
 *                           status:
 *                             type: string
 *                             example: available
 *                           description:
 *                             type: string
 *                             example: Phòng cho sinh viên
 *       201:
 *         description: Tòa nhà được tạo thành công với cấu hình mặc định
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tạo tòa + tầng + phòng thành công
 *                 building:
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
 *                     landlordId:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:50:00.000Z
 *                 floors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd041
 *                       buildingId:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd040
 *                       level:
 *                         type: integer
 *                         example: 1
 *                       description:
 *                         type: string
 *                         example: Tầng dành cho sinh viên
 *                 rooms:
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
 *                         example: 2000000
 *                       maxTenants:
 *                         type: integer
 *                         example: 2
 *                       status:
 *                         type: string
 *                         example: available
 *                       description:
 *                         type: string
 *                         example: Phòng cho sinh viên
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
 *       409:
 *         description: Trùng dữ liệu (unique index)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trùng dữ liệu (unique index). Vui lòng kiểm tra.
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
  "/quick-setup",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingCtrl.quickSetup
);

module.exports = router;
