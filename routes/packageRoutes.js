const express = require('express');
const router = express.Router();
const packageController = require('../controllers/Admin/PackageController');
const { checkAuthorize } = require('../middleware/authMiddleware');
/**
 * @swagger
 * tags:
 *   name: Package
 *   description: API quản lý gói dịch vụ
 */

/**
 * @swagger
 * /packages:
 *   post:
 *     summary: Tạo gói dịch vụ mới
 *     description: Tạo một gói dịch vụ mới (chỉ admin).
 *     tags: [Package]
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
 *     responses:
 *       201:
 *         description: Gói dịch vụ được tạo thành công
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
 *                       example: 68d7dad6cadcf51ed611e123
 *                     name:
 *                       type: string
 *                       example: Premium Package
 *                     price:
 *                       type: number
 *                       example: 500000
 *                     durationDays:
 *                       type: number
 *                       example: 30
 *                     roomLimit:
 *                       type: number
 *                       example: 50
 *                     description:
 *                       type: string
 *                       example: Gói Premium cho phép quản lý tối đa 50 phòng trong 30 ngày.
 *                     createdBy:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:26:00.000Z
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
 *         description: Không có quyền (không phải admin)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 */
router.post('/', checkAuthorize(['admin']), packageController.create);

/**
 * @swagger
 * /packages:
 *   get:
 *     summary: Lấy danh sách gói dịch vụ
 *     description: Lấy tất cả gói dịch vụ (landlord/admin).
 *     tags: [Package]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách gói dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 68d7dad6cadcf51ed611e123
 *                       name:
 *                         type: string
 *                         example: Premium Package
 *                       price:
 *                         type: number
 *                         example: 500000
 *                       durationDays:
 *                         type: number
 *                         example: 30
 *                       roomLimit:
 *                         type: number
 *                         example: 50
 *                       description:
 *                         type: string
 *                         example: Gói Premium cho phép quản lý tối đa 50 phòng trong 30 ngày.
 *                       createdBy:
 *                         type: string
 *                         example: 68d7dad6cadcf51ed611e121
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-07T00:26:00.000Z
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
 */
router.get('/', checkAuthorize(['landlord', 'admin']), packageController.list);

/**
 * @swagger
 * /packages/{id}:
 *   get:
 *     summary: Lấy chi tiết gói dịch vụ
 *     description: Lấy thông tin một gói dịch vụ theo ID (landlord/admin).
 *     tags: [Package]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68d7dad6cadcf51ed611e123
 *     responses:
 *       200:
 *         description: Chi tiết gói dịch vụ
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
 *                       example: 68d7dad6cadcf51ed611e123
 *                     name:
 *                       type: string
 *                       example: Premium Package
 *                     price:
 *                       type: number
 *                       example: 500000
 *                     durationDays:
 *                       type: number
 *                       example: 30
 *                     roomLimit:
 *                       type: number
 *                       example: 50
 *                     description:
 *                       type: string
 *                       example: Gói Premium cho phép quản lý tối đa 50 phòng trong 30 ngày.
 *                     createdBy:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:26:00.000Z
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
 *         description: Không tìm thấy gói dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy gói dịch vụ!
 */
router.get('/:id', checkAuthorize(['landlord', 'admin']), packageController.getById);

/**
 * @swagger
 * /packages/{id}:
 *   put:
 *     summary: Cập nhật gói dịch vụ
 *     description: Cập nhật thông tin gói dịch vụ (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68d7dad6cadcf51ed611e123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Premium Package
 *               price:
 *                 type: number
 *                 example: 600000
 *               durationDays:
 *                 type: number
 *                 example: 60
 *               roomLimit:
 *                 type: number
 *                 example: 100
 *               description:
 *                 type: string
 *                 example: Gói Premium cập nhật, quản lý tối đa 100 phòng trong 60 ngày.
 *     responses:
 *       200:
 *         description: Gói dịch vụ được cập nhật thành công
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
 *                       example: 68d7dad6cadcf51ed611e123
 *                     name:
 *                       type: string
 *                       example: Updated Premium Package
 *                     price:
 *                       type: number
 *                       example: 600000
 *                     durationDays:
 *                       type: number
 *                       example: 60
 *                     roomLimit:
 *                       type: number
 *                       example: 100
 *                     description:
 *                       type: string
 *                       example: Gói Premium cập nhật, quản lý tối đa 100 phòng trong 60 ngày.
 *                     createdBy:
 *                       type: string
 *                       example: 68d7dad6cadcf51ed611e121
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-10-07T00:26:00.000Z
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
 *         description: Không có quyền (không phải admin)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy gói dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy gói dịch vụ!
 */
router.put('/:id', checkAuthorize(['admin']), packageController.update);

/**
 * @swagger
 * /packages/{id}:
 *   delete:
 *     summary: Xóa gói dịch vụ
 *     description: Xóa gói dịch vụ nếu không có subscription liên quan (chỉ admin).
 *     tags: [Package]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 68d7dad6cadcf51ed611e123
 *     responses:
 *       200:
 *         description: Gói dịch vụ được xóa thành công
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
 *         description: Không có quyền (không phải admin)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bạn không có quyền thực hiện hành động này!
 *       404:
 *         description: Không tìm thấy gói dịch vụ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Không tìm thấy gói dịch vụ!
 *       409:
 *         description: Có subscription liên quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Hãy xóa các subscription liên quan trước!
 */
router.delete('/:id', checkAuthorize(['admin']), packageController.remove);

module.exports = router;