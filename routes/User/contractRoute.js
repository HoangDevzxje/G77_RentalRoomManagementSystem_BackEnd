const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const contractController = require("../../controllers/User/ContractController");

/**
 * @swagger
 * tags:
 *   - name: Resident Contracts
 *     description: Quản lý hợp đồng của người thuê (tenant / resident)
 */

/**
 * @swagger
 * /contracts:
 *   get:
 *     summary: Lấy danh sách hợp đồng của người thuê
 *     description: Trả về danh sách hợp đồng mà người thuê là bên B (tenantId)
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed]
 *         description: Lọc theo trạng thái hợp đồng
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           example: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng của người thuê
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
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           roomNumber: { type: string }
 *                       contract:
 *                         type: object
 *                         properties:
 *                           no: { type: string }
 *                           startDate: { type: string, format: date }
 *                           endDate: { type: string, format: date }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *       400:
 *         description: Lỗi truy vấn
 */

/**
 * @swagger
 * /contracts/{id}:
 *   get:
 *     summary: Lấy chi tiết hợp đồng của người thuê
 *     description: Trả về toàn bộ thông tin hợp đồng, bên A (landlord), roommate, danh sách nội thất trong phòng,...
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thông tin chi tiết hợp đồng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 status: { type: string }
 *                 buildingId:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     address: { type: string }
 *                 roomId:
 *                   type: object
 *                   properties:
 *                     roomNumber: { type: string }
 *                     price: { type: number }
 *                     maxTenants: { type: number }
 *                 landlordId:
 *                   type: object
 *                   properties:
 *                     email: { type: string }
 *                     userInfo:
 *                       type: object
 *                       properties:
 *                         fullName: { type: string }
 *                         phoneNumber: { type: string }
 *                         address: { type: string }
 *                 contract:
 *                   type: object
 *                 furnitures:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       code: { type: string }
 *                       category: { type: string }
 *                       quantity: { type: integer }
 *                       condition: { type: string }
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /contracts/{id}/sign:
 *   post:
 *     summary: Người thuê ký hợp đồng
 *     description: Cập nhật chữ ký của người thuê. Nếu landlord đã ký thì chuyển sang completed.
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
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
 *                 example: https://cdn.example.com/sign/tenant-123.png
 *     responses:
 *       200:
 *         description: Ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Thiếu chữ ký hoặc trạng thái không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /contracts/{id}:
 *   patch:
 *     summary: Người thuê cập nhật thông tin hợp đồng (Bên B, xe, roommates)
 *     description: Cho phép người thuê chỉnh sửa thông tin cá nhân, xe, danh sách người ở cùng (bằng email)
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               B:
 *                 type: object
 *                 description: Thông tin bên B (người thuê chính)
 *                 properties:
 *                   name: { type: string }
 *                   dob: { type: string, format: date }
 *                   cccd: { type: string }
 *                   phone: { type: string }
 *                   permanentAddress: { type: string }
 *               bikes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     bikeNumber: { type: string }
 *                     color: { type: string }
 *                     brand: { type: string }
 *               roommateEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: example@gmail.com
 *     responses:
 *       200:
 *         description: Cập nhật thông tin thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc vượt quá số lượng người ở
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /contracts/accounts/search-by-email:
 *   get:
 *     summary: Tìm tài khoản roommate bằng email
 *     description: Tìm kiếm tài khoản "resident" đang hoạt động để thêm làm người ở cùng, tránh trùng email của chính tenant.
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           example: roommate@example.com
 *     responses:
 *       200:
 *         description: Thông tin tài khoản tìm thấy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 email: { type: string }
 *                 fullName: { type: string }
 *                 phoneNumber: { type: string }
 *                 dob: { type: string, format: date }
 *                 address: { type: string }
 *       400:
 *         description: Thiếu email hoặc email của chính tenant
 *       404:
 *         description: Không tìm thấy tài khoản phù hợp
 */
router.get(
  "/accounts/search-by-email",
  checkAuthorize("resident"),
  contractController.searchAccountByEmail
);

// GET /contracts
router.get("/", checkAuthorize("resident"), contractController.listMyContracts);

// GET /contracts/:id
router.get(
  "/:id",
  checkAuthorize("resident"),
  contractController.getMyContract
);

// PATCH /contracts/:id
router.patch(
  "/:id",
  checkAuthorize("resident"),
  contractController.updateMyData
);

// POST /contracts/:id/sign
router.post(
  "/:id/sign",
  checkAuthorize("resident"),
  contractController.signByTenant
);
module.exports = router;
