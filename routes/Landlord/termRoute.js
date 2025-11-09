const router = require("express").Router();
const termController = require("../../controllers/Landlord/TermController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { PERMISSIONS } = require("../../constants/permissions");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
/**
 * @swagger
 * tags:
 *   name: Landlord Building Terms Management
 *   description: Quản lý điều khoản của tòa nhà (dành cho chủ trọ)
 */

/**
 * @swagger
 * /landlords/terms:
 *   post:
 *     summary: Tạo điều khoản mới cho tòa nhà
 *     tags: [Landlord Building Terms Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [buildingId, name, description]
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: 671ff7c9b1234f2f0a345678
 *               name:
 *                 type: string
 *                 example: Quy định về tiền đặt cọc
 *               description:
 *                 type: string
 *                 example: Người thuê phải đặt cọc 1 tháng tiền phòng trước khi nhận phòng.
 *     responses:
 *       201:
 *         description: Tạo điều khoản thành công
 *       400:
 *         description: Thiếu thông tin bắt buộc
 *       403:
 *         description: Không có quyền tạo điều khoản cho tòa nhà này
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/terms/building/{buildingId}:
 *   get:
 *     summary: Lấy danh sách điều khoản của một tòa nhà (có phân trang & lọc)
 *     tags: [Landlord Building Terms Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của tòa nhà
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Lọc theo trạng thái điều khoản
 *         example: active
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số điều khoản mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách điều khoản có phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 23
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                         example: Quy định về đặt cọc
 *                       description:
 *                         type: string
 *                         example: Người thuê phải đặt cọc 1 tháng tiền phòng.
 *                       status:
 *                         type: string
 *                         enum: [active, inactive]
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/terms/detail/{id}:
 *   get:
 *     summary: Xem chi tiết điều khoản
 *     description: |
 *       Lấy chi tiết một điều khoản cụ thể của tòa nhà.
 *       Chỉ chủ trọ sở hữu tòa nhà đó mới có quyền xem.
 *     tags: [Landlord Building Terms Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của điều khoản
 *         example: 67201df5c1234ab987654321
 *     responses:
 *       200:
 *         description: Chi tiết điều khoản
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
 *                       example: 67201df5c1234ab987654321
 *                     name:
 *                       type: string
 *                       example: Quy định đặt cọc
 *                     description:
 *                       type: string
 *                       example: Người thuê phải đặt cọc 1 tháng tiền phòng trước khi ký hợp đồng.
 *                     status:
 *                       type: string
 *                       enum: [active, inactive]
 *                     buildingId:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: 671ff7c9b1234f2f0a345678
 *                         name:
 *                           type: string
 *                           example: Chung cư ABC
 *                         address:
 *                           type: string
 *                           example: 123 Đường Lê Lợi, Quận 1, TP.HCM
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Không có quyền xem điều khoản này
 *       404:
 *         description: Không tìm thấy điều khoản
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/terms/{id}:
 *   patch:
 *     summary: Cập nhật điều khoản
 *     tags: [Landlord Building Terms Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID điều khoản
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không có quyền chỉnh sửa điều khoản này
 */

/**
 * @swagger
 * /landlords/terms/{id}:
 *   delete:
 *     summary: Xóa điều khoản
 *     tags: [Landlord Building Terms Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID điều khoản
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       403:
 *         description: Không có quyền xóa điều khoản này
 */

router.post(
  "/",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.TERM_CREATE, { checkBuilding: true }),
  termController.createTerm
);
router.get(
  "/building/:buildingId",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.TERM_VIEW, { checkBuilding: true, buildingField: "buildingId" }),
  termController.getTermsByBuilding
);

router.get(
  "/detail/:id",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.TERM_VIEW),
  termController.getTermDetail
);

router.patch(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.TERM_EDIT),
  termController.updateTerm
);

router.delete(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.TERM_DELETE),
  termController.deleteTerm
);
module.exports = router;
