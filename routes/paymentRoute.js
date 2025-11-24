const router = require("express").Router();
const momoController = require("../controllers/Payment/MomoController");
/**
 * @swagger
 * /payment/momo/ipn:
 *   post:
 *     summary: (TEST) IPN callback từ MoMo Sandbox
 *     description: >
 *       *Dùng để test MoMo trực tiếp trên Swagger / Postman*
 *       Bạn có thể gửi payload IPN MoMo mẫu để kiểm tra:
 *       - verify chữ ký
 *       - decode extraData
 *       - cập nhật invoice thành paid
 *       - ghi paymentLogs
 *
 *       ⚠ Swagger không chạy được IPN thật từ MoMo Sandbox (MoMo không gọi vào localhost),
 *       nhưng bạn có thể **giả lập 100% payload của MoMo** để test logic backend.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               partnerCode: "MOMO"
 *               orderId: "MOMO_675a1231e9b4b_1732878943000"
 *               requestId: "MOMO_675a1231e9b4b_1732878943000"
 *               amount: 550000
 *               orderInfo: "Thanh toán hóa đơn #INV2024-0001"
 *               orderType: "momo_wallet"
 *               transId: 2500012345
 *               resultCode: 0
 *               message: "Success"
 *               payType: "captureWallet"
 *               responseTime: 1732878943123
 *               extraData: "eyJpbnZvaWNlSWQiOiI2NzVhMTIzMWU5YjRiIn0="
 *               signature: "SIGNATURE_SEE_LOG"
 *               ipnUrl: "http://localhost:9999/payment/momo/ipn"
 *               redirectUrl: "http://localhost:3000/payment/momo-return"
 *               requestType: "captureWallet"
 *     responses:
 *       200:
 *         description: Đã xử lý IPN thành công
 *       400:
 *         description: Signature không hợp lệ hoặc dữ liệu sai
 *       500:
 *         description: Server lỗi
 */

router.post("/momo/ipn", momoController.momoIpn);

module.exports = router;
