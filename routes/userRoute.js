const router = require("express").Router();
const userController = require("../controllers/UserController");
const { checkAuthorize } = require("../middleware/authMiddleware");

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: API quản lý hồ sơ người dùng
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       properties:
 *         address:
 *           type: string
 *           example: "123 Nguyễn Trãi"
 *         provinceName:
 *           type: string
 *           example: "Hà Nội"
 *         districtName:
 *           type: string
 *           example: "Thanh Xuân"
 *         wardName:
 *           type: string
 *           example: "Thượng Đình"
 *
 *     UserInformation:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "670f1d3b2c1e5a0012a9f3b2"
 *         fullName:
 *           type: string
 *           example: "Nguyễn Văn A"
 *         phoneNumber:
 *           type: string
 *           example: "0912345678"
 *         dob:
 *           type: string
 *           format: date
 *           example: "1998-05-21"
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           example: "male"
 *         address:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Address'
 *
 *     Account:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "670f1d3b2c1e5a0012a9f3b1"
 *         email:
 *           type: string
 *           example: "user@example.com"
 *         role:
 *           type: string
 *           enum: [resident, landlord, admin]
 *           example: "resident"
 *         isActivated:
 *           type: boolean
 *           example: true
 *         userInfo:
 *           $ref: '#/components/schemas/UserInformation'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     Error:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Đã có lỗi xảy ra"
 */

/**
 * @swagger
 * /profiles:
 *   get:
 *     summary: Lấy thông tin hồ sơ người dùng hiện tại
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thông tin thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Lấy thông tin cá nhân thành công!"
 *                 user:
 *                   $ref: '#/components/schemas/Account'
 *       401:
 *         description: Không được ủy quyền
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Không tìm thấy tài khoản
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/", checkAuthorize(["admin", "landlord", "resident", "staff"]), userController.getMyProfile);

/**
 * @swagger
 * /profiles:
 *   put:
 *     summary: Cập nhật thông tin hồ sơ người dùng hiện tại
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Nguyễn Văn B"
 *               phoneNumber:
 *                 type: string
 *                 example: "0987654321"
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: "2000-01-01"
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: "female"
 *               address:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Address'
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
 *                   example: "Cập nhật thông tin cá nhân thành công!"
 *                 user:
 *                   $ref: '#/components/schemas/Account'
 *       400:
 *         description: Yêu cầu không hợp lệ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Không được ủy quyền
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Không tìm thấy tài khoản
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put("/", checkAuthorize(["admin", "landlord", "resident", "staff"]), userController.editMyProfile);

module.exports = router;
