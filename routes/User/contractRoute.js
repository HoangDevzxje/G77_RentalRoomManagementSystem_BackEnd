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
 *     description: Trả về danh sách hợp đồng mà user hiện tại là tenantId (bên B).
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
 *     description: Trả về toàn bộ thông tin hợp đồng, bên A (landlord), bên B (tenant chính), danh sách roommates (người ở cùng), danh sách nội thất,...
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
 *                 A:
 *                   type: object
 *                   description: Thông tin bên A – chủ trọ
 *                   properties:
 *                     name: { type: string }
 *                     dob: { type: string, format: date }
 *                     cccd: { type: string }
 *                     phone: { type: string }
 *                     permanentAddress: { type: string }
 *                     email: { type: string }
 *                 B:
 *                   type: object
 *                   description: Thông tin bên B – người thuê chính
 *                   properties:
 *                     name: { type: string }
 *                     dob: { type: string, format: date }
 *                     cccd: { type: string }
 *                     phone: { type: string }
 *                     permanentAddress: { type: string }
 *                     email: { type: string }
 *                 roommates:
 *                   type: array
 *                   description: Danh sách người ở cùng (không bắt buộc có tài khoản)
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       dob: { type: string, format: date }
 *                       cccd: { type: string }
 *                       phone: { type: string }
 *                       permanentAddress: { type: string }
 *                       email: { type: string }
 *                 bikes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       bikeNumber: { type: string }
 *                       color: { type: string }
 *                       brand: { type: string }
 *                 contract:
 *                   type: object
 *                   properties:
 *                     no: { type: string }
 *                     price: { type: number }
 *                     deposit: { type: number }
 *                     signDate: { type: string, format: date }
 *                     startDate: { type: string, format: date }
 *                     endDate: { type: string, format: date }
 *                     signPlace: { type: string }
 *                     paymentCycleMonths:
 *                       type: number
 *                       description: Số tháng đóng tiền một lần (1 = 1 tháng/lần, 3 = 3 tháng/lần, ...)
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
 *     summary: Tenant ký hợp đồng (bên B)
 *     description: |
 *       Người thuê (tenant) ký hợp đồng.
 *
 *       **Rule trạng thái:**
 *       - Cho phép ký khi:
 *         - `sent_to_tenant`     → Landlord chưa ký, tenant ký trước
 *         - `signed_by_landlord` → Landlord đã ký trước, tenant ký để hoàn tất
 *
 *       **Kết quả:**
 *       - Nếu landlord chưa ký:
 *         - Trạng thái sau khi ký: `signed_by_tenant`
 *       - Nếu landlord đã ký:
 *         - Trạng thái sau khi ký: `completed`
 *     tags: [Resident Contracts]
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
 *                 example: https://cdn.example.com/sign/tenant-123.png
 *     responses:
 *       200:
 *         description: Tenant ký hợp đồng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed]
 *       400:
 *         description: Thiếu chữ ký hoặc trạng thái không hợp lệ để ký
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /contracts/{id}:
 *   patch:
 *     summary: Người thuê cập nhật thông tin hợp đồng (Bên B, xe, roommates)
 *     description: Cho phép người thuê chỉnh sửa thông tin cá nhân (Bên B), danh sách xe, và danh sách người ở cùng (roommates) nhập thủ công theo personSchema.
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
 *                   cccdIssuedDate: { type: string, format: date }
 *                   cccdIssuedPlace: { type: string }
 *                   phone: { type: string }
 *                   permanentAddress: { type: string }
 *                   email: { type: string }
 *               bikes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     bikeNumber: { type: string }
 *                     color: { type: string }
 *                     brand: { type: string }
 *               roommates:
 *                 type: array
 *                 description: Danh sách người ở cùng nhập thủ công
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     dob: { type: string, format: date }
 *                     cccd: { type: string }
 *                     cccdIssuedDate: { type: string, format: date }
 *                     cccdIssuedPlace: { type: string }
 *                     phone: { type: string }
 *                     permanentAddress: { type: string }
 *                     email: { type: string }
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

/**
 * @swagger
 * /contracts/{id}/request-extend:
 *   post:
 *     summary: Người thuê gửi yêu cầu gia hạn hợp đồng
 *     description:
 *       Cho phép người thuê gửi yêu cầu gia hạn khi hợp đồng đang ở trạng thái `completed`
 *       và còn trong khoảng thời gian cho phép (ví dụ ≤ 60 ngày trước ngày hết hạn).
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của hợp đồng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - months
 *             properties:
 *               months:
 *                 type: integer
 *                 minimum: 1
 *                 example: 6
 *                 description: Số tháng muốn gia hạn thêm
 *               note:
 *                 type: string
 *                 example: "Em muốn gia hạn thêm 6 tháng vì vẫn tiếp tục học ở đây."
 *     responses:
 *       200:
 *         description: Gửi yêu cầu gia hạn thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã gửi yêu cầu gia hạn hợp đồng
 *                 renewalRequest:
 *                   type: object
 *                   properties:
 *                     months: { type: integer, example: 6 }
 *                     requestedEndDate: { type: string, format: date-time }
 *                     note: { type: string }
 *                     status:
 *                       type: string
 *                       example: pending
 *                     requestedAt: { type: string, format: date-time }
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc không đủ điều kiện gửi yêu cầu
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /contracts/upcoming-expire:
 *   get:
 *     summary: Hợp đồng sắp hết hạn của người thuê
 *     description: |
 *       Trả về danh sách hợp đồng của tenant đang đăng nhập, có ngày kết thúc trong vòng N ngày tới (mặc định 30 ngày).
 *       Chỉ lấy hợp đồng ở trạng thái `completed`.
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: days
 *         in: query
 *         schema:
 *           type: integer
 *           example: 30
 *         description: Số ngày tới để kiểm tra hợp đồng sắp hết hạn (>= 1)
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
 *         description: Danh sách hợp đồng sắp hết hạn
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
 *                           address: { type: string }
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           roomNumber: { type: string }
 *                       contract:
 *                         type: object
 *                         properties:
 *                           no: { type: string }
 *                           startDate: { type: string, format: date-time }
 *                           endDate: { type: string, format: date-time }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 days: { type: integer }
 *       400:
 *         description: Lỗi truy vấn
 */

/**
 * @swagger
 * /contracts/{id}/download:
 *   get:
 *     summary: Tải PDF hợp đồng của cư dân
 *     description: |
 *       Cư dân (resident) tải file PDF hợp đồng của chính mình.
 *
 *       Điều kiện:
 *       - Hợp đồng có `tenantId` = tài khoản hiện tại
 *       - Trạng thái hợp đồng là `completed`
 *     tags: [Resident Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hợp đồng cần tải
 *     responses:
 *       200:
 *         description: File PDF hợp đồng
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Hợp đồng chưa completed hoặc request không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng tương ứng với cư dân hiện tại
 *       500:
 *         description: Lỗi server khi xuất PDF
 */
router.get(
  "/accounts/search-by-email",
  checkAuthorize("resident"),
  contractController.searchAccountByEmail
);
router.get(
  "/upcoming-expire",
  checkAuthorize("resident"),
  contractController.listUpcomingExpire
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

router.post(
  "/:id/request-extend",
  checkAuthorize("resident"),
  contractController.requestExtend
);
router.get(
  "/:id/download",
  checkAuthorize("resident"),
  contractController.residentDownloadMyContractPdf
);

module.exports = router;
