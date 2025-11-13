const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const contractController = require("../../controllers/Landlord/ContractController");
const checkSubscription = require("../../middleware/checkSubscription");
/**
 * @swagger
 * tags:
 *   - name: Landlord Contracts
 *     description: Quản lý quy trình tạo & ký hợp đồng (landlord / staff)
 */

/**
 * @swagger
 * /landlords/contracts:
 *   get:
 *     summary: Danh sách hợp đồng của landlord
 *     description: |
 *       Lấy danh sách toàn bộ hợp đồng mà landlord đã tạo hoặc đang quản lý.
 *       Trả về thông tin cơ bản gồm tòa nhà, phòng, người thuê và trạng thái.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng của landlord
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: 6742baf3f8899c00123abcd1
 *                   status:
 *                     type: string
 *                     example: sent_to_tenant
 *                   buildingId:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 673ffb17c0d011b27e33ee22
 *                       name:
 *                         type: string
 *                         example: "Tòa nhà Trường Sơn 25"
 *                   roomId:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 673ffb2ac0d011b27e33ee45
 *                       name:
 *                         type: string
 *                         example: "Phòng 302"
 *                   tenantId:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 673aa901c0d011b27e11aabb
 *                       name:
 *                         type: string
 *                         example: "Nguyễn Văn A"
 *                       email:
 *                         type: string
 *                         example: "nguyenvana@example.com"
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-11-11T10:30:00Z"
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-11-01T08:20:00Z"
 *       400:
 *         description: Lỗi hệ thống hoặc tham số không hợp lệ
 */

/**
 * @swagger
 * /landlords/contracts/from-contact:
 *   post:
 *     summary: Tạo hợp đồng draft từ Contact (yêu cầu tạo hợp đồng)
 *     description: |
 *       Tạo một hợp đồng nháp (draft) dựa trên `Contact` (yêu cầu tạo hợp đồng của tenant) và ContractTemplate của tòa.
 *       Endpoint này chỉ dành cho landlord hoặc staff của landlord.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contactId
 *             properties:
 *               contactId:
 *                 type: string
 *                 example: 67201df5c1234ab987654321
 *     responses:
 *       200:
 *         description: Trả về document Contract (draft) vừa tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 contactId:
 *                   type: string
 *                 landlordId:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *                 templateId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: draft
 *       400:
 *         description: Thiếu dữ liệu hoặc lỗi yêu cầu
 *       404:
 *         description: Contact hoặc template không tìm thấy
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   put:
 *     summary: Cập nhật dữ liệu hợp đồng (chỉ khi trạng thái là draft)
 *     description:
 *       - Cập nhật thông tin hợp đồng
 *       - Cập nhật snapshot điều khoản (terms)
 *       - Cập nhật nội quy (regulations)
 *       - Cập nhật thông tin bên A
 *       - Các trường không gửi sẽ giữ nguyên
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *               A:
 *                 type: object
 *                 description: Thông tin bên A (chủ trọ)
 *                 properties:
 *                   name: { type: string }
 *                   dob: { type: string, format: date }
 *                   phone: { type: string }
 *                   permanentAddress: { type: string }
 *                   email: { type: string }
 *
 *               contract:
 *                 type: object
 *                 properties:
 *                   no: { type: string }
 *                   price: { type: number }
 *                   deposit: { type: number }
 *                   signDate: { type: string, format: date }
 *                   startDate: { type: string, format: date }
 *                   endDate: { type: string, format: date }
 *                   signPlace: { type: string }
 *
 *               terms:
 *                 type: array
 *                 description: Danh sách snapshot điều khoản (ghi đè hoàn toàn)
 *                 items:
 *                   type: object
 *                   required: [name, description]
 *                   properties:
 *                     name: { type: string }
 *                     description: { type: string }
 *                     order: { type: number }
 *
 *               regulations:
 *                 type: array
 *                 description: Danh sách snapshot nội quy (ghi đè hoàn toàn)
 *                 items:
 *                   type: object
 *                   required: [title, description]
 *                   properties:
 *                     title: { type: string }
 *                     description: { type: string }
 *                     effectiveFrom: { type: string, format: date }
 *                     order: { type: number }
 *
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/sign-landlord:
 *   post:
 *     summary: Lưu chữ ký của chủ trọ và đánh dấu đã ký bởi chủ trọ
 *     description: |
 *       Lưu `signatureUrl` (URL ảnh/chữ ký) cho hợp đồng và chuyển trạng thái sang `signed_by_landlord`.
 *       Trước khi ký sẽ validate các trường `required` theo template; nếu thiếu sẽ trả về 422 với chi tiết missing fields.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của contract cần ký
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signatureUrl
 *             properties:
 *               signatureUrl:
 *                 type: string
 *                 example: https://cdn.example.com/signatures/landlord-xx.png
 *     responses:
 *       200:
 *         description: Đã lưu chữ ký và cập nhật trạng thái
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: signed_by_landlord
 *       400:
 *         description: Thiếu signatureUrl hoặc lỗi yêu cầu
 *       404:
 *         description: Contract không tìm thấy
 *       422:
 *         description: Thiếu dữ liệu bắt buộc theo template (trả về danh sách field thiếu)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                   example: VALIDATION_REQUIRED_MISSING
 *                 missing:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                       pdfField:
 *                         type: string
 *                       type:
 *                         type: string
 */

