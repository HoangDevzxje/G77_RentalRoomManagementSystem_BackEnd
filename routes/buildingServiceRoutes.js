const express = require("express");
const router = express.Router();
const svc = require("../controllers/BuildingServiceController");
const { checkAuthorize } = require("../middleware/authMiddleware");

/**
 * @swagger
 * components:
 *   schemas:
 *     BuildingService:
 *       type: object
 *       required:
 *         - name
 *         - buildingId
 *         - landlordId
 *       properties:
 *         _id:
 *           type: string
 *           description: ID của dịch vụ
 *           example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *         buildingId:
 *           type: string
 *           description: ID của tòa nhà
 *           example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *         landlordId:
 *           type: string
 *           description: ID của chủ nhà
 *           example: "64f1a2b3c4d5e6f7g8h9i0j3"
 *         name:
 *           type: string
 *           enum: [internet, parking, cleaning, security, other]
 *           description: Loại dịch vụ
 *           example: "internet"
 *         label:
 *           type: string
 *           description: Nhãn hiển thị đẹp
 *           example: "Internet cáp quang 150Mbps"
 *         description:
 *           type: string
 *           description: Mô tả dịch vụ
 *           example: "Dịch vụ internet tốc độ cao"
 *         chargeType:
 *           type: string
 *           enum: [perRoom, perPerson, included, fixed]
 *           default: "fixed"
 *           description: Cách tính phí
 *           example: "fixed"
 *         fee:
 *           type: number
 *           minimum: 0
 *           default: 0
 *           description: Đơn giá theo tháng (VND)
 *           example: 500000
 *         currency:
 *           type: string
 *           default: "VND"
 *           description: Đơn vị tiền tệ
 *           example: "VND"
 *         isDeleted:
 *           type: boolean
 *           default: false
 *           description: Trạng thái xóa mềm
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Thời gian xóa
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Thời gian tạo
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Thời gian cập nhật
 *     
 *     BuildingServiceCreate:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           enum: [internet, parking, cleaning, security, other]
 *           description: Loại dịch vụ
 *           example: "internet"
 *         label:
 *           type: string
 *           description: Nhãn hiển thị đẹp
 *           example: "Internet cáp quang 150Mbps"
 *         description:
 *           type: string
 *           description: Mô tả dịch vụ
 *           example: "Dịch vụ internet tốc độ cao"
 *         chargeType:
 *           type: string
 *           enum: [perRoom, perPerson, included, fixed]
 *           default: "fixed"
 *           description: Cách tính phí
 *           example: "fixed"
 *         fee:
 *           type: number
 *           minimum: 0
 *           default: 0
 *           description: Đơn giá theo tháng (VND)
 *           example: 500000
 *         currency:
 *           type: string
 *           default: "VND"
 *           description: Đơn vị tiền tệ
 *           example: "VND"
 *     
 *     BuildingServiceUpdate:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           enum: [internet, parking, cleaning, security, other]
 *           description: Loại dịch vụ
 *         label:
 *           type: string
 *           description: Nhãn hiển thị đẹp
 *         description:
 *           type: string
 *           description: Mô tả dịch vụ
 *         chargeType:
 *           type: string
 *           enum: [perRoom, perPerson, included, fixed]
 *           description: Cách tính phí
 *         fee:
 *           type: number
 *           minimum: 0
 *           description: Đơn giá theo tháng (VND)
 *         currency:
 *           type: string
 *           description: Đơn vị tiền tệ
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Thông báo lỗi
 *           example: "Không tìm thấy tòa nhà"
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Thông báo thành công
 *           example: "Đã đánh dấu xóa dịch vụ"
 */

/**
 * @swagger
 * /buildings/{buildingId}/services:
 *   get:
 *     summary: Lấy danh sách dịch vụ của tòa nhà
 *     description: Lấy danh sách tất cả dịch vụ của một tòa nhà cụ thể. Có thể bao gồm cả dịch vụ đã bị xóa mềm.
 *     tags: [Building Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *       - in: query
 *         name: includeDeleted
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Có bao gồm dịch vụ đã bị xóa mềm không
 *         example: true
 *     responses:
 *       200:
 *         description: Danh sách dịch vụ được trả về thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BuildingService'
 *             example:
 *               - _id: "64f1a2b3c4d5e6f7g8h9i0j1"
 *                 buildingId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *                 landlordId: "64f1a2b3c4d5e6f7g8h9i0j3"
 *                 name: "internet"
 *                 label: "Internet cáp quang 150Mbps"
 *                 description: "Dịch vụ internet tốc độ cao"
 *                 chargeType: "fixed"
 *                 fee: 500000
 *                 currency: "VND"
 *                 isDeleted: false
 *                 createdAt: "2023-09-01T10:00:00.000Z"
 *                 updatedAt: "2023-09-01T10:00:00.000Z"
 *       400:
 *         description: Lỗi yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy tòa nhà"
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không có quyền thao tác với tòa nhà này"
 *       404:
 *         description: Không tìm thấy tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy tòa nhà"
 *   
 *   post:
 *     summary: Tạo dịch vụ mới cho tòa nhà
 *     description: Tạo một dịch vụ mới cho tòa nhà. Chỉ admin và landlord sở hữu tòa nhà mới có quyền tạo.
 *     tags: [Building Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuildingServiceCreate'
 *           example:
 *             name: "internet"
 *             label: "Internet cáp quang 150Mbps"
 *             description: "Dịch vụ internet tốc độ cao"
 *             chargeType: "fixed"
 *             fee: 500000
 *             currency: "VND"
 *     responses:
 *       201:
 *         description: Dịch vụ được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingService'
 *             example:
 *               _id: "64f1a2b3c4d5e6f7g8h9i0j1"
 *               buildingId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               landlordId: "64f1a2b3c4d5e6f7g8h9i0j3"
 *               name: "internet"
 *               label: "Internet cáp quang 150Mbps"
 *               description: "Dịch vụ internet tốc độ cao"
 *               chargeType: "fixed"
 *               fee: 500000
 *               currency: "VND"
 *               isDeleted: false
 *               createdAt: "2023-09-01T10:00:00.000Z"
 *               updatedAt: "2023-09-01T10:00:00.000Z"
 *       400:
 *         description: Lỗi yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Validation failed"
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không có quyền thao tác với tòa nhà này"
 *       404:
 *         description: Không tìm thấy tòa nhà
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy tòa nhà"
 */

