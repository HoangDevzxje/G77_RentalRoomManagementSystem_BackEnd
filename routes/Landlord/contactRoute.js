const router = require("express").Router();
const contactController = require("../../controllers/Landlord/ContactManageController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");

/**
 * @swagger
 * tags:
 *   - name: Landlord Contact Request
 *     description: Quản lý các yêu cầu tạo hợp đồng được gửi đến chủ trọ
 */

/**
 * @swagger
 * /landlords/contacts:
 *   get:
 *     summary: Lấy danh sách yêu cầu hợp đồng của chủ trọ
 *     description: |
 *       Lấy danh sách tất cả các yêu cầu hợp đồng được gửi đến chủ trọ.  
 *       Có thể lọc theo trạng thái hoặc tòa nhà, kèm phân trang.
 *     tags: [Landlord Contact Request]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected, cancelled]
 *         description: Lọc theo trạng thái yêu cầu
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: ID tòa nhà cần lọc
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
 *           example: 10
 *         description: Số bản ghi mỗi trang (mặc định 10)
 *     responses:
 *       200:
 *         description: Lấy danh sách yêu cầu hợp đồng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       tenantId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                           phone:
 *                             type: string
 *                           email:
 *                             type: string
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
 *                           name:
 *                             type: string
 *                       contactName:
 *                         type: string
 *                       contactPhone:
 *                         type: string
 *                       tenantNote:
 *                         type: string
 *                       landlordNote:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, accepted, rejected, cancelled]
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi hệ thống khi lấy danh sách yêu cầu
 */

/**
 * @swagger
 * /landlords/contacts/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái yêu cầu hợp đồng
 *     description: |
 *       Chủ trọ có thể **chấp nhận** hoặc **từ chối** yêu cầu hợp đồng của người thuê.  
 *       Nếu chấp nhận, hệ thống có thể tiến hành tạo hợp đồng thuê thực tế.
 *     tags: [Landlord Contact Request]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của yêu cầu hợp đồng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [accepted, rejected]
 *                 example: accepted
 *               landlordNote:
 *                 type: string
 *                 example: Tôi đồng ý cho thuê, liên hệ trong hôm nay để ký hợp đồng.
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái yêu cầu thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Cập nhật trạng thái thành công (accepted)"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, accepted, rejected, cancelled]
 *                     landlordNote:
 *                       type: string
 *       400:
 *         description: Hành động không hợp lệ hoặc trạng thái không hợp lệ
 *       404:
 *         description: Không tìm thấy yêu cầu
 *       500:
 *         description: Lỗi hệ thống khi cập nhật trạng thái
 */


// === MIDDLEWARE: Kiểm tra nếu có buildingId thì validate ===
const checkBuildingIfProvided = (req, res, next) => {
    const buildingId = req.query.buildingId;
    if (!buildingId) return next(); // Không có → bỏ qua, để controller xử lý

    return checkStaffPermission(PERMISSIONS.CONTACT_VIEW, {
        checkBuilding: true,
        buildingField: "buildingId",
    })(req, res, next);
};

router.get("/",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.CONTACT_VIEW),
    checkBuildingIfProvided,
    checkSubscription,
    contactController.getAllContacts);
router.patch("/:id/status",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.CONTACT_EDIT),
    checkSubscription,
    contactController.updateContractStatus);

module.exports = router;
