const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const RoomCtrl = require("../../controllers/Landlord/RoomController");
const checkSubscription = require("../../middleware/checkSubscription");
const checkBuildingActive = require("../../middleware/checkBuildingActive");
const { uploadMultiple, uploadSingle } = require("../../configs/cloudinary");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
/**
 * @swagger
 * tags:
 *   name: Landlord Room Management
 *   description: API quản lý phòng
 */

/**
 * @swagger
 * /landlords/rooms:
 *   get:
 *     summary: Lấy danh sách phòng
 *     description: Lấy danh sách phòng với hỗ trợ phân trang và lọc theo buildingId, floorId, status, hoặc tìm kiếm theo roomNumber. Landlord chỉ thấy phòng trong tòa nhà của mình.
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *           enum: [available, rented, maintenance]
 *         description: Trạng thái phòng (available - có sẵn, rented - đã thuê, maintenance - bảo trì)
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
 *       - in: query
 *         name: includeDeleted
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *         description: Bao gồm cả phòng đã xóa mềm (true/false)
 *         example: false
 *       - in: query
 *         name: onlyActive
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *         description: Chỉ lấy phòng đang hoạt động (true/false)
 *         example: false
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
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd040
 *                           name:
 *                             type: string
 *                             example: Tòa nhà A
 *                           address:
 *                             type: string
 *                             example: 123 Đường ABC
 *                           description:
 *                             type: string
 *                             example: Tòa nhà cao cấp
 *                           ePrice:
 *                             type: number
 *                             example: 3000
 *                           wPrice:
 *                             type: number
 *                             example: 15000
 *                       floorId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 68e3fe79ec7f3071215fd041
 *                           floorNumber:
 *                             type: integer
 *                             example: 1
 *                           label:
 *                             type: string
 *                             example: Tầng 1
 *                       roomNumber:
 *                         type: string
 *                         example: "101"
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
 *                         enum: [available, rented, maintenance]
 *                         example: available
 *                       description:
 *                         type: string
 *                         example: Phòng 1 phòng ngủ, có ban công
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["https://res.cloudinary.com/.../room1.jpg"]
 *                       active:
 *                         type: boolean
 *                         example: true
 *                       isDeleted:
 *                         type: boolean
 *                         example: false
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
router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_VIEW, { checkBuilding: true }),
  RoomCtrl.list
);

/**
 * @swagger
 * /landlords/rooms/{id}:
 *   get:
 *     summary: Lấy chi tiết phòng
 *     description: Lấy thông tin chi tiết của một phòng theo ID (admin, landlord, resident). Landlord chỉ thấy phòng trong tòa nhà của mình.
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *                       example: 123 Đường ABC
 *                     description:
 *                       type: string
 *                       example: Tòa nhà cao cấp
 *                     ePrice:
 *                       type: number
 *                       example: 3000
 *                     wPrice:
 *                       type: number
 *                       example: 15000
 *                     eIndexType:
 *                       type: string
 *                       example: direct
 *                     wIndexType:
 *                       type: string
 *                       example: direct
 *                 floorId:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 68e3fe79ec7f3071215fd041
 *                     floorNumber:
 *                       type: integer
 *                       example: 1
 *                     label:
 *                       type: string
 *                       example: Tầng 1
 *                 roomNumber:
 *                   type: string
 *                   example: "101"
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
 *                   enum: [available, rented, maintenance]
 *                   example: available
 *                 description:
 *                   type: string
 *                   example: Phòng 1 phòng ngủ, có ban công
 *                 images:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://res.cloudinary.com/.../room1.jpg"]
 *                 active:
 *                   type: boolean
 *                   example: true
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
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền
 *       404:
 *         description: Không tìm thấy phòng hoặc tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tòa nhà không tồn tại
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
  checkAuthorize(["admin", "landlord", "resident", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_VIEW,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }
  ),
  RoomCtrl.getById
);

/**
 * @swagger
 * /landlords/rooms:
 *   post:
 *     summary: Tạo phòng mới
 *     description: Tạo một phòng mới trong tòa nhà và tầng được chỉ định (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active). Hỗ trợ upload ảnh kèm theo.
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: string
 *                 description: JSON string chứa thông tin phòng
 *                 example: '{"buildingId":"68e3fe79ec7f3071215fd040","floorId":"68e3fe79ec7f3071215fd041","roomNumber":"101","area":25.5,"price":3000000,"maxTenants":4,"status":"available","description":"Phòng 1 phòng ngủ, có ban công"}'
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Danh sách ảnh phòng (tùy chọn)
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
 *                   example: "101"
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
 *                   enum: [available, rented, maintenance]
 *                   example: available
 *                 description:
 *                   type: string
 *                   example: Phòng 1 phòng ngủ, có ban công
 *                 images:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://res.cloudinary.com/.../room1.jpg"]
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
 *                   example: price phải là số >= 0
 *       403:
 *         description: Không có quyền hoặc tòa/tầng tạm dừng hoạt động
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tòa nhà đang tạm dừng hoạt động
 *       404:
 *         description: Không tìm thấy tòa nhà hoặc tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa nhà
 *       409:
 *         description: Trùng số phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trùng số phòng trong tòa (unique {buildingId, roomNumber})
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
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_CREATE),
  uploadMultiple,
  checkSubscription,
  RoomCtrl.create
);

// Thêm ảnh cho phòng (upload thêm)
router.post(
  "/:id/images",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkBuildingActive,
  uploadMultiple,
  RoomCtrl.addImages
);
// Xóa ảnh (truyền danh sách URL muốn xóa)
router.delete("/:id/images", RoomCtrl.removeImages);
router.post(
  "/quick-create",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_CREATE, { checkBuilding: true }),
  checkSubscription,
  checkBuildingActive,
  RoomCtrl.quickCreate
);

/**
 * @swagger
 * /landlords/rooms/{id}:
 *   put:
 *     summary: Cập nhật thông tin phòng
 *     description: Cập nhật thông tin của một phòng (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *                 example: "102"
 *               area:
 *                 type: number
 *                 example: 30
 *               price:
 *                 type: number
 *                 example: 3500000
 *               maxTenants:
 *                 type: integer
 *                 example: 5
 *               status:
 *                 type: string
 *                 enum: [available, rented, maintenance]
 *                 example: rented
 *               description:
 *                 type: string
 *                 example: Phòng 2 phòng ngủ, có ban công rộng
 *     responses:
 *       200:
 *         description: Phòng được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cập nhật phòng thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: price phải là số >= 0
 *       403:
 *         description: Không có quyền
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng
 *       409:
 *         description: Trùng số phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trùng số phòng trong tòa
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
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_EDIT,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }
  ),
  uploadMultiple,
  checkSubscription,
  RoomCtrl.update
);

/**
 * @swagger
 * /landlords/rooms/{id}:
 *   delete:
 *     summary: Xóa vĩnh viễn phòng
 *     description: Xóa hoàn toàn một phòng khỏi hệ thống (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *                 message:
 *                   type: string
 *                   example: Xóa phòng thành công
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
 *         description: Không có quyền hoặc phòng đang được thuê
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không thể xóa phòng đang được thuê
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
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_DELETE,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }),
  checkSubscription,
  RoomCtrl.remove
);

/**
 * @swagger
 * /landlords/rooms/{id}/images:
 *   post:
 *     summary: Thêm ảnh cho phòng
 *     description: Thêm một hoặc nhiều ảnh vào phòng (chỉ admin hoặc landlord sở hữu tòa nhà).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Danh sách ảnh cần thêm
 *     responses:
 *       200:
 *         description: Thêm ảnh thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã thêm ảnh
 *                 images:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://res.cloudinary.com/.../room1.jpg", "https://res.cloudinary.com/.../room2.jpg"]
 *       400:
 *         description: Không có ảnh để thêm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có ảnh để thêm
 *       403:
 *         description: Không có quyền
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng
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
  "/:id/images",
  checkAuthorize(["admin", "landlord", "staff"]),
  uploadMultiple,
  RoomCtrl.addImages
);

/**
 * @swagger
 * /landlords/rooms/{id}/images:
 *   delete:
 *     summary: Xóa ảnh của phòng
 *     description: Xóa một hoặc nhiều ảnh khỏi phòng (chỉ admin hoặc landlord sở hữu tòa nhà). Ảnh sẽ bị xóa khỏi Cloudinary và database.
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách URL ảnh cần xóa
 *                 example: ["https://res.cloudinary.com/.../room1.jpg"]
 *     responses:
 *       200:
 *         description: Xóa ảnh thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xóa ảnh
 *                 images:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://res.cloudinary.com/.../room2.jpg"]
 *                 deleted:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cần truyền mảng 'urls' để xóa
 *       403:
 *         description: Không có quyền
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng
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
  "/:id/images",
  checkAuthorize(["admin", "landlord", "staff"]),
  RoomCtrl.removeImages
);

/**
 * @swagger
 * /landlords/rooms/quick-create:
 *   post:
 *     summary: Tạo nhanh nhiều phòng
 *     description: Tạo nhiều phòng cùng lúc theo template số phòng (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active). Hỗ trợ tạo phòng cho một hoặc nhiều tầng với quy tắc đánh số tự động.
 *     tags: [Landlord Room Management]
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
 *                 description: ID tòa nhà
 *                 example: "68e3fe79ec7f3071215fd040"
 *               floorId:
 *                 type: string
 *                 description: ID tầng (dùng khi tạo cho 1 tầng duy nhất)
 *                 example: "68e3fe79ec7f3071215fd041"
 *               floorIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID các tầng (dùng khi tạo cho nhiều tầng)
 *                 example: ["68e3fe79ec7f3071215fd041", "68e3fe79ec7f3071215fd042"]
 *               perFloor:
 *                 type: integer
 *                 default: 1
 *                 description: Số phòng tạo trên mỗi tầng
 *                 example: 10
 *               seqStart:
 *                 type: integer
 *                 default: 1
 *                 description: Số thứ tự bắt đầu
 *                 example: 1
 *               roomNumberTemplate:
 *                 type: string
 *                 default: "{floor}{seq:02}"
 *                 description: Template đánh số phòng. Có thể dùng {floor}, {seq}, {block}. Format số với :0X (ví dụ {seq:02} = 01, 02...)
 *                 example: "{floor}{seq:02}"
 *               templateVars:
 *                 type: object
 *                 properties:
 *                   block:
 *                     type: string
 *                     description: Ký tự block (nếu cần)
 *                     example: "A"
 *                 description: Các biến bổ sung cho template
 *               defaults:
 *                 type: object
 *                 properties:
 *                   price:
 *                     type: number
 *                     example: 3000000
 *                   area:
 *                     type: number
 *                     example: 25
 *                   maxTenants:
 *                     type: integer
 *                     example: 4
 *                   status:
 *                     type: string
 *                     enum: [available, rented, maintenance]
 *                     example: available
 *                   description:
 *                     type: string
 *                     example: Phòng tiêu chuẩn
 *                 description: Các giá trị mặc định cho phòng
 *               skipExisting:
 *                 type: boolean
 *                 default: true
 *                 description: Bỏ qua các roomNumber đã tồn tại (true) hoặc báo lỗi (false)
 *                 example: true
 *     responses:
 *       201:
 *         description: Tạo nhanh phòng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tạo nhanh phòng thành công.
 *                 createdCount:
 *                   type: integer
 *                   example: 30
 *                 skippedCount:
 *                   type: integer
 *                   example: 2
 *                 skippedRoomNumbers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["101", "102"]
 *                 created:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       buildingId:
 *                         type: string
 *                       floorId:
 *                         type: string
 *                       roomNumber:
 *                         type: string
 *                       area:
 *                         type: number
 *                       price:
 *                         type: number
 *                       maxTenants:
 *                         type: integer
 *                       status:
 *                         type: string
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: buildingId là bắt buộc
 *       403:
 *         description: Không có quyền hoặc tòa/tầng tạm dừng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tòa đang tạm dừng hoạt động
 *       404:
 *         description: Không tìm thấy tòa hoặc tầng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa
 *       409:
 *         description: Tất cả roomNumber đã tồn tại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tất cả roomNumber yêu cầu đã tồn tại, không có phòng nào được tạo.
 *                 createdCount:
 *                   type: integer
 *                   example: 0
 *                 skippedCount:
 *                   type: integer
 *                   example: 10
 *                 skippedRoomNumbers:
 *                   type: array
 *                   items:
 *                     type: string
 *                 created:
 *                   type: array
 *                   items:
 *                     type: object
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
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_CREATE, { checkBuilding: true }),
  checkSubscription,
  checkBuildingActive,
  RoomCtrl.quickCreate
);

/**
 * @swagger
 * /landlords/rooms/{id}/soft:
 *   delete:
 *     summary: Xóa mềm phòng
 *     description: Đánh dấu phòng là đã xóa (soft delete) thay vì xóa vĩnh viễn (chỉ admin hoặc landlord sở hữu tòa nhà, yêu cầu subscription active).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd042
 *     responses:
 *       200:
 *         description: Xóa mềm phòng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xóa mềm phòng
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
 *         description: Không có quyền hoặc tòa tạm dừng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tòa nhà đang tạm dừng hoạt động
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
router.delete(
  "/:id/soft",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_DELETE,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }
  ),
  checkSubscription,
  RoomCtrl.softDelete
);

/**
 * @swagger
 * /landlords/rooms/{id}/restore:
 *   post:
 *     summary: Khôi phục phòng đã xóa
 *     description: Khôi phục một phòng đã bị xóa mềm (chỉ admin hoặc landlord sở hữu tòa nhà).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68e3fe79ec7f3071215fd042
 *     responses:
 *       200:
 *         description: Phòng được khôi phục thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã khôi phục phòng
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
 *         description: Không có quyền hoặc tòa tạm dừng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tòa nhà đang tạm dừng hoạt động
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
router.post(
  "/:id/restore",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_EDIT,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }
  ),
  checkSubscription,
  RoomCtrl.restore
);

/**
 * @swagger
 * /landlords/rooms/{id}/active:
 *   patch:
 *     summary: Cập nhật trạng thái hoạt động phòng
 *     description: Cập nhật trạng thái hoạt động của một phòng (chỉ admin hoặc landlord sở hữu tòa nhà).
 *     tags: [Landlord Room Management]
 *     security:
 *       - bearerAuth: []
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
 *             required:
 *               - active
 *             properties:
 *               active:
 *                 type: boolean
 *                 example: true
 *                 description: Trạng thái hoạt động của phòng (true = hoạt động, false = tạm dừng)
 *     responses:
 *       200:
 *         description: Trạng thái hoạt động phòng được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cập nhật trạng thái hoạt động của phòng thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Giá trị active phải là boolean
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
 *                   example: Không có quyền
 *       404:
 *         description: Không tìm thấy phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy phòng
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
  "/:id/active",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.ROOM_EDIT,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Room"
    }
  ),
  checkSubscription,
  RoomCtrl.updateActive
);

module.exports = router;