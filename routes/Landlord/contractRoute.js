const router = require("express").Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const contractController = require("../../controllers/Landlord/ContractController");
const checkSubscription = require("../../middleware/checkSubscription");
const { PERMISSIONS } = require("../../constants/permissions");
const {
  checkStaffPermission,
} = require("../../middleware/checkStaffPermission");

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
 *     summary: Lấy danh sách hợp đồng của landlord hoặc staff thuộc landlord
 *     description: |
 *       Trả về danh sách hợp đồng dựa trên quyền truy cập của user:
 *       - Nếu là landlord → xem toàn bộ hợp đồng của mình.
 *       - Nếu là staff → chỉ xem hợp đồng thuộc các tòa nhà được phân quyền (assignedBuildingIds).
 *
 *       Hỗ trợ:
 *       - Lọc theo trạng thái hợp đồng.
 *       - Lọc theo tình trạng xác nhận vào ở (moveInConfirmedAt).
 *       - Tìm kiếm theo số hợp đồng (contract.no).
 *       - Phân trang.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [draft, sent_to_tenant, signed_by_tenant, signed_by_landlord, completed, voided, terminated]
 *         description: Lọc theo trạng thái hợp đồng.
 *
 *       - name: moveIn
 *         in: query
 *         schema:
 *           type: string
 *           enum: [confirmed, not_confirmed]
 *         description: |
 *           Lọc theo trạng thái xác nhận vào ở:
 *           - confirmed → moveInConfirmedAt != null
 *           - not_confirmed → moveInConfirmedAt = null
 *
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *         description: |
 *           Lọc theo tòa nhà.
 *           Nếu là staff: chỉ được phép xem nếu buildingId thuộc assignedBuildingIds.
 *
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo số hợp đồng (contract.no).
 *
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại (bắt đầu từ 1).
 *
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Số bản ghi mỗi trang.
 *
 *     responses:
 *       200:
 *         description: Danh sách hợp đồng.
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
 *                       _id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       moveInConfirmedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       sentToTenantAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       buildingId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       roomId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           roomNumber:
 *                             type: string
 *                       tenantId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           userInfo:
 *                             type: object
 *                             properties:
 *                               fullName:
 *                                 type: string
 *                               phoneNumber:
 *                                 type: string
 *                       contract:
 *                         type: object
 *                         properties:
 *                           no:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                             format: date
 *                           endDate:
 *                             type: string
 *                             format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *
 *       400:
 *         description: Lỗi truy vấn.
 *       403:
 *         description: Staff không có quyền xem building này.
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
 *     summary: Landlord ký hợp đồng (bên A)
 *     description: |
 *       Landlord ký hợp đồng từ phía chủ trọ.
 *
 *       **Rule trạng thái:**
 *       - Cho phép ký khi:
 *         - `draft`             → Landlord ký trước, chưa gửi tenant
 *         - `sent_to_tenant`    → Đã gửi tenant, landlord ký trước tenant
 *         - `signed_by_tenant`  → Tenant đã ký, landlord ký để hoàn tất
 *
 *       **Kết quả:**
 *       - Nếu tenant chưa ký:
 *         - Trạng thái sau khi ký: `signed_by_landlord`
 *       - Nếu tenant đã ký trước đó:
 *         - Trạng thái sau khi ký: `completed`
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
 *         description: Đã lưu chữ ký của landlord và cập nhật trạng thái hợp đồng
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
 *         description: Thiếu chữ ký hoặc trạng thái hiện tại không hợp lệ để ký
 *       404:
 *         description: Contract không tìm thấy
 */
