// routes/staff.js
const router = require("express").Router();
const staffController = require("../../controllers/Landlord/StaffCotroller");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Landlord Staffs Management
 *     description: Quản lý nhân viên (employee) của chủ trọ
 */

/**
 * @swagger
 * /landlords/staffs/create:
 *   post:
 *     summary: Tạo tài khoản nhân viên (Staff)
 *     description: |
 *       Chủ trọ (landlord) tạo tài khoản cho nhân viên quản lý tòa nhà.  
 *       Hệ thống sẽ **tự động sinh mật khẩu tạm ngẫu nhiên**, gửi email chứa:
 *       - Email đăng nhập
 *       - Mật khẩu tạm
 *       - Link đổi mật khẩu bắt buộc lần đầu (có hiệu lực 24h)
 *       
 *       Nhân viên phải đổi mật khẩu ngay lần đăng nhập đầu tiên.
 *     tags: [Landlord Staffs Management]
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
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: nvdong0902@gmail.com
 *                 description: Email dùng để đăng nhập (phải chưa tồn tại trong hệ thống)
 *               fullName:
 *                 type: string
 *                 example: Nguyễn Văn An
 *                 description: Họ tên nhân viên
 *               phoneNumber:
 *                 type: string
 *                 example: "0901234567"
 *                 description: Số điện thoại (tùy chọn)
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: "2003-02-09"
 *                 description: Ngày sinh (định dạng YYYY-MM-DD)
 *               gender:
 *                 type: string
 *                 enum: [Nam, Nữ, Khác]
 *                 example: Nam
 *               address:
 *                 type: string
 *                 example: "123 Đường Lê Lợi, Quận 1, TP.HCM"
 *               assignedBuildings:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: objectid
 *                 example: ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]
 *                 description: Danh sách ID tòa nhà mà nhân viên được phân công quản lý (phải thuộc landlord)
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["room:create", "room:view", "room:edit", "room:delete"]
 *                 description: Danh sách mã quyền chi tiết (lấy từ API `/staff/permissions`)
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
 *                       example: nguyen.van.staff@rentalroom.com
 *                     fullName:
 *                       type: string
 *                       example: Nguyễn Văn An
 *                     assignedBuildings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             examples:
 *               email_exists:
 *                 summary: Email đã được sử dụng
 *                 value: { "message": "Email đã tồn tại!" }
 *               invalid_permission:
 *                 summary: Quyền không tồn tại
 *                 value: { "message": "Một số quyền không tồn tại" }
 *       403:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             example: { "message": "Một số tòa nhà không thuộc quyền quản lý của bạn!" }
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             example: { "message": "Lỗi server" }
 */

/**
 * @swagger
 * /landlords/staffs/{staffId}/resend-first-password:
 *   post:
 *     summary: Gửi lại link đổi mật khẩu lần đầu cho nhân viên
 *     description: |
 *       Dành cho chủ trọ (landlord) khi nhân viên **quên hoặc link đổi mật khẩu lần đầu đã hết hạn**.
 *       
 *       - Chỉ hoạt động với nhân viên **chưa đổi mật khẩu lần đầu** (`mustChangePassword = true`)
 *       - Tạo token mới (24h), gửi lại email chứa link đổi mật khẩu
 *       - Token cũ sẽ bị ghi đè → không dùng được nữa
 *     tags: [Landlord Staffs Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: staffId
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID của nhân viên (lấy từ danh sách nhân viên)
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Gửi lại link thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã gửi lại link đổi mật khẩu thành công!"
 *             examples:
 *               success:
 *                 value:
 *                   message: "Đã gửi lại link đổi mật khẩu thành công!"
 *       
 *       400:
 *         description: Nhân viên đã đổi mật khẩu rồi
 *         content:
 *           application/json:
 *             example:
 *               message: "Nhân viên đã đổi mật khẩu rồi!"
 *       
 *       404:
 *         description: Không tìm thấy nhân viên hoặc tài khoản
 *         content:
 *           application/json:
 *             examples:
 *               not_found_employee:
 *                 summary: Không tìm thấy nhân viên
 *                 value:
 *                   message: "Không tìm thấy nhân viên!"
 *               not_found_account:
 *                 summary: Tài khoản không tồn tại
 *                 value:
 *                   message: "Tài khoản không tồn tại!"
 *       
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             example:
 *               message: "Lỗi server"
 */

/**
 * @swagger
 * /landlords/staffs/list:
 *   get:
 *     summary: Lấy danh sách nhân viên
 *     description: Lấy toàn bộ nhân viên đang hoạt động của chủ trọ
 *     tags: [Landlord Staffs Management]
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
 * /landlords/staffs/permissions:
 *   get:
 *     summary: Lấy danh sách quyền có thể cấp
 *     description: Trả về tất cả quyền có sẵn trong hệ thống (dùng để hiển thị bảng chọn quyền khi tạo nhân viên)
 *     tags: [Landlord Staffs Management]
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
 * /landlords/staffs/{staffId}/status:
 *   patch:
 *     summary: Cập nhật trạng thái hoạt động của nhân viên
 *     description: |
 *       Chủ trọ bật/tắt tài khoản nhân viên.  
 *       - `isActive: true` → Kích hoạt (mở khóa tài khoản)  
 *       - `isActive: false` → Khóa tài khoản (không đăng nhập được)  
 *       Khi khóa staff → tự động khóa luôn `Account.isActivated`
 *     tags: [Landlord Staffs Management]
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
 * /landlords/staffs/{staffId}/info:
 *   patch:
 *     summary: Cập nhật thông tin cá nhân nhân viên
 *     description: Chủ trọ cập nhật họ tên, số điện thoại, ngày sinh, giới tính, địa chỉ của nhân viên
 *     tags: [Landlord Staffs Management]
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
 * /landlords/staffs/{staffId}/permissions:
 *   patch:
 *     summary: Cập nhật quyền và tòa nhà được giao cho nhân viên
 *     description: |
 *       Chủ trọ thay đổi quyền (permissions) và danh sách tòa nhà nhân viên được quản lý.  
 *       **Không thể giao tòa nhà của landlord khác!**
 *     tags: [Landlord Staffs Management]
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
    staffController.createStaff
);
router.post(
    "/:staffId/resend-first-password",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.resendFirstPasswordLink
);
router.patch(
    "/:staffId/status",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.updateStaffStatus
);
router.patch(
    "/:staffId/info",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.updateStaffInfo
);

router.patch(
    "/:staffId/permissions",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.updateStaffPermissions
);
router.get(
    "/list",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.getStaffList
);

router.get(
    "/permissions",
    checkAuthorize(["landlord"]),
    checkSubscription,
    staffController.getPermissions
);

module.exports = router;