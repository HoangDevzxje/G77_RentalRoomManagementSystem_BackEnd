const router = require('express').Router();
const authController = require('../controllers/AuthController');
const { checkAuthorize } = require('../middleware/authMiddleware');

// Xử lý OTP
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: API cho xác thực và người dùng
 */

/**
 * @swagger
 * /auth/send-otp:
 *   post:
 *     summary: Gửi OTP tới email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - email
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [register, reset-password]
 *                 example: register
 *               email:
 *                 type: string
 *                 example: test@gmail.com
 *     responses:
 *       200:
 *         description: OTP đã được gửi
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc lỗi xác thực
 *       500:
 *         description: Lỗi hệ thống
 */
router.post("/send-otp", authController.sendOtp);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Xác minh OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - email
 *               - otp
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [register, reset-password]
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP xác thực thành công
 *       400:
 *         description: OTP không đúng hoặc đã hết hạn
 */
router.post("/verify-otp", authController.verifyOtp);

// Đăng ký người dùng
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Đăng ký người dùng mới
 *     description: Tạo tài khoản mới kèm thông tin cá nhân (Account + UserInformation).
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - confirmPassword
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "test@gmail.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Abc@123456"
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: "Abc@123456"
 *               role:
 *                 type: string
 *                 enum: [resident, landlord]
 *                 example: "resident"
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đăng ký thành công!
 *                 accountId:
 *                   type: string
 *                   example: "650fa6e7e9a123456789abcd"
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc OTP chưa xác thực
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email đã tồn tại!"
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lỗi hệ thống!"
 */
router.post("/register", authController.register);


// Đăng nhập
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Đăng nhập tài khoản
 *     description: Đăng nhập bằng email và mật khẩu.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "chiennxhe176221@fpt.edu.vn"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Chien2003@"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đăng nhập thành công!
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email hoặc mật khẩu không đúng!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */
router.post("/login", authController.login);

// Rest mật khẩu
/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mật khẩu đã được cập nhật
 *       400:
 *         description: OTP chưa xác thực hoặc lỗi dữ liệu
 *       500:
 *         description: Lỗi hệ thống
 */
router.post("/reset-password", authController.resetPassword);

// Refresh token
/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Làm mới access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token mới được tạo
 *       401:
 *         description: Token không hợp lệ hoặc hết hạn
 */
router.post("/refresh-token", authController.refreshToken);

// Đổi mật khẩu
/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Đổi mật khẩu
 *     description: Thay đổi mật khẩu của người dùng đã đăng nhập
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu hiện tại
 *                 example: "OldPass123@"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới
 *                 example: "NewPass123@"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đổi mật khẩu thành công!"
 *       400:
 *         description: Mật khẩu cũ không đúng hoặc dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Mật khẩu cũ không đúng!"
 *       401:
 *         description: Token không hợp lệ hoặc chưa đăng nhập
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Token không hợp lệ!"
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lỗi hệ thống!"
 */
router.post("/change-password", checkAuthorize(["resident", "landlord"]), authController.changePassword);

// /**
//  * @swagger
//  * /google-auth:
//  *   post:
//  *     summary: Đăng nhập bằng Google
//  *     tags: [Auth]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - token
//  *             properties:
//  *               token:
//  *                 type: string
//  *                 description: Google ID Token
//  *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...
//  *     responses:
//  *       200:
//  *         description: Đăng nhập Google thành công
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                 accessToken:
//  *                   type: string
//  *                 role:
//  *                   type: string
//  *                 email:
//  *                   type: string
//  *       400:
//  *         description: Thiếu token hoặc tài khoản bị khóa
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/Error'
//  *       500:
//  *         description: Lỗi xác thực với Google
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/Error'
//  */
// router.post("/google-auth", authController.googleLogin);

// /**
//  * @swagger
//  * /facebook-auth:
//  *   post:
//  *     summary: Đăng nhập bằng Facebook
//  *     tags: [Auth]
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - accessToken
//  *             properties:
//  *               accessToken:
//  *                 type: string
//  *                 description: Facebook Access Token
//  *                 example: EAAGm0PX4ZCpsBAKZA...
//  *     responses:
//  *       200:
//  *         description: Đăng nhập Facebook thành công
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                 accessTokenLogin:
//  *                   type: string
//  *                 role:
//  *                   type: string
//  *                 email:
//  *                   type: string
//  *       400:
//  *         description: Không lấy được email hoặc tài khoản bị khóa
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/Error'
//  *       500:
//  *         description: Xác thực Facebook thất bại
//  *         content:
//  *           application/json:
//  *             schema:
//  *               $ref: '#/components/schemas/Error'
//  */
// router.post("/facebook-auth", authController.facebookLogin);
/**
 * @swagger
 * /auth/change-password-first:
 *   post:
 *     summary: Đổi mật khẩu lần đầu (dành cho nhân viên được tạo bởi landlord)
 *     description: |
 *       API dùng để nhân viên (staff) đổi mật khẩu lần đầu tiên sau khi nhận email từ landlord.
 *       
 *       - Token được gửi qua email (có hiệu lực **24 giờ**)
 *       - Sau khi đổi thành công → tài khoản được kích hoạt và có thể đăng nhập bình thường
 *       - Frontend nên tự động redirect người dùng đến trang này nếu `mustChangePassword = true`
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token được gửi trong email (dạng chuỗi dài, không mã hóa)
 *                 example: "a3f8b9e2c7d1f5g6h7j8k9l0m1n2p3q4r5s6t7u8v9w0x1y2z3"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới (phải đáp ứng chính sách mật khẩu của hệ thống)
 *                 example: "Mậtkhau@123"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay."
 *             examples:
 *               success:
 *                 value:
 *                   message: "Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay."
 *       
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc token hết hạn
 *         content:
 *           application/json:
 *             examples:
 *               invalid_token:
 *                 summary: Token không hợp lệ hoặc đã hết hạn
 *                 value:
 *                   message: "Token không hợp lệ hoặc đã hết hạn!"
 *               weak_password:
 *                 summary: Mật khẩu không đủ mạnh
 *                 value:
 *                   message: "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt!"
 *       
 *       500:
 *         description: Lỗi máy chủ
 *         content:
 *           application/json:
 *             example:
 *               message: "Lỗi server"
 */
router.post("/change-password-first", authController.changeFirstPassword);
router.post("/logout", authController.logoutUser);
module.exports = router;
