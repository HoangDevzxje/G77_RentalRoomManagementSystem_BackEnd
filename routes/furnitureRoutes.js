const router = require("express").Router();
const FurnitureCtrl = require("../controllers/FurnitureController");
const BuildingFurnitureCtrl = require("../controllers/BuildingFurnitureController");
const RoomFurnitureCtrl = require("../controllers/RoomFurnitureController");
const { checkAuthorize } = require("../middleware/authMiddleware");
const checkSubscription = require("../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Furniture
 *     description: Quản lý danh mục nội thất (Furniture master data)
 *   - name: Building Furniture
 *     description: Quản lý cấu hình nội thất theo tòa nhà
 *   - name: Room Furniture
 *     description: Quản lý nội thất theo từng phòng
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Furniture:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: ID của nội thất
 *         name:
 *           type: string
 *           description: Tên nội thất
 *         category:
 *           type: string
 *           description: Loại nội thất
 *         price:
 *           type: number
 *           description: Giá của nội thất
 *         warrantyMonths:
 *           type: number
 *           description: Số tháng bảo hành
 *         description:
 *           type: string
 *           description: Mô tả chi tiết
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *           description: Trạng thái
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     BuildingFurniture:
 *       type: object
 *       required:
 *         - buildingId
 *         - furnitureId
 *       properties:
 *         _id:
 *           type: string
 *           description: ID của bản ghi
 *         buildingId:
 *           type: string
 *           description: ID của tòa nhà
 *         furnitureId:
 *           type: string
 *           description: ID của nội thất
 *         quantityPerRoom:
 *           type: number
 *           default: 1
 *           description: Số lượng áp cho mỗi phòng
 *         totalQuantity:
 *           type: number
 *           default: 0
 *           description: Số lượng tổng trong tòa
 *         status:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *         notes:
 *           type: string
 *           description: Ghi chú
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     RoomFurniture:
 *       type: object
 *       required:
 *         - roomId
 *         - furnitureId
 *       properties:
 *         _id:
 *           type: string
 *           description: ID của bản ghi
 *         roomId:
 *           type: string
 *           description: ID của phòng
 *         furnitureId:
 *           type: string
 *           description: ID của nội thất
 *         quantity:
 *           type: number
 *           default: 1
 *           description: Số lượng
 *         condition:
 *           type: string
 *           enum: [good, damaged, under_repair]
 *           default: good
 *           description: Tình trạng nội thất
 *         notes:
 *           type: string
 *           description: Ghi chú
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 */

// ============== FURNITURE (Danh mục nội thất) ==============

/**
 * @swagger
 * /furnitures:
 *   post:
 *     tags: [Furniture]
 *     summary: Tạo mới nội thất
 *     description: Tạo một loại nội thất mới trong hệ thống
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
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Giường ngủ"
 *               category:
 *                 type: string
 *                 example: "Phòng ngủ"
 *               price:
 *                 type: number
 *                 example: 5000000
 *               warrantyMonths:
 *                 type: number
 *                 example: 24
 *               description:
 *                 type: string
 *                 example: "Giường gỗ tự nhiên cao cấp"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Furniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.post(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.create
);

/**
 * @swagger
 * /furnitures:
 *   get:
 *     tags: [Furniture]
 *     summary: Lấy danh sách tất cả nội thất
 *     description: Lấy danh sách tất cả các loại nội thất trong hệ thống
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Furniture'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get(
  "/",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.getAll
);

// ============== BUILDING FURNITURE (Cấu hình nội thất theo tòa) ==============

/**
 * @swagger
 * /furnitures/building:
 *   post:
 *     tags: [Building Furniture]
 *     summary: Thêm nội thất vào tòa nhà
 *     description: Thêm một loại nội thất vào cấu hình của tòa nhà
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
 *               - furnitureId
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *               furnitureId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439012"
 *               quantityPerRoom:
 *                 type: number
 *                 default: 1
 *                 example: 2
 *               totalQuantity:
 *                 type: number
 *                 default: 0
 *                 example: 50
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *               notes:
 *                 type: string
 *                 example: "Áp dụng cho tất cả phòng"
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingFurniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.post(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.create
);

/**
 * @swagger
 * /furnitures/building/bulk:
 *   post:
 *     tags: [Building Furniture]
 *     summary: Thêm nhiều nội thất vào tòa nhà cùng lúc
 *     description: Thêm nhiều loại nội thất vào cấu hình của tòa nhà với các chế độ tạo mới hoặc cập nhật
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
 *               - items
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - furnitureId
 *                   properties:
 *                     furnitureId:
 *                       type: string
 *                       example: "507f1f77bcf86cd799439012"
 *                     quantityPerRoom:
 *                       type: number
 *                       default: 1
 *                     totalQuantity:
 *                       type: number
 *                       default: 0
 *                     status:
 *                       type: string
 *                       enum: [active, inactive]
 *                       default: active
 *                     notes:
 *                       type: string
 *               mode:
 *                 type: string
 *                 enum: [create, upsert]
 *                 default: create
 *                 description: create = chỉ tạo mới (bỏ qua nếu đã tồn tại), upsert = tạo mới hoặc cập nhật
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *                 description: true = chỉ xem trước, không thực thi
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mode:
 *                   type: string
 *                 createdCount:
 *                   type: number
 *                 updatedCount:
 *                   type: number
 *                 skippedExistingCount:
 *                   type: number
 *                 invalidFurnitureIds:
 *                   type: array
 *                   items:
 *                     type: string
 *                 duplicateInPayload:
 *                   type: array
 *                   items:
 *                     type: string
 *                 created:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BuildingFurniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy tòa nhà
 *       409:
 *         description: Trùng lặp dữ liệu (duplicate key)
 */
router.post(
  "/building/bulk",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.bulkCreate
);

/**
 * @swagger
 * /furnitures/building:
 *   get:
 *     tags: [Building Furniture]
 *     summary: Lấy danh sách nội thất của tòa nhà
 *     description: Lấy danh sách cấu hình nội thất theo tòa nhà
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: ID của tòa nhà (không bắt buộc, nếu không có sẽ lấy tất cả)
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BuildingFurniture'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get(
  "/building",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.getAll
);

/**
 * @swagger
 * /furnitures/building/{id}:
 *   get:
 *     tags: [Building Furniture]
 *     summary: Lấy chi tiết một cấu hình nội thất tòa nhà
 *     description: Lấy thông tin chi tiết của một cấu hình nội thất trong tòa nhà
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình nội thất tòa nhà
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingFurniture'
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.get(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.getOne
);

/**
 * @swagger
 * /furnitures/building/{id}:
 *   put:
 *     tags: [Building Furniture]
 *     summary: Cập nhật cấu hình nội thất tòa nhà
 *     description: Cập nhật thông tin cấu hình nội thất của tòa nhà
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình nội thất tòa nhà
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantityPerRoom:
 *                 type: number
 *               totalQuantity:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingFurniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.put(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.update
);

/**
 * @swagger
 * /furnitures/building/{id}:
 *   delete:
 *     tags: [Building Furniture]
 *     summary: Xóa cấu hình nội thất tòa nhà
 *     description: Xóa một cấu hình nội thất khỏi tòa nhà
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của cấu hình nội thất tòa nhà
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã xóa thành công"
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.delete(
  "/building/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.remove
);

/**
 * @swagger
 * /furnitures/{buildingId}/apply-to-rooms:
 *   post:
 *     tags: [Building Furniture]
 *     summary: Áp dụng cấu hình nội thất tòa nhà cho các phòng
 *     description: Áp dụng cấu hình nội thất của tòa nhà vào các phòng cụ thể hoặc tất cả phòng trong tòa
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               furnitureIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID nội thất (không bắt buộc, nếu bỏ trống sẽ lấy tất cả nội thất ACTIVE của tòa)
 *               roomIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID phòng (không bắt buộc, nếu bỏ trống sẽ áp cho tất cả phòng)
 *               floorIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID tầng để lọc phòng (không bắt buộc)
 *               mode:
 *                 type: string
 *                 enum: [set, increment]
 *                 default: set
 *                 description: set = ghi đè số lượng, increment = cộng dồn số lượng
 *               overrideQty:
 *                 type: number
 *                 description: Số lượng ghi đè (nếu có sẽ dùng thay vì quantityPerRoom trong BuildingFurniture)
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *                 description: true = chỉ xem trước, không thực thi
 *     responses:
 *       200:
 *         description: Áp dụng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 mode:
 *                   type: string
 *                 overrideQty:
 *                   type: number
 *                 matched:
 *                   type: number
 *                 modified:
 *                   type: number
 *                 upserted:
 *                   type: number
 *                 totalOps:
 *                   type: number
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.post(
  "/:buildingId/apply-to-rooms",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  BuildingFurnitureCtrl.applyToRooms
);

// ============== ROOM FURNITURE (Nội thất theo phòng) ==============

/**
 * @swagger
 * /furnitures/room:
 *   post:
 *     tags: [Room Furniture]
 *     summary: Thêm nội thất vào phòng
 *     description: Thêm một loại nội thất vào phòng cụ thể
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - furnitureId
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439013"
 *               furnitureId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439012"
 *               quantity:
 *                 type: number
 *                 default: 1
 *                 example: 2
 *               condition:
 *                 type: string
 *                 enum: [good, damaged, under_repair]
 *                 default: good
 *               notes:
 *                 type: string
 *                 example: "Đã kiểm tra và hoạt động tốt"
 *     responses:
 *       201:
 *         description: Tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomFurniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.post(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.create
);

/**
 * @swagger
 * /furnitures/room:
 *   get:
 *     tags: [Room Furniture]
 *     summary: Lấy danh sách nội thất của phòng
 *     description: Lấy danh sách nội thất theo phòng
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *         description: ID của phòng (không bắt buộc, nếu không có sẽ lấy tất cả)
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RoomFurniture'
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get(
  "/room",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.getAll
);

/**
 * @swagger
 * /furnitures/room/{id}:
 *   get:
 *     tags: [Room Furniture]
 *     summary: Lấy chi tiết một nội thất trong phòng
 *     description: Lấy thông tin chi tiết của một nội thất trong phòng
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất phòng
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomFurniture'
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.get(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.getOne
);

/**
 * @swagger
 * /furnitures/room/{id}:
 *   put:
 *     tags: [Room Furniture]
 *     summary: Cập nhật nội thất trong phòng
 *     description: Cập nhật thông tin nội thất của phòng
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất phòng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *               condition:
 *                 type: string
 *                 enum: [good, damaged, under_repair]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomFurniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.put(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.update
);

/**
 * @swagger
 * /furnitures/room/{id}:
 *   delete:
 *     tags: [Room Furniture]
 *     summary: Xóa nội thất khỏi phòng
 *     description: Xóa một nội thất khỏi phòng
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất phòng
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã xóa thành công"
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.delete(
  "/room/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  RoomFurnitureCtrl.remove
);

// ============== FURNITURE BY ID (Chi tiết/Cập nhật/Xóa nội thất) ==============

/**
 * @swagger
 * /furnitures/{id}:
 *   get:
 *     tags: [Furniture]
 *     summary: Lấy chi tiết một nội thất
 *     description: Lấy thông tin chi tiết của một loại nội thất
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Furniture'
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.get(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.getOne
);

/**
 * @swagger
 * /furnitures/{id}:
 *   put:
 *     tags: [Furniture]
 *     summary: Cập nhật thông tin nội thất
 *     description: Cập nhật thông tin của một loại nội thất
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               price:
 *                 type: number
 *               warrantyMonths:
 *                 type: number
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Furniture'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy
 */
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.update
);

/**
 * @swagger
 * /furnitures/{id}:
 *   delete:
 *     tags: [Furniture]
 *     summary: Xóa nội thất
 *     description: Xóa một loại nội thất khỏi hệ thống
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nội thất
 *     responses:
 *       200:
 *         description: Xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã xóa thành công"
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa xác thực
 *       403:
 *         description: Không có quyền truy cập
 */
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord"]),
  checkSubscription,
  FurnitureCtrl.remove
);

module.exports = router;
