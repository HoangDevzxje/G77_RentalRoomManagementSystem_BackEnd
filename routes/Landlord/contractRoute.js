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
 *     summary: Lấy danh sách hợp đồng của chủ trọ
 *     description:
 *       Trả về danh sách hợp đồng mà user hiện tại là landlord (landlordId).
 *       Hỗ trợ phân trang, lọc theo trạng thái và tìm kiếm theo số hợp đồng (contract.no).
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed]
 *         description: Lọc theo trạng thái hợp đồng
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Từ khóa tìm kiếm (hiện tại áp dụng cho số hợp đồng - contract.no)
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại (bắt đầu từ 1)
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số bản ghi mỗi trang
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
 *                       tenantId:
 *                         type: object
 *                         properties:
 *                           email: { type: string }
 *                           userInfo:
 *                             type: object
 *                             properties:
 *                               fullName: { type: string }
 *                               phoneNumber: { type: string }
 *                       contract:
 *                         type: object
 *                         properties:
 *                           no: { type: string }
 *                           startDate: { type: string, format: date }
 *                           endDate: { type: string, format: date }
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       400:
 *         description: Lỗi truy vấn
 */

/**
 * @swagger
 * /landlords/contracts/from-contact:
 *   post:
 *     summary: Tạo hợp đồng nháp từ yêu cầu liên hệ (Contact)
 *     description: |
 *       Tạo một hợp đồng **draft** từ 1 yêu cầu liên hệ (Contact):
 *       - Nếu Contact đã có contractId trỏ tới hợp đồng **chưa bị xóa** → trả về hợp đồng đó (`alreadyCreated = true`).
 *       - Nếu phòng đã có 1 hợp đồng đang xử lý (draft/sent_to_tenant/signed_by_tenant/signed_by_landlord) → trả về lỗi 400, kèm thông tin hợp đồng xung đột.
 *       - Nếu chưa có, hệ thống sẽ:
 *         - Lấy ContractTemplate (nếu có) → snapshot terms & regulations vào hợp đồng
 *         - Tự prefill thông tin bên A/B và giá phòng
 *         - Tạo Contract ở trạng thái `draft`
 *         - Gán `contact.contractId = contract._id`
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
 *                 example: "67201df5c1234ab987654321"
 *     responses:
 *       200:
 *         description: Tạo mới hoặc trả về hợp đồng đã tồn tại từ Contact này
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alreadyCreated:
 *                   type: boolean
 *                   description: |
 *                     - `true`: Contact này đã có hợp đồng (chưa bị xóa), trả về contract cũ.
 *                     - `false`: Vừa tạo hợp đồng mới từ Contact này.
 *                   example: false
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Lỗi dữ liệu hoặc phòng đã có hợp đồng đang xử lý
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               oneOf:
 *                 - description: Thiếu contactId hoặc lỗi validate khác
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Thiếu contactId"
 *                 - description: Phòng đã có hợp đồng đang xử lý
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Phòng này hiện đã có một hợp đồng đang xử lý. Vui lòng hoàn tất hoặc hủy hợp đồng đó trước khi tạo hợp đồng mới."
 *                     conflictContractId:
 *                       type: string
 *                       example: "6915aa921f76ddc90308da5f"
 *                     conflictStatus:
 *                       type: string
 *                       example: "sent_to_tenant"
 *                     conflictContractNo:
 *                       type: string
 *                       nullable: true
 *                       example: "HĐ-2025-001"
 *       404:
 *         description: Không tìm thấy Contact phù hợp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Không tìm thấy yêu cầu liên hệ"
 */

