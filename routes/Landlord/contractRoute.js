const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const contractController = require("../../controllers/Landlord/ContractController");
const checkSubscription = require("../../middleware/checkSubscription");
/**
 * @swagger
 * tags:
 *   - name: Landlord Contracts
 *     description: Quản lý hợp đồng cho chủ trọ và nhân viên (Landlord / Staff)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Person:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Nguyễn Văn A" }
 *         dob: { type: string, format: date, example: "1995-05-12" }
 *         cccd: { type: string, example: "079203000111" }
 *         cccdIssuedDate: { type: string, format: date }
 *         cccdIssuedPlace: { type: string, example: "TP.HCM" }
 *         permanentAddress: { type: string, example: "123 Lê Lợi, Quận 1, TP.HCM" }
 *         phone: { type: string, example: "0909123456" }
 *         email: { type: string, example: "tenant@example.com" }
 *
 *     Bike:
 *       type: object
 *       properties:
 *         bikeNumber: { type: string, example: "59A1-12345" }
 *         color: { type: string, example: "Đen" }
 *         brand: { type: string, example: "Honda" }
 *
 *     ContractTerm:
 *       type: object
 *       properties:
 *         name: { type: string }
 *         description: { type: string }
 *         order: { type: integer }
 *
 *     ContractRegulation:
 *       type: object
 *       properties:
 *         title: { type: string }
 *         description: { type: string }
 *         effectiveFrom: { type: string, format: date }
 *         order: { type: integer }
 *
 *     Contract:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         landlordId: { type: string }
 *         tenantId: { type: string }
 *         roommateIds:
 *           type: array
 *           items: { type: string }
 *         buildingId: { type: string }
 *         roomId: { type: string }
 *         contactId: { type: string }
 *         templateId: { type: string }
 *         A:
 *           $ref: '#/components/schemas/Person'
 *         B:
 *           $ref: '#/components/schemas/Person'
 *         occupants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Person'
 *         bikes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Bike'
 *         contract:
 *           type: object
 *           properties:
 *             no: { type: string }
 *             price: { type: number }
 *             deposit: { type: number }
 *             signDate: { type: string, format: date }
 *             startDate: { type: string, format: date }
 *             endDate: { type: string, format: date }
 *             signPlace: { type: string }
 *         terms:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ContractTerm'
 *         regulations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ContractRegulation'
 *         landlordSignatureUrl: { type: string }
 *         tenantSignatureUrl: { type: string }
 *         status:
 *           type: string
 *           enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed]
 *         sentToTenantAt: { type: string, format: date-time }
 *         completedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /landlords/contracts:
 *   get:
 *     summary: Lấy danh sách hợp đồng của landlord
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed]
 *         description: Lọc theo trạng thái hợp đồng
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *         description: Trang hiện tại
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *         description: Số hợp đồng mỗi trang
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng của landlord
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Contract'
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *       400:
 *         description: Lỗi truy vấn
 */

/**
 * @swagger
 * /landlords/contracts/from-contact:
 *   post:
 *     summary: Tạo hợp đồng draft từ contact (yêu cầu thuê phòng)
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contactId]
 *             properties:
 *               contactId:
 *                 type: string
 *                 example: 6720abcd1234ef567890ab12
 *     responses:
 *       200:
 *         description: Contract được tạo hoặc đã tồn tại
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Thiếu contactId hoặc lỗi xử lý
 *       404:
 *         description: Không tìm thấy Contact
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   put:
 *     summary: Cập nhật dữ liệu hợp đồng (chỉ khi đang draft)
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               A:
 *                 $ref: '#/components/schemas/Person'
 *               contract:
 *                 type: object
 *                 properties:
 *                   no: { type: string }
 *                   price: { type: number }
 *                   deposit: { type: number }
 *                   startDate: { type: string, format: date }
 *                   endDate: { type: string, format: date }
 *                   signPlace: { type: string }
 *               termIds:
 *                 type: array
 *                 items: { type: string }
 *               regulationIds:
 *                 type: array
 *                 items: { type: string }
 *               terms:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ContractTerm'
 *               regulations:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ContractRegulation'
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/sign-landlord:
 *   post:
 *     summary: Landlord ký hợp đồng
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signatureUrl]
 *             properties:
 *               signatureUrl:
 *                 type: string
 *                 example: https://cdn.example.com/signs/landlord-001.png
 *     responses:
 *       200:
 *         description: Ký thành công
 *       400:
 *         description: Thiếu signatureUrl hoặc trạng thái không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/send-to-tenant:
 *   post:
 *     summary: Gửi hợp đồng đến người thuê (chuyển trạng thái -> sent_to_tenant)
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã gửi hợp đồng thành công
 *       400:
 *         description: Trạng thái hiện tại không cho phép gửi
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/confirm-move-in:
 *   post:
 *     summary: Xác nhận người thuê đã vào ở
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xác nhận vào ở thành công, cập nhật trạng thái phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 roomStatus: { type: string }
 *                 currentTenantIds:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Contract chưa hoàn tất hoặc vượt quá maxTenants
 *       404:
 *         description: Không tìm thấy hợp đồng hoặc phòng
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   get:
 *     summary: Lấy chi tiết hợp đồng (bao gồm nội thất)
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thông tin chi tiết hợp đồng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

router.get("/", checkAuthorize("landlord"), contractController.listMine);
router.post(
  "/from-contact",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.createFromContact
);
router.put(
  "/:id",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.updateData
);
router.post(
  "/:id/sign-landlord",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.signByLandlord
);
router.post(
  "/:id/send-to-tenant",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.sendToTenant
);
router.post(
  "/:id/confirm-move-in",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.confirmMoveIn
);
router.get(
  "/:id",
  checkAuthorize("landlord", "staff"),
  checkSubscription,
  contractController.getDetail
);

module.exports = router;
