const express = require('express');
const router = express.Router();
const packageController = require('../../controllers/Admin/PackageController');
const { checkAuthorize } = require('../../middleware/authMiddleware');
/**
 * @swagger
 * tags:
 *   name: Package
 *   description: API quản lý gói dịch vụ
 */

/**
 * @swagger
 * /admin/packages:
 *   post:
 *     summary: Tạo gói dịch vụ mới
 *     description: Tạo một gói dịch vụ mới (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - durationDays
 *               - roomLimit
 *             properties:
 *               name:
 *                 type: string
 *                 example: Premium Package
 *               price:
 *                 type: number
 *                 example: 500000
 *               durationDays:
 *                 type: number
 *                 example: 30
 *               roomLimit:
 *                 type: number
 *                 example: 50
 *               description:
 *                 type: string
 *                 example: Gói Premium cho phép quản lý tối đa 50 phòng trong 30 ngày.
 *               type:
 *                 type: string
 *                 enum: [trial, paid]
 *                 example: paid
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Gói dịch vụ được tạo thành công
 */
router.post('/packages', checkAuthorize(['admin']), packageController.create);

/**
 * @swagger
 * /admin/packages:
 *   get:
 *     summary: Lấy danh sách gói dịch vụ
 *     description: Lấy tất cả gói dịch vụ (landlord/admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách gói dịch vụ
 */
router.get('/packages', checkAuthorize(['landlord', 'admin']), packageController.list);

/**
 * @swagger
 * /admin/packages/{id}:
 *   get:
 *     summary: Lấy chi tiết gói dịch vụ
 *     description: Lấy thông tin một gói dịch vụ theo ID (landlord/admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết gói dịch vụ
 */
router.get('/packages/:id', checkAuthorize(['landlord', 'admin']), packageController.getById);

/**
 * @swagger
 * /admin/packages/{id}:
 *   put:
 *     summary: Cập nhật gói dịch vụ
 *     description: Cập nhật thông tin gói dịch vụ (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               durationDays:
 *                 type: number
 *               roomLimit:
 *                 type: number
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Gói dịch vụ được cập nhật thành công
 */
router.put('/packages/:id', checkAuthorize(['admin']), packageController.update);

/**
 * @swagger
 * /admin/packages/{id}:
 *   delete:
 *     summary: Xóa gói dịch vụ
 *     description: Xóa gói dịch vụ nếu không có subscription liên quan (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gói dịch vụ được xóa thành công
 */
router.delete('/packages/:id', checkAuthorize(['admin']), packageController.remove);

/**
 * @swagger
 * /admin/packages/{id}/toggle-active:
 *   patch:
 *     summary: Bật / tắt trạng thái hoạt động của gói dịch vụ
 *     description: Cập nhật trạng thái isActive của gói dịch vụ (admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của gói dịch vụ cần thay đổi trạng thái.
 *     responses:
 *       200:
 *         description: Thay đổi trạng thái thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Thay đổi trạng thái thành công
 *                 data:
 *                   type: object
 *       404:
 *         description: Không tìm thấy gói dịch vụ
 */
router.patch('/packages/:id/toggle-active', checkAuthorize(['admin']), packageController.updateIsActive);

/**
 * @swagger
 * /admin/packages/{id}/change-type:
 *   patch:
 *     summary: Đổi loại gói dịch vụ
 *     description: Chuyển đổi loại gói dịch vụ giữa `trial` và `paid` (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của gói dịch vụ cần đổi loại.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [trial, paid]
 *                 example: trial
 *     responses:
 *       200:
 *         description: Đã đổi loại gói thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đã đổi loại gói sang trial
 *                 data:
 *                   type: object
 *       400:
 *         description: Giá trị type không hợp lệ
 *       404:
 *         description: Không tìm thấy gói dịch vụ
 */
router.patch('/packages/:id/change-type', checkAuthorize(['admin']), packageController.changeType);

module.exports = router;
