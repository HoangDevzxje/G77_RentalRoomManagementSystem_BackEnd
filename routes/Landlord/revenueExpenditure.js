const router = require("express").Router();
const ctrl = require("../../controllers/Landlord/RevenueExpenditureController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
const checkSubscription = require("../../middleware/checkSubscription");

const auth = ["landlord", "staff"];

/**
 * @swagger
 * tags:
 *   - name: Landlord Reneue Expenditure Management
 *     description: Quản lý thu chi tòa nhà (Chủ trọ + Nhân viên theo tòa được giao)
 */

/**
 * @swagger
 * /landlords/revenue-expenditure:
 *   post:
 *     summary: Ghi nhận thu hoặc chi mới
 *     description: >
 *       **Quyền truy cập**:
 *       - Landlord: Toàn quyền tất cả tòa
 *       - Staff: Chỉ tòa được giao + có permission `revenue_expenditure_create`
 *       
 *       Ghi nhận một khoản thu (revenue) hoặc chi (expenditure) cho tòa nhà.
 *     tags: [Landlord Reneue Expenditure Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - buildingId
 *               - title
 *               - type
 *               - amount
 *             properties:
 *               buildingId:
 *                 type: string
 *                 description: ID tòa nhà
 *                 example: "670f123456789abc123def45"
 *               title:
 *                 type: string
 *                 description: Tiêu đề khoản thu/chi
 *                 example: "Thu tiền phòng tháng 11/2025"
 *               description:
 *                 type: string
 *                 description: Ghi chú chi tiết
 *                 example: "Phòng 101, 102, 201 - Đã thu đầy đủ"
 *               type:
 *                 type: string
 *                 enum: [revenue, expenditure]
 *                 description: Loại khoản tiền
 *                 example: revenue
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 description: Số tiền (VND)
 *                 example: 15000000
 *               recordedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày ghi nhận (mặc định là hiện tại)
 *                 example: "2025-11-10T10:30:00.000Z"
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Ghi nhận thu chi thành công"
 *                 data:
 *                   $ref: '#/components/schemas/RevenueExpenditure'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền hoặc tòa không được giao (staff)
 *       500:
 *         description: Lỗi server
 */

/**
 * @swagger
 * /landlords/revenue-expenditure:
 *   get:
 *     summary: Danh sách thu chi (có phân trang + lọc)
 *     description: >
 *       Lấy danh sách thu chi với bộ lọc mạnh mẽ.
 *       Staff chỉ thấy của tòa được giao.
 *     tags: [Landlord Reneue Expenditure Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà
 *       - name: type
 *         in: query
 *         schema:
 *           type: string
 *           enum: [revenue, expenditure]
 *         description: Lọc theo loại
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Từ ngày (YYYY-MM-DD)
 *         example: "2025-11-01"
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Đến ngày (YYYY-MM-DD)
 *         example: "2025-11-30"
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Danh sách thu chi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RevenueExpenditure'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 */

/**
 * @swagger
 * /landlords/revenue-expenditure/{id}:
 *   get:
 *     summary: Chi tiết một khoản thu chi
 *     tags: [Landlord Reneue Expenditure Management]
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
 *         description: Chi tiết khoản thu chi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RevenueExpenditure'
 *       404:
 *         description: Không tìm thấy
 *       403:
 *         description: Staff không quản lý tòa này
 */

/**
 * @swagger
 * /landlords/revenue-expenditure/{id}:
 *   put:
 *     summary: Cập nhật khoản thu chi
 *     tags: [Landlord Reneue Expenditure Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [revenue, expenditure]
 *               amount:
 *                 type: number
 *               recordedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không có quyền sửa (staff)
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /landlords/revenue-expenditure/{id}:
 *   delete:
 *     summary: Xóa mềm khoản thu chi
 *     tags: [Landlord Reneue Expenditure Management]
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
 *         description: Xóa thành công (soft delete)
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /landlords/revenue-expenditure/stats:
 *   get:
 *     summary: Thống kê thu chi theo tháng/năm
 *     description: Tổng thu, tổng chi, lợi nhuận
 *     tags: [Landlord Reneue Expenditure Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *       - name: year
 *         in: query
 *         schema:
 *           type: integer
 *           default: 2025
 *       - name: month
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Nếu có month → thống kê theo tháng, không có → cả năm
 *     responses:
 *       200:
 *         description: Thống kê
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revenue:
 *                   type: number
 *                   example: 150000000
 *                 expenditure:
 *                   type: number
 *                   example: 32000000
 *                 profit:
 *                   type: number
 *                   example: 118000000
 */

/**
 * @swagger
 * /landlords/revenue-expenditure/export:
 *   get:
 *     summary: Xuất Excel báo cáo thu chi
 *     description: Tải file Excel (.xlsx) với đầy đủ dữ liệu đã lọc
 *     tags: [Landlord Reneue Expenditure Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: query
 *         schema:
 *           type: string
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: File Excel
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Không có quyền xem
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RevenueExpenditure:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         createBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             email:
 *               type: string
 *         buildingId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         type:
 *           type: string
 *           enum: [revenue, expenditure]
 *         amount:
 *           type: number
 *         recordedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         isDeleted:
 *           type: boolean
 *       example:
 *         _id: "673456789abc123def456789"
 *         title: "Thu tiền phòng tháng 11"
 *         type: "revenue"
 *         amount: 15000000
 *         recordedAt: "2025-11-10T10:30:00.000Z"
 */
router.post("/",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_CREATE, { checkBuilding: true }),
    checkSubscription,
    ctrl.create);
router.get("/",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_VIEW),
    checkSubscription,
    ctrl.list);
router.get("/stats",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_VIEW, { checkBuilding: true }),
    checkSubscription,
    ctrl.stats);
router.get("/export",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_VIEW, { checkBuilding: true }),
    checkSubscription,
    ctrl.exportExcel);
router.get("/:id",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_VIEW,
        {
            checkBuilding: true,
            allowFromDb: true,
            model: "RevenueExpenditures"
        }
    ),
    checkSubscription,
    ctrl.getById);
router.put("/:id",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_EDIT,
        {
            checkBuilding: true,
            allowFromDb: true,
            model: "RevenueExpenditures"
        }
    ),
    checkSubscription,
    ctrl.update);
router.delete("/:id",
    checkAuthorize(auth),
    checkStaffPermission(PERMISSIONS.REVENUE_EXPENDITURE_DELETE,
        {
            checkBuilding: true,
            allowFromDb: true,
            model: "RevenueExpenditures"
        }),
    checkSubscription,
    ctrl.softDelete);


module.exports = router;