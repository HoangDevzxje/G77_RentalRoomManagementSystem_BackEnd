const express = require("express");
const router = express.Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const RegulationCtrl = require("../../controllers/Landlord/RegulationController");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");

/**
 * @swagger
 * tags:
 *   name: Landlord Regulation Management
 *   description: API quản lý quy định tòa nhà
 */

/**
 * @swagger
 * /landlords/regulations:
 *   get:
 *     summary: Lấy danh sách quy định
 *     description: Lấy danh sách quy định của tòa nhà (admin, landlord, tenant đều có thể xem)
 *     tags: [Landlord Regulation Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *         example: 68d7dad6cadcf51ed611e123
 *     responses:
 *       200:
 *         description: Danh sách quy định
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: 68d7dad6cadcf51ed611e124
 *                   buildingId:
 *                     type: string
 *                     example: 68d7dad6cadcf51ed611e123
 *                   title:
 *                     type: string
 *                     example: Giờ ra vào tòa nhà
 *                   description:
 *                     type: string
 *                     example: Tòa nhà mở cửa từ 6:00 - 22:00 hàng ngày
 *                   type:
 *                     type: string
 *                     enum: [entry_exit, pet_policy, common_area, other]
 *                     example: entry_exit
 *                   status:
 *                     type: string
 *                     enum: [active, inactive]
 *                     example: active
 *                   effectiveFrom:
 *                     type: string
 *                     format: date-time
 *                     example: 2024-01-01T00:00:00.000Z
 *                   effectiveTo:
 *                     type: string
 *                     format: date-time
 *                     example: 2024-12-31T23:59:59.000Z
 *                   createdBy:
 *                     type: string
 *                     example: 68d7dad6cadcf51ed611e121
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     example: 2024-01-15T10:30:00.000Z
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *                     example: 2024-01-15T10:30:00.000Z
 *       400:
 *         description: Thiếu buildingId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thiếu buildingId
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
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi server
 */
// Tenant & Landlord đều xem được
router.get(
  "/",
  checkAuthorize(["admin", "landlord", "resident", "staff"]),
  checkStaffPermission(PERMISSIONS.REGULATION_VIEW, { checkBuilding: true }),
  RegulationCtrl.getList
);

/**
 * @swagger
 * /landlords/regulations:
 *   post:
 *     summary: Tạo quy định mới
 *     description: Tạo quy định mới cho tòa nhà (chỉ admin và landlord)
 *     tags: [Landlord Regulation Management]
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
 *               - title
 *               - description
 *             properties:
 *               buildingId:
 *                 type: string
 *                 description: ID của tòa nhà
 *                 example: 68d7dad6cadcf51ed611e123
 *               title:
 *                 type: string
 *                 description: Tiêu đề quy định
 *                 example: Giờ ra vào tòa nhà
 *               description:
 *                 type: string
 *                 description: Nội dung chi tiết quy định
 *                 example: Tòa nhà mở cửa từ 6:00 - 22:00 hàng ngày. Sau 22:00 cần liên hệ bảo vệ
 *               type:
 *                 type: string
 *                 enum: [entry_exit, pet_policy, common_area, other]
 *                 description: Loại quy định
 *                 example: entry_exit
 *               effectiveFrom:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày có hiệu lực
 *                 example: 2024-01-01T00:00:00.000Z
 *               effectiveTo:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày hết hiệu lực
 *                 example: 2024-12-31T23:59:59.000Z
 *     responses:
 *       201:
 *         description: Tạo quy định thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Tạo quy định thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e124
 *                     buildingId:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e123
 *                     title:
 *                       type: string
 *                       example: Giờ ra vào tòa nhà
 *                     description:
 *                       type: string
 *                       example: Tòa nhà mở cửa từ 6:00 - 22:00 hàng ngày
 *                     type:
 *                       type: string
 *                       example: entry_exit
 *                     status:
 *                       type: string
 *                       example: active
 *                     effectiveFrom:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-01T00:00:00.000Z
 *                     effectiveTo:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-12-31T23:59:59.000Z
 *                     createdBy:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-15T10:30:00.000Z
 *       400:
 *         description: Thiếu thông tin bắt buộc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thiếu thông tin bắt buộc
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
 *         description: Không có quyền tạo quy định cho tòa này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền tạo quy định cho tòa này
 *       404:
 *         description: Không tìm thấy tòa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy tòa
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi server
 */
// Landlord: CRUD
router.post("/",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.REGULATION_CREATE, { checkBuilding: true }),
  RegulationCtrl.create);

/**
 * @swagger
 * /landlords/regulations/{id}:
 *   put:
 *     summary: Cập nhật quy định
 *     description: Cập nhật thông tin quy định (chỉ admin và landlord)
 *     tags: [Landlord Regulation Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của quy định
 *         example: 68d7dad6cadcf51ed611e124
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Tiêu đề quy định
 *                 example: Giờ ra vào tòa nhà (Cập nhật)
 *               description:
 *                 type: string
 *                 description: Nội dung chi tiết quy định
 *                 example: Tòa nhà mở cửa từ 5:30 - 23:00 hàng ngày. Sau 23:00 cần liên hệ bảo vệ
 *               type:
 *                 type: string
 *                 enum: [entry_exit, pet_policy, common_area, other]
 *                 description: Loại quy định
 *                 example: entry_exit
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: Trạng thái quy định
 *                 example: active
 *               effectiveFrom:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày có hiệu lực
 *                 example: 2024-02-01T00:00:00.000Z
 *               effectiveTo:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày hết hiệu lực
 *                 example: 2024-12-31T23:59:59.000Z
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cập nhật thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e124
 *                     buildingId:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e123
 *                     title:
 *                       type: string
 *                       example: Giờ ra vào tòa nhà (Cập nhật)
 *                     description:
 *                       type: string
 *                       example: Tòa nhà mở cửa từ 5:30 - 23:00 hàng ngày
 *                     type:
 *                       type: string
 *                       example: entry_exit
 *                     status:
 *                       type: string
 *                       example: active
 *                     effectiveFrom:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-02-01T00:00:00.000Z
 *                     effectiveTo:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-12-31T23:59:59.000Z
 *                     createdBy:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2024-01-15T11:30:00.000Z
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
 *         description: Không có quyền chỉnh sửa quy định này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền chỉnh sửa quy định này
 *       404:
 *         description: Không tìm thấy quy định
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy quy định
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi server
 */
router.put(
  "/:id",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.REGULATION_EDIT,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Regulation"
    }
  ),
  RegulationCtrl.update
);

/**
 * @swagger
 * /landlords/regulations/{id}:
 *   delete:
 *     summary: Xóa quy định
 *     description: Xóa quy định (chỉ admin và landlord)
 *     tags: [Landlord Regulation Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của quy định
 *         example: 68d7dad6cadcf51ed611e124
 *     responses:
 *       200:
 *         description: Xóa quy định thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xóa quy định
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
 *         description: Không có quyền xóa quy định này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không có quyền xóa quy định này
 *       404:
 *         description: Không tìm thấy quy định
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy quy định
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi server
 */
router.delete(
  "/:id",
  checkAuthorize(["admin", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.REGULATION_DELETE,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "Regulation"
    }
  ),
  RegulationCtrl.remove
);

module.exports = router;