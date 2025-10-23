const router = require('express').Router();
const accountController = require("../../controllers/Admin/AccountController");
const { checkAuthorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Admin management account
 *     description: API quản lý tài khoản người dùng (Admin)
 */

/**
 * @swagger
 * /admin/accounts:
 *   get:
 *     summary: Lấy danh sách tài khoản người dùng
 *     description: |
 *       Trả về danh sách tất cả tài khoản trong hệ thống.  
 *       Hỗ trợ **phân trang**, **tìm kiếm theo email**, và chỉ Admin mới được truy cập.
 *     tags: [Admin management account]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Số trang hiện tại (mặc định = 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Số lượng tài khoản mỗi trang (mặc định = 10)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: gmail
 *         description: Tìm kiếm theo email (không phân biệt hoa thường)
 *     responses:
 *       200:
 *         description: Lấy danh sách tài khoản thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 totalUsers:
 *                   type: integer
 *                   example: 32
 *                 totalPages:
 *                   type: integer
 *                   example: 4
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 6718a9b3f1a8b4e5678abcd1
 *                       email:
 *                         type: string
 *                         example: user1@gmail.com
 *                       role:
 *                         type: string
 *                         example: resident
 *                       isActivated:
 *                         type: boolean
 *                         example: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-22T08:15:00.000Z
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-10-22T10:30:00.000Z
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống khi lấy danh sách tài khoản
 */
router.get("/accounts", checkAuthorize(["admin"]), accountController.getAllUsers);

/**
 * @swagger
 * /admin/accounts/{id}/status:
 *   patch:
 *     summary: Thay đổi trạng thái hoạt động của tài khoản
 *     description: |
 *       Bật hoặc tắt (kích hoạt / vô hiệu hóa) tài khoản người dùng theo **ID**.  
 *       Chỉ Admin mới có quyền thực hiện.
 *     tags: [Admin management account]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 6718a9b3f1a8b4e5678abcd1
 *         description: ID của tài khoản cần thay đổi trạng thái
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
 *                   example: Trạng thái tài khoản đã được kích hoạt
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 6718a9b3f1a8b4e5678abcd1
 *                     email:
 *                       type: string
 *                       example: user1@gmail.com
 *                     isActivated:
 *                       type: boolean
 *                       example: true
 *       404:
 *         description: Không tìm thấy tài khoản
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống khi cập nhật trạng thái tài khoản
 */
router.patch("/accounts/:id/status", checkAuthorize(["admin"]), accountController.channgStatusUser);

/**
 * @swagger
 * /admin/accounts/{id}/role:
 *   patch:
 *     summary: Cập nhật quyền (role) của người dùng
 *     description: |
 *       Cho phép **Admin** thay đổi quyền người dùng giữa các giá trị:  
 *       `resident`, `landlord`, hoặc `admin`.
 *     tags: [Admin management account]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: 6718a9b3f1a8b4e5678abcd1
 *         description: ID của người dùng cần thay đổi role
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [resident, landlord, admin]
 *                 example: landlord
 *     responses:
 *       200:
 *         description: Cập nhật quyền thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Cập nhật quyền thành công: user1@gmail.com → landlord"
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 6718a9b3f1a8b4e5678abcd1
 *                     email:
 *                       type: string
 *                       example: user1@gmail.com
 *                     role:
 *                       type: string
 *                       example: landlord
 *       400:
 *         description: Role không hợp lệ
 *       404:
 *         description: Không tìm thấy người dùng
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống khi cập nhật role người dùng
 */
router.patch("/accounts/:id/role", checkAuthorize(["admin"]), accountController.updateRole);

module.exports = router;
