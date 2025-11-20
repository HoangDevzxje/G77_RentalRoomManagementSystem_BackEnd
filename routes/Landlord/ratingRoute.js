const express = require("express");
const router = express.Router();
const { checkAuthorize } = require("../../middleware/authMiddleware");
const RatingController = require("../../controllers/Landlord/RatingController");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");

/**
 * @swagger
 * tags:
 *   - name: Landlord Rating Management
 *     description: API quản lý đánh giá cảu các tòa nhà
 */

/**
 * @swagger
 * /landlords/ratings:
 *   get:
 *     summary: Lấy danh sách đánh giá theo tòa nhà (Landlord/Staff) – có phân trang
 *     tags: [Landlord Rating Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         required: false
 *         description: Lọc theo ID tòa nhà. Nếu không truyền → lấy tất cả tòa nhà mà landlord/staff quản lý.
 *         schema:
 *           type: string
 *           example: "67c260745c24cc0d226d72ab"
 *       - in: query
 *         name: page
 *         required: false
 *         description: Trang hiện tại (mặc định 1)
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Số item mỗi trang (1–100, mặc định 20)
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: Thành công
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
 *                     filter:
 *                       type: string
 *                       example: "all_managed_buildings"
 *                     buildingId:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     totalManagedBuildings:
 *                       type: integer
 *                       example: 3
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         total:
 *                           type: integer
 *                           example: 125
 *                         totalPages:
 *                           type: integer
 *                           example: 7
 *                         hasNext:
 *                           type: boolean
 *                           example: true
 *                         hasPrev:
 *                           type: boolean
 *                           example: false
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalRatings:
 *                           type: integer
 *                           example: 125
 *                         averageRating:
 *                           type: number
 *                           example: 4.5
 *                     ratings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "67c261cb9e54bf836fb644bf"
 *                           building:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "67c260745c24cc0d226d72ab"
 *                               name:
 *                                 type: string
 *                                 example: "Tòa A - Sunrise City"
 *                           rating:
 *                             type: number
 *                             example: 5
 *                           comment:
 *                             type: string
 *                             example: "Phòng đẹp, sạch, bảo vệ thân thiện."
 *                           images:
 *                             type: array
 *                             items:
 *                               type: string
 *                               example: "https://example.com/img1.jpg"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-02-15T04:20:00.000Z"
 *                           user:
 *                             type: object
 *                             properties:
 *                               fullName:
 *                                 type: string
 *                                 example: "Nguyễn Văn A"
 *                               phoneNumber:
 *                                 type: string
 *                                 example: "0909123456"
 *                               avatar:
 *                                 type: string
 *                                 example: "https://example.com/avatar.jpg"
 *       403:
 *         description: Không có quyền xem tòa nhà này
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/ratings/{ratingId}:
 *   get:
 *     tags: [Landlord Rating Management]
 *     summary: Lấy chi tiết 1 đánh giá của tòa nhà
 *     description: |
 *       API cho landlord hoặc staff xem chi tiết một đánh giá.
 *       - **Landlord** chỉ xem được đánh giá thuộc tòa nhà mình sở hữu  
 *       - **Staff** chỉ xem được đánh giá thuộc tòa mình quản lý
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: ratingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của đánh giá
 *
 *     responses:
 *       200:
 *         description: Lấy chi tiết đánh giá thành công
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
 *                     _id:
 *                       type: string
 *                       example: "67b2e9092f1c3a12df45c91c"
 *                     building:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                           example: "Tòa Sunrise"
 *                         address:
 *                           type: string
 *                           example: "123 Nguyễn Trãi, Hà Nội"
 *                     rating:
 *                       type: number
 *                       example: 4.5
 *                     comment:
 *                       type: string
 *                       example: "Tòa đẹp, dịch vụ tốt"
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example:
 *                         - "/uploads/rating/img1.png"
 *                         - "/uploads/rating/img2.png"
 *                     createdAt:
 *                       type: string
 *                       example: "2024-01-12T10:22:11.123Z"
 *                     updatedAt:
 *                       type: string
 *                       example: "2024-01-18T09:10:05.200Z"
 *                     user:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         email:
 *                           type: string
 *                           example: "user@gmail.com"
 *                         fullName:
 *                           type: string
 *                           example: "Nguyễn Văn A"
 *                         phoneNumber:
 *                           type: string
 *                         avatar:
 *                           type: string
 *                         gender:
 *                           type: string
 *                         dob:
 *                           type: string
 *                         joinedAt:
 *                           type: string
 *
 *       400:
 *         description: ID không hợp lệ
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "ID đánh giá không hợp lệ"
 *
 *       403:
 *         description: Không có quyền xem đánh giá này
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Bạn không sở hữu tòa nhà này"
 *
 *       404:
 *         description: Không tìm thấy đánh giá
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Không tìm thấy đánh giá này"
 *
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: "Lỗi hệ thống"
 */

/**
 * @swagger
 * /landlords/ratings/{ratingId}:
 *   delete:
 *     summary: Xóa đánh giá của tòa nhà (dành cho Landlord/Staff có quyền)
 *     tags: [Landlord Rating Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ratingId
 *         required: true
 *         description: ID của đánh giá cần xóa
 *         schema:
 *           type: string
 *           example: "67c261cb9e54bf836fb644bf"
 *     responses:
 *       200:
 *         description: Xóa đánh giá thành công
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
 *                   example: "Đã xóa đánh giá thành công"
 *       400:
 *         description: ID không hợp lệ
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
 *                   example: "ID đánh giá không hợp lệ"
 *       403:
 *         description: Không đủ quyền xóa đánh giá
 *       404:
 *         description: Không tìm thấy đánh giá hoặc tòa nhà
 *       500:
 *         description: Lỗi hệ thống
 */


router.get(
    "/",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RATING_VIEW),
    RatingController.getRatingsByBuilding
);
router.get(
    "/:ratingId",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RATING_VIEW,
        {
            checkBuilding: true,
            allowFromDb: true,
            idField: "ratingId",
            model: "BuildingRating"
        }
    ),
    checkSubscription,
    RatingController.getDetailRating
);
router.delete(
    "/:ratingId",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RATING_DELETE,
        {
            checkBuilding: true,
            allowFromDb: true,
            idField: "ratingId",
            model: "BuildingRating"
        }
    ),
    checkSubscription,
    RatingController.deleteRating
);

module.exports = router;