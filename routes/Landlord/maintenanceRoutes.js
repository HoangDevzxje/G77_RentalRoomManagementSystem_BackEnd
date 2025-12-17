const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Landlord/MaintenanceController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
const { uploadMultiple } = require("../../configs/cloudinary");
const checkSubscription = require("../../middleware/checkSubscription");
// === MIDDLEWARE: chỉ validate buildingId nếu có gửi ===
const checkBuildingIfProvided = (req, res, next) => {
  const buildingId = req.query.buildingId;
  if (!buildingId) return next();
  return checkStaffPermission(PERMISSIONS.MAINTENANCE_VIEW, {
    checkBuilding: true,
    buildingField: "buildingId",
  })(req, res, next);
};

/**
 * @swagger
 * tags:
 *   name: Landlord Maintenance Management
 *   description: Quản lý yêu cầu bảo trì tòa nhà (Landlord & Staff)
 */

/**
 * @swagger
 * /landlords/maintenance:
 *   get:
 *     summary: Lấy danh sách yêu cầu bảo trì
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: query
 *         schema: { type: string }
 *         description: Lọc theo tòa nhà
 *       - name: roomId
 *         in: query
 *         schema: { type: string }
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [open, in_progress, resolved, rejected]
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *       - name: q
 *         in: query
 *         schema: { type: string }
 *         description: Tìm kiếm tiêu đề/mô tả
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 15 }
 *       - name: sort
 *         in: query
 *         schema: { type: string, default: "-createdAt" }
 *     responses:
 *       200:
 *         description: Danh sách phiếu bảo trì
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       title: { type: string }
 *                       category: { type: string }
 *                       status: { type: string, enum: [open, in_progress, resolved, rejected] }
 *                       roomNumber: { type: string }
 *                       reportedBy: { type: string }
 *                       assignee: { type: object, nullable: true }
 *                       photoCount: { type: integer }
 *                       proofImageCount: { type: integer }
 *                       repairCost: { type: number, nullable: true }
 *                       mustPay: { type: boolean }
 *                       resolvedAt: { type: string, format: date-time, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 */
router.get(
  "/",
  checkAuthorize(["resident", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_VIEW),
  checkBuildingIfProvided,
  ctrl.listRequests
);

/**
 * @swagger
 * /landlords/maintenance/{id}:
 *   get:
 *     summary: Lấy chi tiết một phiếu bảo trì
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết phiếu bảo trì
 *       404:
 *         description: Không tìm thấy
 */
router.get(
  "/:id",
  checkAuthorize(["resident", "landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_VIEW),
  ctrl.getRequest
);

/**
 * @swagger
 * /landlords/maintenance/{id}:
 *   patch:
 *     summary: Cập nhật phiếu bảo trì (trạng thái, phân công, chi phí)
 *     description: |
 *       - Nếu chưa có người xử lý → người cập nhật đầu tiên sẽ tự động được gán
 *       - Nếu có `repairCost > 0` → bắt buộc upload ảnh hóa đơn
 *       - Mọi cập nhật đều gửi thông báo realtime cho người thuê
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, rejected]
 *                 description: Trạng thái mới
 *               repairCost:
 *                 type: number
 *                 description: Điền chi phí nếu người thuê phải trả còn nếu là landlord thì thôi
 *               note:
 *                 type: string
 *                 description: Ghi chú khi cập nhật
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Ảnh hóa đơn/chuyển khoản (bắt buộc nếu repairCost > 0)
 *     responses:
 *       200:
 *         description: Cập nhật thành công + gửi thông báo realtime
 *       400:
 *         description: Thiếu ảnh khi yêu cầu thanh toán
 *       403:
 *         description: Không có quyền
 */
router.patch(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_EDIT),
  checkSubscription,
  uploadMultiple,
  ctrl.updateRequest
);

/**
 * @swagger
 * /landlords/maintenance/{id}/comment:
 *   post:
 *     summary: Thêm bình luận vào phiếu bảo trì
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phiếu bảo trì
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Đã gọi thợ, mai 9h sáng sẽ qua sửa điều hòa"
 *     responses:
 *       200:
 *         description: Thêm bình luận thành công + gửi thông báo realtime cho tất cả người thuê trong phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Đã thêm bình luận" }
 *                 data: { type: object, properties: { commentId: { type: string } } }
 *       400:
 *         description: Nội dung bình luận trống
 *       403:
 *         description: Không có quyền bình luận
 *       404:
 *         description: Không tìm thấy phiếu bảo trì
 */
router.post(
  "/:id/comment",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_CREATE),
  checkSubscription,
  ctrl.comment
);
/**
 * @swagger
 * /landlords/maintenance/{id}/comment/{commentId}:
 *   put:
 *     summary: Sửa bình luận trong phiếu bảo trì
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phiếu bảo trì
 *       - name: commentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bình luận (trong timeline)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Sửa lại: thợ sẽ qua vào 10h sáng"
 *     responses:
 *       200:
 *         description: Sửa bình luận thành công + gửi thông báo realtime
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Đã sửa bình luận" }
 *       400:
 *         description: Nội dung trống hoặc đã quá thời gian cho phép sửa
 *       403:
 *         description: Không phải chủ bình luận
 *       404:
 *         description: Không tìm thấy phiếu hoặc bình luận
 */
router.put(
  "/:id/comment/:commentId",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_EDIT),
  checkSubscription,
  ctrl.updateComment
);

/**
 * @swagger
 * /landlords/maintenance/{id}/comment/{commentId}:
 *   delete:
 *     summary: Xóa bình luận trong phiếu bảo trì
 *     tags: [Landlord Maintenance Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phiếu bảo trì
 *       - name: commentId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID bình luận cần xóa
 *     responses:
 *       200:
 *         description: Xóa bình luận thành công + gửi thông báo realtime
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string, example: "Đã xóa bình luận" }
 *       403:
 *         description: Không có quyền xóa (chỉ chủ bình luận hoặc landlord/staff)
 *       404:
 *         description: Không tìm thấy phiếu hoặc bình luận
 */
router.delete(
  "/:id/comment/:commentId",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.MAINTENANCE_DELETE),
  checkSubscription,
  ctrl.deleteComment
);
module.exports = router;
