const express = require("express");
const router = express.Router();

const { checkAuthorize } = require("../../middleware/authMiddleware");

const Dashboard = require("../../controllers/Landlord/DashboardLandlordController");

/**
 * @swagger
 * tags:
 *   name: Landlord Dashboard
 *   description: API dashboard landlord (thống kê theo tòa)
 */

/**
 * @swagger
 * /landlords/dashboard/overview:
 *   get:
 *     summary: Tổng quan dashboard theo tòa (KPI)
 *     description: |
 *       Trả về các KPI theo từng tòa (hoặc 1 tòa nếu truyền buildingId).
 *       KPI không phụ thuộc filter tháng.
 *     tags: [Landlord Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         required: false
 *         schema:
 *           type: string
 *         description: (Optional) Lọc theo 1 tòa cụ thể
 *         example: 68e3fe79ec7f3071215fd040
 *     responses:
 *       200:
 *         description: Danh sách KPI theo tòa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       buildingId:
 *                         type: string
 *                         example: 68e3fe79ec7f3071215fd040
 *                       buildingName:
 *                         type: string
 *                         example: Young House 1
 *                       totalPeople:
 *                         type: integer
 *                         example: 124
 *                         description: Tổng số người ở (tính theo currentTenantIds trong phòng rented hoặc theo logic controller)
 *                       totalRoomsAvailable:
 *                         type: integer
 *                         example: 10
 *                         description: Tổng số phòng trống
 *                       totalRoomsRented:
 *                         type: integer
 *                         example: 90
 *                         description: Tổng số phòng đã sử dụng
 *                       activeContracts:
 *                         type: integer
 *                         example: 88
 *                         description: Số hợp đồng đang có hiệu lực
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */

/**
 * @swagger
 * /landlords/dashboard/activity:
 *   get:
 *     summary: Thống kê hoạt động theo tháng (Bài đăng active & Liên hệ)
 *     description: |
 *       Trả về dữ liệu chart theo tháng.
 *       Filter tháng CHỈ áp dụng cho chart (không ảnh hưởng KPI overview).
 *       - Posts chỉ tính bài active (status=active, isDraft=false, isDeleted=false).
 *       - Contacts tính các liên hệ "đang active" (tùy logic controller, thường là pending + accepted).
 *     tags: [Landlord Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         required: false
 *         schema:
 *           type: string
 *         description: (Optional) Lọc theo 1 tòa cụ thể
 *         example: 68e3fe79ec7f3071215fd040
 *       - in: query
 *         name: month
 *         required: false
 *         schema:
 *           type: string
 *           pattern: ^\d{4}-\d{2}$
 *         description: |
 *           (Optional) Lọc theo 1 tháng dạng YYYY-MM.
 *           Nếu không truyền month, mặc định trả về 6 tháng gần nhất.
 *         example: 2025-12
 *     responses:
 *       200:
 *         description: Dữ liệu chart theo tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     range:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                           example: 2025-12-01T00:00:00.000Z
 *                         end:
 *                           type: string
 *                           format: date-time
 *                           example: 2026-01-01T00:00:00.000Z
 *                         month:
 *                           type: string
 *                           nullable: true
 *                           example: 2025-12
 *                     labels:
 *                       type: array
 *                       description: Danh sách tháng (YYYY-MM)
 *                       items:
 *                         type: string
 *                       example: ["2025-07","2025-08","2025-09","2025-10","2025-11","2025-12"]
 *                     series:
 *                       type: object
 *                       properties:
 *                         postsActive:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           example: [12,18,9,20,15,10]
 *                         contactsActive:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           example: [8,14,6,11,9,7]
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Token không hợp lệ hoặc đã hết hạn!
 *       500:
 *         description: Lỗi hệ thống
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Lỗi hệ thống!
 */

router.get("/overview", checkAuthorize(["landlord"]), Dashboard.getOverview);
router.get("/activity", checkAuthorize(["landlord"]), Dashboard.getActivity);

module.exports = router;