/**
 * @swagger
 * /landlords/contracts/{id}:
 *   put:
 *     summary: Cập nhật nội dung hợp đồng (chỉ khi đang ở trạng thái draft)
 *     description:
 *       Chủ trọ cập nhật thông tin bên A, block "contract", danh sách điều khoản (terms) và nội quy (regulations).
 *       Chỉ cho phép khi hợp đồng đang ở trạng thái `draft`. Không cho sửa tenantId, roomId, buildingId,...
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
 *                 description: Thông tin bên A (chủ trọ), theo personSchema
 *                 properties:
 *                   name: { type: string }
 *                   dob: { type: string, format: date }
 *                   cccd: { type: string }
 *                   cccdIssuedDate: { type: string, format: date }
 *                   cccdIssuedPlace: { type: string }
 *                   permanentAddress: { type: string }
 *                   phone: { type: string }
 *                   email: { type: string }
 *               contract:
 *                 type: object
 *                 description: Thông tin chung của hợp đồng
 *                 properties:
 *                   no: { type: string }
 *                   price: { type: number }
 *                   deposit: { type: number }
 *                   signDate: { type: string, format: date }
 *                   startDate: { type: string, format: date }
 *                   endDate: { type: string, format: date }
 *                   signPlace: { type: string }
 *                   paymentCycleMonths:
 *                     type: integer
 *                     description: Số tháng mỗi kỳ thanh toán (ví dụ 1 = tháng / lần)
 *                     example: 1
 *               terms:
 *                 type: array
 *                 description: Danh sách điều khoản snapshot trên hợp đồng
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     description: { type: string }
 *                     order: { type: integer }
 *               regulations:
 *                 type: array
 *                 description: Danh sách nội quy snapshot trên hợp đồng
 *                 items:
 *                   type: object
 *                   properties:
 *                     title: { type: string }
 *                     description: { type: string }
 *                     effectiveFrom: { type: string, format: date }
 *                     order: { type: integer }
 *     responses:
 *       200:
 *         description: Cập nhật thành công, trả về contract sau khi cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc không ở trạng thái draft
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/sign-landlord:
 *   post:
 *     summary: Chủ trọ ký hợp đồng (bên A)
 *     description:
 *       Lưu chữ ký của chủ trọ (landlord).
 *       Chỉ cho phép ký khi hợp đồng đang ở trạng thái `draft`.
 *       Sau khi ký, trạng thái chuyển thành `signed_by_landlord`.
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
 *         description: Ký thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Thiếu chữ ký hoặc không ở trạng thái draft
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/send-to-tenant:
 *   post:
 *     summary: Gửi hợp đồng đã ký (bên A) cho người thuê xem/ký
 *     description:
 *       Chỉ cho phép khi hợp đồng đang ở trạng thái `signed_by_landlord`.
 *       Sau khi gửi, trạng thái chuyển sang `sent_to_tenant`.
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
 *         description: Hợp đồng chưa được landlord ký hoặc trạng thái không phù hợp
 *       404:
 *         description: Không tìm thấy hợp đồng
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

/**
 * @swagger
 * /landlords/contracts/{id}/confirm-move-in:
 *   post:
 *     summary: Xác nhận người thuê đã vào ở (sau khi hợp đồng completed)
 *     description:
 *       Chỉ cho phép khi hợp đồng ở trạng thái `completed`.
 *       Endpoint sẽ kiểm tra số người ở (tenant chính + roommates) không vượt quá `room.maxTenants`,
 *       sau đó cập nhật Room (status = rented, currentTenantIds, currentContractId).
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
 *         description: Xác nhận vào ở thành công
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
 *         description: Hợp đồng chưa completed hoặc số lượng người ở vượt quá giới hạn
 *       404:
 *         description: Không tìm thấy hợp đồng hoặc phòng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/approve-extension:
 *   post:
 *     summary: Chủ trọ phê duyệt yêu cầu gia hạn hợp đồng
 *     description: |
 *       Landlord duyệt yêu cầu gia hạn từ tenant.
 *       Hệ thống sẽ:
 *       - Ghi lại lịch sử gia hạn trong `extensions[]`
 *       - Cập nhật `contract.endDate` bằng `renewalRequest.requestedEndDate`
 *       - Cập nhật `renewalRequest.status = "approved"`
 *     tags: [Landlord Contracts]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: Đồng ý gia hạn thêm 6 tháng với giá thuê cũ.
 *                 description: Ghi chú nội bộ hoặc lý do phê duyệt (sẽ lưu trong extension)
 *     responses:
 *       200:
 *         description: Phê duyệt gia hạn thành công, trả về contract đã cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã duyệt gia hạn hợp đồng
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Không có yêu cầu gia hạn pending hoặc trạng thái hợp đồng không cho phép
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /landlords/contracts/{id}/reject-extension:
 *   post:
 *     summary: Chủ trọ từ chối yêu cầu gia hạn hợp đồng
 *     description: |
 *       Landlord từ chối yêu cầu gia hạn từ tenant.
 *       Hệ thống sẽ:
 *       - Cập nhật `renewalRequest.status = "rejected"`
 *       - Lưu lý do từ chối (nếu có) vào `renewalRequest.rejectedReason`
 *     tags: [Landlord Contracts]
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Phòng đã có kế hoạch sửa chữa, không thể gia hạn thêm.
 *                 description: Lý do từ chối gia hạn (hiển thị cho tenant)
 *     responses:
 *       200:
 *         description: Từ chối yêu cầu gia hạn thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã từ chối yêu cầu gia hạn
 *                 renewalRequest:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: rejected
 *                     rejectedReason:
 *                       type: string
 *                     processedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Không có yêu cầu gia hạn pending
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /landlords/contracts/{id}:
 *   delete:
 *     summary: Xóa hợp đồng (soft delete) – chỉ cho phép khi đang là bản nháp
 *     description: Đánh dấu isDeleted = true, deletedAt = now. Nếu hợp đồng được tạo từ 1 Contact thì xóa luôn liên kết contact.contractId.
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
 *         description: Xóa hợp đồng nháp thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã xóa hợp đồng nháp
 *                 id:
 *                   type: string
 *       400:
 *         description: Hợp đồng không ở trạng thái nháp hoặc lỗi dữ liệu
 *       404:
 *         description: Không tìm thấy hợp đồng
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
router.post(
  "/:id/confirm-move-in",
  checkAuthorize("landlord", "staff"),

  contractController.confirmMoveIn
);

router.post(
  "/:id/approve-extension",
  checkAuthorize("landlord", "staff"),
  contractController.approveExtension
);

router.post(
  "/:id/reject-extension",
  checkAuthorize("landlord", "staff"),
  contractController.rejectExtension
);

router.delete(
  "/contracts/:id",
  checkAuthorize("landlord"),
  contractController.deleteContract
);

module.exports = router;
