const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const bankInfoController = require("../../controllers/Landlord/BankInfoController");
const { uploadBankQr } = require("../../configs/cloudinary.js");
/**
 * @swagger
 * tags:
 *   - name: BankInfo
 *     description: Cấu hình thông tin ngân hàng để tenant chuyển khoản cho chủ trọ
 */

/**
 * @swagger
 * /landlords/bank-info:
 *   get:
 *     summary: Lấy thông tin ngân hàng của chủ trọ hiện tại
 *     tags: [BankInfo]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin ngân hàng hiện tại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 bankInfo:
 *                   type: object
 *                   properties:
 *                     bankName:
 *                       type: string
 *                       example: "Vietcombank CN Tân Định"
 *                     accountNumber:
 *                       type: string
 *                       example: "0123456789"
 *                     accountName:
 *                       type: string
 *                       example: "NGUYEN VAN A"
 *                     qrImageUrl:
 *                       type: string
 *
 */
router.get("/", checkAuthorize("landlord"), bankInfoController.getMyBankInfo);

/**
 * @swagger
 * /landlords/bank-info:
 *   patch:
 *     summary: Cập nhật thông tin ngân hàng của chủ trọ hiện tại
 *     tags: [BankInfo]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bankName:
 *                 type: string
 *                 example: "Vietcombank CN Tân Định"
 *               accountNumber:
 *                 type: string
 *                 example: "0123456789"
 *               accountName:
 *                 type: string
 *                 example: "NGUYEN VAN A"
 *               qrImageUrl:
 *                 type: string
 *
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
 *                 bankInfo:
 *                   type: object
 *                   properties:
 *                     bankName:
 *                       type: string
 *                     accountNumber:
 *                       type: string
 *                     accountName:
 *                       type: string
 *                     qrImageUrl:
 *                       type: string
 */
router.patch(
  "/",
  checkAuthorize("landlord"),
  bankInfoController.updateMyBankInfo
);
/**
 * @swagger
 * /landlords/bank-info/qr-upload:
 *   post:
 *     summary: Upload ảnh QR ngân hàng của chủ trọ
 *     tags: [BankInfo]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               qrImage:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh mã QR (PNG/JPG/WEBP)
 *     responses:
 *       200:
 *         description: Upload thành công, trả về URL ảnh QR
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 qrImageUrl:
 *                   type: string
 *                   example: "https://res.cloudinary.com/.../bank_qr/123/xxx.webp"
 *                 bankInfo:
 *                   type: object
 *                   properties:
 *                     bankName:
 *                       type: string
 *                     accountNumber:
 *                       type: string
 *                     accountName:
 *                       type: string
 *                     qrImageUrl:
 *                       type: string
 */
router.post(
  "/qr-upload",
  checkAuthorize("landlord"),
  uploadBankQr,
  bankInfoController.uploadBankQr
);
module.exports = router;