// Lấy danh sách dịch vụ của 1 tòa
router.get(
  "/:buildingId/services",
  checkAuthorize(["admin", "landlord"]),
  svc.listByBuilding
);

/**
 * @swagger
 * /buildings/{buildingId}/services/{id}:
 *   patch:
 *     summary: Cập nhật dịch vụ
 *     description: Cập nhật thông tin của một dịch vụ cụ thể. Chỉ admin và landlord sở hữu tòa nhà mới có quyền cập nhật.
 *     tags: [Building Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dịch vụ
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuildingServiceUpdate'
 *           example:
 *             label: "Internet cáp quang 200Mbps"
 *             description: "Dịch vụ internet tốc độ cao hơn"
 *             chargeType: "fixed"
 *             fee: 600000
 *             currency: "VND"
 *     responses:
 *       200:
 *         description: Dịch vụ được cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingService'
 *             example:
 *               _id: "64f1a2b3c4d5e6f7g8h9i0j1"
 *               buildingId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               landlordId: "64f1a2b3c4d5e6f7g8h9i0j3"
 *               name: "internet"
 *               label: "Internet cáp quang 200Mbps"
 *               description: "Dịch vụ internet tốc độ cao hơn"
 *               chargeType: "fixed"
 *               fee: 600000
 *               currency: "VND"
 *               isDeleted: false
 *               createdAt: "2023-09-01T10:00:00.000Z"
 *               updatedAt: "2023-09-01T11:00:00.000Z"
 *       400:
 *         description: Lỗi yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Validation failed"
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không có quyền thao tác với tòa nhà này"
 *       404:
 *         description: Không tìm thấy dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy dịch vụ hoặc đã bị xóa"
 *   
 *   delete:
 *     summary: Xóa mềm dịch vụ
 *     description: Đánh dấu xóa mềm một dịch vụ. Dịch vụ sẽ không bị xóa vĩnh viễn mà chỉ được đánh dấu là đã xóa. Chỉ admin và landlord sở hữu tòa nhà mới có quyền xóa.
 *     tags: [Building Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dịch vụ
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Dịch vụ được đánh dấu xóa thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               message: "Đã đánh dấu xóa dịch vụ"
 *       400:
 *         description: Lỗi yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Validation failed"
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không có quyền thao tác với tòa nhà này"
 *       404:
 *         description: Không tìm thấy dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy dịch vụ hoặc đã bị xóa"
 */

/**
 * @swagger
 * /buildings/{buildingId}/services/{id}/restore:
 *   post:
 *     summary: Khôi phục dịch vụ đã xóa
 *     description: Khôi phục một dịch vụ đã bị xóa mềm. Chỉ admin và landlord sở hữu tòa nhà mới có quyền khôi phục.
 *     tags: [Building Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: "64f1a2b3c4d5e6f7g8h9i0j2"
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của dịch vụ
 *         example: "64f1a2b3c4d5e6f7g8h9i0j1"
 *     responses:
 *       200:
 *         description: Dịch vụ được khôi phục thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BuildingService'
 *             example:
 *               _id: "64f1a2b3c4d5e6f7g8h9i0j1"
 *               buildingId: "64f1a2b3c4d5e6f7g8h9i0j2"
 *               landlordId: "64f1a2b3c4d5e6f7g8h9i0j3"
 *               name: "internet"
 *               label: "Internet cáp quang 150Mbps"
 *               description: "Dịch vụ internet tốc độ cao"
 *               chargeType: "fixed"
 *               fee: 500000
 *               currency: "VND"
 *               isDeleted: false
 *               deletedAt: null
 *               createdAt: "2023-09-01T10:00:00.000Z"
 *               updatedAt: "2023-09-01T12:00:00.000Z"
 *       400:
 *         description: Lỗi yêu cầu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Validation failed"
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không có quyền thao tác với tòa nhà này"
 *       404:
 *         description: Không tìm thấy bản ghi đã xóa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: "Không tìm thấy bản ghi đã xóa"
 */

// Tạo dịch vụ mới
router.post(
  "/:buildingId/services",
  checkAuthorize(["admin", "landlord"]),
  svc.create
);

// Cập nhật dịch vụ
router.patch(
  "/:buildingId/services/:id",
  checkAuthorize(["admin", "landlord"]),
  svc.update
);

// Xóa mềm dịch vụ
router.delete(
  "/:buildingId/services/:id",
  checkAuthorize(["admin", "landlord"]),
  svc.remove
);

// Khôi phục dịch vụ đã xóa
router.post(
  "/:buildingId/services/:id/restore",
  checkAuthorize(["admin", "landlord"]),
  svc.restore
);

/**
 * @swagger
 * tags:
 *   - name: Building Services
 *     description: Quản lý dịch vụ của tòa nhà
 */

module.exports = router;