/**
 * @swagger
 * /landlords/contracts/{id}/send-to-tenant:
 *   post:
 *     summary: Gửi hợp đồng cho người thuê (tenant)
 *     description: |
 *       Gửi hợp đồng sang cho tenant xem & ký.
 *
 *       **Rule trạng thái:**
 *       - Cho phép gửi khi:
 *         - `draft` (chưa bên nào ký)
 *         - `signed_by_landlord` (landlord đã ký trước)
 *       - Sau khi gọi API này, trạng thái sẽ chuyển thành `sent_to_tenant`.
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
 *         description: Đã gửi hợp đồng cho người thuê
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
 *         description: Không đúng trạng thái để gửi hoặc lỗi dữ liệu
 *       404:
 *         description: Không tìm thấy contract
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
 *     summary: Duyệt yêu cầu gia hạn hợp đồng
 *     description: |
 *       Landlord duyệt yêu cầu gia hạn đang ở trạng thái `pending`.
 *
 *       Hệ thống sẽ:
 *       - Lưu lại lịch sử gia hạn vào `extensions`
 *       - Cập nhật `contract.endDate` = `renewalRequest.requestedEndDate`
 *       - Cập nhật `renewalRequest.status = approved`
 *
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hợp đồng cần duyệt gia hạn
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Đã gia hạn theo đề nghị của bạn thêm 6 tháng."
 *     responses:
 *       200:
 *         description: Duyệt gia hạn thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Đã duyệt gia hạn hợp đồng
 *                 contract:
 *                   type: object
 *                   description: Document hợp đồng sau khi cập nhật
 *       400:
 *         description: Không có yêu cầu gia hạn pending hoặc trạng thái hợp đồng không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/reject-extension:
 *   post:
 *     summary: Từ chối yêu cầu gia hạn hợp đồng
 *     description:
 *       Landlord từ chối yêu cầu gia hạn đang ở trạng thái `pending`.
 *       Hệ thống sẽ cập nhật `renewalRequest.status = rejected` và lưu lý do từ chối.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hợp đồng cần từ chối gia hạn
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Phòng đã có kế hoạch sửa chữa, không thể gia hạn thêm."
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
/**
 * @swagger
 * /landlords/contracts/{id}/void:
 *   post:
 *     summary: Hủy hợp đồng vì nhập sai / không sử dụng nữa (void)
 *     description: Chỉ cho phép khi hợp đồng đang ở trạng thái draft, signed_by_landlord hoặc sent_to_tenant và chưa có chữ ký của người thuê.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của hợp đồng cần hủy
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Nhap sai gia phong, tao hop dong moi"
 *     responses:
 *       200:
 *         description: Hủy hợp đồng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Không thỏa điều kiện để hủy
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /landlords/contracts/{id}/void:
 *   post:
 *     summary: Vô hiệu hợp đồng đã hoàn tất do nhập sai / không sử dụng
 *     description: Chỉ cho phép landlord thực hiện khi hợp đồng ở trạng thái `completed`, `sent_to_tenant` và chưa xác nhận vào ở (chưa có moveInConfirmedAt).
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Nhập sai tiền thuê và ngày bắt đầu, cần làm lại hợp đồng mới"
 *     responses:
 *       200:
 *         description: Vô hiệu hợp đồng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *                 voidedAt: { type: string, format: date-time }
 *       400:
 *         description: Trạng thái không hợp lệ hoặc đã confirm move-in
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

/**
 * @swagger
 * /landlords/contracts/{id}/clone:
 *   post:
 *     summary: Tạo hợp đồng mới (draft) từ hợp đồng cũ
 *     description: Clone hợp đồng ở trạng thái `completed` hoặc `voided` sang một hợp đồng mới ở trạng thái `draft` để sửa lại thông tin và ký lại.
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
 *         description: Tạo hợp đồng mới thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 contractId: { type: string }
 *                 contract:
 *                   $ref: '#/components/schemas/Contract'
 *       400:
 *         description: Không cho phép clone với trạng thái hiện tại
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /landlords/contracts/{id}/terminate:
 *   post:
 *     summary: Chấm dứt hợp đồng trước hạn (terminated)
 *     description:
 *       Chỉ cho phép khi hợp đồng đã ở trạng thái `completed` và đã xác nhận người thuê vào ở (moveInConfirmedAt != null).
 *       Sau khi chấm dứt, phòng sẽ được trả về trạng thái "available" nếu đang gắn với hợp đồng này.
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Người thuê chuyển đi sớm, hai bên thoả thuận chấm dứt hợp đồng trước hạn."
 *               terminatedAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-12-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Chấm dứt hợp đồng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 status: { type: string }
 *                 terminatedAt: { type: string, format: date-time }
 *       400:
 *         description: Trạng thái không hợp lệ để chấm dứt hoặc chưa confirm move-in
 *       404:
 *         description: Không tìm thấy hợp đồng hoặc phòng
 */
/**
 * @swagger
 * /landlords/contracts/renewal-requests:
 *   get:
 *     summary: Lấy danh sách hợp đồng có yêu cầu gia hạn
 *     description:
 *       Trả về danh sách các hợp đồng mà tenant đã gửi yêu cầu gia hạn (renewalRequest),
 *       có thể lọc theo trạng thái và tòa nhà.
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, cancelled]
 *           default: pending
 *         description: Lọc theo trạng thái yêu cầu gia hạn
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà
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
 *         description: Danh sách yêu cầu gia hạn
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
 *                       _id: { type: string, description: "ID hợp đồng" }
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
 *                       contract:
 *                         type: object
 *                         properties:
 *                           endDate: { type: string, format: date-time }
 *                       renewalRequest:
 *                         type: object
 *                         properties:
 *                           months: { type: integer }
 *                           requestedEndDate: { type: string, format: date-time }
 *                           note: { type: string }
 *                           status: { type: string }
 *                           requestedAt: { type: string, format: date-time }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *       400:
 *         description: Lỗi truy vấn
 */
