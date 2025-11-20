const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Admin/DashboardController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
/**
 * @swagger
 * tags:
 *   name: Admin Dashboard
 *   description: API quản lý gói dịch vụ
 */

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     tags: [Admin Dashboard]
 *     summary: Lấy dữ liệu tổng quan Dashboard Admin
 *     description: |
 *       API thống kê tổng quan hệ thống dành cho Admin, bao gồm:
 *       - Tổng số user, landlord, package  
 *       - Doanh thu theo kỳ (ngày/tuần/tháng/năm/custom)  
 *       - Biểu đồ trend theo ngày  
 *       - Thống kê package  
 *       - Top landlord chi tiêu nhiều nhất  
 *       - Trạng thái hiện tại của subscription  
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           enum: [today, week, month, year, custom]
 *         description: Bộ lọc thời gian
 *         example: "month"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Chỉ dùng khi filter=custom
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Chỉ dùng khi filter=custom
 *
 *     responses:
 *       200:
 *         description: Lấy dữ liệu dashboard thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: number
 *                         totalLandlords:
 *                           type: number
 *                         newUsersThisPeriod:
 *                           type: number
 *                         totalPackages:
 *                           type: number
 *                         activePackages:
 *                           type: number
 *                         trialPackages:
 *                           type: number
 *                         totalRevenueThisPeriod:
 *                           type: number
 *                         paidSubscriptionsThisPeriod:
 *                           type: number
 *
 *                     charts:
 *                       type: object
 *                       properties:
 *                         dailyTrend:
 *                           type: array
 *                           description: Biểu đồ doanh thu theo ngày
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                               count:
 *                                 type: number
 *                               revenue:
 *                                 type: number
 *                         packagePie:
 *                           type: array
 *                           description: Thống kê package theo số lượng & doanh thu
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 description: Tên package
 *                               count:
 *                                 type: number
 *                               revenue:
 *                                 type: number
 *
 *                     currentStatus:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: number
 *                         expired:
 *                           type: number
 *                         upcoming:
 *                           type: number
 *                         pending_payment:
 *                           type: number
 *                         cancelled:
 *                           type: number
 *
 *                     topLandlords:
 *                       type: array
 *                       description: 5 landlord chi tiêu nhiều nhất
 *                       items:
 *                         type: object
 *                         properties:
 *                           email:
 *                             type: string
 *                           totalSpent:
 *                             type: number
 *                           subscriptionCount:
 *                             type: number
 *
 *                     dateRange:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           example: "2025-02-01"
 *                         end:
 *                           type: string
 *                           example: "2025-02-28"
 *                         filter:
 *                           type: string
 *
 *       400:
 *         description: Request không hợp lệ
 *
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Lỗi khi lấy dữ liệu dashboard"
 */

router.get("/", checkAuthorize("admin"), ctrl.getOverview);

module.exports = router;