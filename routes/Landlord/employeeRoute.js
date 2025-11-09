// routes/staff.js
const router = require("express").Router();
const employeeController = require("../../controllers/Landlord/EmployCotroller");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Landlord Employees Management
 *     description: Quản lý nhân viên (employee) của chủ trọ
 */

/**
 * @swagger
 * /landlords/employees/create:
 *   post:
 *     summary: Tạo nhân viên mới
 *     description: |
 *       Chủ trọ tạo tài khoản nhân viên (staff).  
 *       Hệ thống sẽ tự động tạo tài khoản, gửi **email chứa email + mật khẩu tạm** cho nhân viên.  
 *       Nhân viên có thể quản lý **nhiều tòa nhà** và được cấp **quyền cụ thể**.
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - fullName
 *               - assignedBuildings
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: staff@example.com
 *                 description: Email đăng nhập của nhân viên
 *               password:
 *                 type: string
 *                 example: staff123
 *               confirmPassword:
 *                 type: string
 *                 example: staff123
 *               fullName:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               phoneNumber:
 *                 type: string
 *                 example: "0901234567"
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: "1995-03-15"
 *               gender:
 *                 type: string
 *                 enum: [Nam, Nữ, Khác]
 *                 example: Nam
 *               address:
 *                 type: string
 *                 example: "An cảnh Lê lợi"
 *               assignedBuildings:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["60d5ec49f1b2c123456789ab", "60d5ec49f1b2c123456789ac"]
 *                 description: Danh sách ID tòa nhà được giao quản lý
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["room:create", "payment:collect", "report:view"]
 *                 description: Danh sách mã quyền (lấy từ `/staff/permissions`)
 *     responses:
 *       201:
 *         description: Tạo nhân viên thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tạo nhân viên thành công. Thông tin đăng nhập đã được gửi qua email."
 *                 staff:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     assignedBuildings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Email đã tồn tại / Quyền không hợp lệ / Tòa nhà không thuộc landlord
 *       403:
 *         description: Không có quyền (subscription hết hạn)
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/employees/list:
 *   get:
 *     summary: Lấy danh sách nhân viên
 *     description: Lấy toàn bộ nhân viên đang hoạt động của chủ trọ
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   accountId:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: string
 *                   userInfo:
 *                     type: object
 *                     properties:
 *                       fullName:
 *                         type: string
 *                       phoneNumber:
 *                         type: string
 *                   assignedBuildings:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                   permissions:
 *                     type: array
 *                     items:
 *                       type: string
 *                   isActive:
 *                     type: boolean
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *       403:
 *         description: Không có quyền
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/employees/permissions:
 *   get:
 *     summary: Lấy danh sách quyền có thể cấp
 *     description: Trả về tất cả quyền có sẵn trong hệ thống (dùng để hiển thị bảng chọn quyền khi tạo nhân viên)
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy danh sách quyền thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   code:
 *                     type: string
 *                     example: room:create
 *                   name:
 *                     type: string
 *                     example: Thêm
 *                   group:
 *                     type: string
 *                     example: Phòng
 *                   action:
 *                     type: string
 *                     enum: [view, create, edit, delete]
 *       403:
 *         description: Không có quyền
 *       500:
 *         description: Lỗi server
 */
/**
 * @swagger
 * /landlords/employees/{staffId}/status:
 *   patch:
 *     summary: Cập nhật trạng thái hoạt động của nhân viên
 *     description: |
 *       Chủ trọ bật/tắt tài khoản nhân viên.  
 *       - `isActive: true` → Kích hoạt (mở khóa tài khoản)  
 *       - `isActive: false` → Khóa tài khoản (không đăng nhập được)  
 *       Khi khóa staff → tự động khóa luôn `Account.isActivated`
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của nhân viên (Employee._id)
 *         example: 671a123456789abc123def45
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *                 example: false
 *                 description: true = bật, false = khóa
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
 *                   example: "Đã khóa nhân viên thành công"
 *                 staffId:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 *       400:
 *         description: Thiếu isActive hoặc không phải boolean
 *       404:
 *         description: Không tìm thấy nhân viên
 *       403:
 *         description: Không có quyền (subscription hết hạn)
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/employees/{staffId}/info:
 *   patch:
 *     summary: Cập nhật thông tin cá nhân nhân viên
 *     description: Chủ trọ cập nhật họ tên, số điện thoại, ngày sinh, giới tính, địa chỉ của nhân viên
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: 671a123456789abc123def45
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Nguyễn Thị B
 *               phoneNumber:
 *                 type: string
 *                 example: "0909876543"
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: "1998-07-20"
 *               gender:
 *                 type: string
 *                 enum: [Nam, Nữ, Khác]
 *               address:
 *                 type: string
 *                 example: "Quận 7, TP.HCM"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy nhân viên
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/employees/{staffId}/permissions:
 *   patch:
 *     summary: Cập nhật quyền và tòa nhà được giao cho nhân viên
 *     description: |
 *       Chủ trọ thay đổi quyền (permissions) và danh sách tòa nhà nhân viên được quản lý.  
 *       **Không thể giao tòa nhà của landlord khác!**
 *     tags: [Landlord Employees Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *         example: 671a123456789abc123def45
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assignedBuildings:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["670f123456789abc123def45", "670fabc123456789def12345"]
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["room:create", "schedule:create", "contract:create"]
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
 *                 staffId:
 *                   type: string
 *                 assignedBuildings:
 *                   type: array
 *                 permissions:
 *                   type: array
 *       400:
 *         description: Quyền không tồn tại
 *       403:
 *         description: Tòa nhà không thuộc landlord
 *       404:
 *         description: Không tìm thấy nhân viên
 *       500:
 *         description: Lỗi server
 */
router.post(
    "/create",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.createStaff
);
router.patch(
    "/:staffId/status",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.updateStaffStatus
);
router.patch(
    "/:staffId/info",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.updateStaffInfo
);

router.patch(
    "/:staffId/permissions",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.updateStaffPermissions
);
router.get(
    "/list",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.getStaffList
);

router.get(
    "/permissions",
    checkAuthorize(["landlord"]),
    checkSubscription,
    employeeController.getPermissions
);

module.exports = router;