/**
 * @swagger
 * /landlords/contracts/{id}/send-to-tenant:
 *   post:
 *     summary: Gửi hợp đồng nội bộ tới tenant (change status -> sent_to_tenant)
 *     description: |
 *       Gửi hợp đồng cho tenant sau khi chủ trọ đã ký. Kiểm tra validate required lần cuối trước khi gửi.
 *       Chỉ cho phép khi status đã ở `ready_for_sign` hoặc `signed_by_landlord`.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của contract cần gửi
 *     responses:
 *       200:
 *         description: Đã gửi hợp đồng trong hệ thống
 *       400:
 *         description: Trạng thái hiện tại không cho phép gửi hoặc lỗi yêu cầu
 *       404:
 *         description: Contract không tìm thấy
 *       422:
 *         description: Thiếu dữ liệu bắt buộc theo template
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   get:
 *     summary: Xem chi tiết hợp đồng (landlord/staff)
 *     description: Lấy chi tiết hợp đồng, kèm snapshot term/regulation (read-only).
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của contract
 *     responses:
 *       200:
 *         description: Trả về chi tiết hợp đồng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 contactId:
 *                   type: string
 *                 landlordId:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *                 buildingId:
 *                   type: string
 *                 roomId:
 *                   type: string
 *                 templateId:
 *                   type: string
 *                 A:
 *                   type: object
 *                 B:
 *                   type: object
 *                 contract:
 *                   type: object
 *                 room:
 *                   type: object
 *                 termIds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                 regulationIds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       effectiveFrom:
 *                         type: string
 *                         format: date
 *                 status:
 *                   type: string
 *       404:
 *         description: Contract không tìm thấy
 */

router.post(
  "/from-contact",
  checkAuthorize("landlord", "staff"),

  contractController.createFromContact
);
router.put(
  "/:id",
  checkAuthorize("landlord", "staff"),

  contractController.updateData
);
router.post(
  "/:id/sign-landlord",
  checkAuthorize("landlord", "staff"),

  contractController.signByLandlord
);
router.post(
  "/:id/send-to-tenant",
  checkAuthorize("landlord", "staff"),

  contractController.sendToTenant
);
router.get(
  "/:id",
  checkAuthorize("landlord", "staff"),

  contractController.getDetail
);
router.get(
  "/",
  checkAuthorize("landlord", "staff"),

  contractController.listMine
);

module.exports = router;