/**
 * @swagger
 * /landlords/contracts/{id}/download:
 *   get:
 *     summary: Tải PDF hợp đồng đã hoàn tất
 *     description: |
 *       Landlord tải file PDF hợp đồng với đầy đủ thông tin:
 *       - Thông tin Bên A, B (snapshot trong contract.A, contract.B)
 *       - Roommates, phương tiện (bikes)
 *       - Thông tin phòng, giá thuê, cọc, thời hạn, chu kỳ thanh toán
 *       - Điều khoản (terms snapshot) và Nội quy (regulations snapshot)
 *
 *       Chỉ cho phép khi trạng thái hợp đồng là `completed`.
 *     tags: [Landlord Contracts]
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
 *         description: Hợp đồng chưa completed hoặc yêu cầu không hợp lệ
 *       404:
 *         description: Không tìm thấy hợp đồng
 *       500:
 *         description: Lỗi server khi tạo PDF
 */
/**
 * @swagger
 * /landlords/contracts/{id}/approve-terminate:
 *   patch:
 *     summary: Duyệt yêu cầu chấm dứt hợp đồng từ tenant
 *     description: |
 *       Landlord duyệt yêu cầu chấm dứt hợp đồng.
 *
 *       **Quy tắc:**
 *       - Chỉ duyệt khi `terminationRequest.status = pending`
 *       - Sau khi duyệt:
 *         - `terminationRequest.status = approved`
 *         - `contract.status = terminated`
 *         - `terminationType = early_termination`
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hợp đồng
 *     responses:
 *       200:
 *         description: Duyệt yêu cầu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã duyệt yêu cầu chấm dứt hợp đồng"
 *                 contractStatus:
 *                   type: string
 *                   example: "terminated"
 *       400:
 *         description: Không có yêu cầu chấm dứt đang chờ
 *       404:
 *         description: Không tìm thấy hợp đồng
 */
/**
 * @swagger
 * /landlords/contracts/{id}/reject-terminate:
 *   patch:
 *     summary: Từ chối yêu cầu chấm dứt hợp đồng
 *     description: |
 *       Chủ trọ từ chối yêu cầu chấm dứt từ người thuê.
 *
 *       **Quy tắc:**
 *       - Chỉ từ chối khi `terminationRequest.status = pending`
 *       - Sau khi từ chối:
 *         - `terminationRequest.status = rejected`
 *     tags: [Landlord Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID hợp đồng
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectedReason:
 *                 type: string
 *                 example: "Cần báo trước ít nhất 30 ngày theo hợp đồng."
 *     responses:
 *       200:
 *         description: Từ chối yêu cầu chấm dứt thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Đã từ chối yêu cầu chấm dứt hợp đồng"
 *                 terminationRequest:
 *                   type: object
 *       400:
 *         description: Không có yêu cầu chấm dứt đang chờ xử lý
 *       404:
 *         description: Không tìm thấy hợp đồng
 */

router.post(
  "/from-contact",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE),
  checkSubscription,
  contractController.createFromContact
);
router.get(
  "/renewal-requests",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW),
  contractController.listRenewalRequests
);
router.put(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_EDIT, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.updateData
);
router.post(
  "/:id/sign-landlord",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.signByLandlord
);
router.post(
  "/:id/send-to-tenant",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.sendToTenant
);
router.get(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  contractController.getDetail
);
router.get(
  "/",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW),
  contractController.listMine
);
router.post(
  "/:id/confirm-move-in",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.confirmMoveIn
);

router.post(
  "/:id/approve-extension",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.approveExtension
);

router.post(
  "/:id/reject-extension",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.rejectExtension
);

router.delete(
  "/:id",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_DELETE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.deleteContract
);

router.post(
  "/:id/void",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.voidContract
);
router.post(
  "/:id/clone",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.cloneContract
);
router.post(
  "/:id/terminate",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, {
    checkBuilding: true,
    allowFromDb: true,
    model: "Contract",
    idField: "id",
  }),
  checkSubscription,
  contractController.terminateContract
);
router.get(
  "/:id/download",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW),
  contractController.downloadContractPdf
);
router.patch(
  "/:id/approve-terminate",
  checkAuthorize,
  checkSubscription,
  contractController.approveTerminate
);

router.patch(
  "/:id/reject-terminate",
  checkAuthorize,
  checkSubscription,
  contractController.rejectTerminate
);

module.exports = router;
