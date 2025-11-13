const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const contractController = require("../../controllers/Landlord/ContractController");
const checkSubscription = require("../../middleware/checkSubscription");
/**
 * @swagger
 * tags:
 *   - name: Landlord Contracts
 *     description: Quản lý hợp đồng (landlord / staff)
 */

/**
 * @swagger
 * /landlords/contracts:
 *   get:
 *     summary: Danh sách hợp đồng của landlord (có phân trang & filter)
 *     description: Lấy danh sách hợp đồng thuộc landlord. Hỗ trợ lọc theo trạng thái và phân trang.
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
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Trang hiện tại (mặc định 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *         description: Số item mỗi trang (mặc định 20)
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng của landlord (kèm pagination)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string }
 *                       status: { type: string }
 *                       contract:
 *                         type: object
 *                         properties:
 *                           no: { type: string }
 *                           startDate: { type: string, format: date }
 *                           endDate: { type: string, format: date }
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           name: { type: string }
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           roomNumber: { type: string }
 *                       tenantId:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           email: { type: string }
 *                           userInfo:
 *                             type: object
 *                             properties:
 *                               fullName: { type: string }
 *                               phoneNumber: { type: string }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *       400:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/contracts/from-contact:
 *   post:
 *     summary: Tạo hợp đồng draft từ Contact
 *     description: Nếu Contact đã có contract, trả về contract cũ. Nếu chưa, tạo contract draft có sẵn snapshot terms/regulations.
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
 *                 example: 67201df5c1234ab987654321
 *     responses:
 *       200:
 *         description: Contract draft được trả về
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Thiếu contactId hoặc lỗi dữ liệu
 *       404:
 *         description: Không tìm thấy Contact hoặc Template
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
 *     summary: Lưu chữ ký của chủ trọ (landlord) cho hợp đồng
 *     description: Lưu `signatureUrl`. Nếu tenant đã ký trước đó thì chuyển trạng thái sang `completed`, ngược lại set `signed_by_landlord`.
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
 *             required:
 *               - signatureUrl
 *             properties:
 *               signatureUrl:
 *                 type: string
 *                 example: https://cdn.example.com/sign/landlord-123.png
 *     responses:
 *       200:
 *         description: Đã lưu chữ ký và cập nhật trạng thái
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Thiếu signatureUrl hoặc trạng thái không hợp lệ để ký
 *       404:
 *         description: Contract không tìm thấy
 */

/**
 * @swagger
 * /landlords/contracts/{id}/send-to-tenant:
 *   post:
 *     summary: Gửi hợp đồng đến tenant (change status -> sent_to_tenant)
 *     description: Gửi hợp đồng để tenant xem/ký. Chỉ cho phép khi hợp đồng đang ở trạng thái hợp lệ (draft hoặc signed_by_landlord).
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Đã gửi hợp đồng cho tenant
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Trạng thái hiện tại không cho phép gửi
 *       404:
 *         description: Contract không tìm thấy
 */

/**
 * @swagger
 * /landlords/contracts/{id}/confirm-move-in:
 *   post:
 *     summary: Xác nhận người thuê đã vào ở (update room status)
 *     description: Sau khi hợp đồng `completed`, landlord xác nhận tenant vào ở. Endpoint sẽ cập nhật trạng thái phòng, danh sách tenant trong room.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xác nhận vào ở thành công (trả về trạng thái phòng & tenant list)
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
 *         description: Không thể xác nhận khi contract chưa hoàn tất hoặc số lượng tenant vượt quá phòng
 *       404:
 *         description: Contract hoặc Room không tìm thấy
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   get:
 *     summary: Lấy chi tiết hợp đồng (landlord/staff)
 *     description: Trả về chi tiết hợp đồng kèm snapshot terms/regulations và danh sách nội thất (furnitures) trong phòng.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chi tiết hợp đồng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 landlordId: { type: string }
 *                 tenantId: { type: string }
 *                 buildingId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     name: { type: string }
 *                     address: { type: string }
 *                 roomId:
 *                   type: object
 *                   properties:
 *                     _id: { type: string }
 *                     roomNumber: { type: string }
 *                     price: { type: number }
 *                 A:
 *                   type: object
 *                 B:
 *                   type: object
 *                 contract:
 *                   type: object
 *                 terms:
 *                   type: array
 *                   items:
 *                     type: object
 *                 regulations:
 *                   type: array
 *                   items:
 *                     type: object
 *                 furnitures:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Contract không tìm thấy
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
