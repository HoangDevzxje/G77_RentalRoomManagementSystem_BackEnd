const router = require("express").Router();
const ResidentController = require("../../controllers/Landlord/ResidentController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Landlord Resident Management
 *     description: API quản lý cư dân trong các phòng thuộc quyền của landlord/staff
 */

/**
 * @swagger
 * /landlords/residents:
 *   get:
 *     summary: Lấy danh sách từng cư dân (flatten) đang ở trong các phòng thuộc tòa mà landlord/staff có quyền xem
 *     tags: [Landlord Resident Management]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema:
 *           type: string
 *         description: Lọc theo tòa nhà
 *
 *       - in: query
 *         name: floorId
 *         schema:
 *           type: string
 *         description: Lọc theo tầng trong tòa
 *
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *         description: Lọc theo phòng
 *
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Tìm kiếm theo tên, email hoặc số điện thoại
 *
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Trang hiện tại
 *
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *         description: Số cư dân mỗi trang
 *
 *     responses:
 *       200:
 *         description: Danh sách cư dân đang ở trong phòng (mỗi dòng là một cư dân)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *
 *                 data:
 *                   type: object
 *                   properties:
 *
 *                     people:
 *                       type: array
 *                       description: Danh sách từng cư dân đang ở
 *                       items:
 *                         type: object
 *                         properties:
 *                           personId:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           phoneNumber:
 *                             type: string
 *                           gender:
 *                             type: string
 *                           dob:
 *                             type: string
 *                             format: date
 *                           address:
 *                             type: string
 *
 *                           roomId:
 *                             type: string
 *                           roomNumber:
 *                             type: string
 *                           buildingName:
 *                             type: string
 *                           floor:
 *                             type: string
 *                             example: "Tầng 3"
 *
 *                     stats:
 *                       type: object
 *                       properties:
 *                         current:
 *                           type: integer
 *                           example: 42
 *                         max:
 *                           type: integer
 *                           example: 60
 *                         percentage:
 *                           type: integer
 *                           example: 70
 *                         text:
 *                           type: string
 *                           example: "42/60 người"
 *
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 *
 *                     meta:
 *                       type: object
 *                       properties:
 *                         filters:
 *                           type: object
 *                           properties:
 *                             buildingId:
 *                               type: string
 *                               nullable: true
 *                             floorId:
 *                               type: string
 *                               nullable: true
 *                             roomId:
 *                               type: string
 *                               nullable: true
 *                             search:
 *                               type: string
 *                               nullable: true
 *
 *       403:
 *         description: Không có quyền xem tòa nhà này
 *
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/residents/add:
 *   post:
 *     summary: Thêm cư dân vào phòng
 *     tags: [Landlord Resident Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       - Chỉ landlord/staff có quyền trong tòa nhà mới được thêm  
 *       - Không cho phép thêm nếu phòng đã đầy hoặc cư dân đang ở phòng khác  
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - accountId
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "67c123455c24cc0d226d7000"
 *               accountId:
 *                 type: string
 *                 example: "67c999999e54bf836fb60000"
 *
 *     responses:
 *       200:
 *         description: Thêm cư dân thành công
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
 *                   example: "Thêm cư dân vào phòng thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     roomNumber:
 *                       type: string
 *                       example: "A203"
 *                     addedTenant:
 *                       type: object
 *                       properties:
 *                         accountId:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         email:
 *                           type: string
 *                     newOccupancy:
 *                       type: string
 *                       example: "2/4"
 *
 *       400:
 *         description: Thiếu dữ liệu hoặc phòng đầy
 *
 *       404:
 *         description: Không tìm thấy phòng hoặc cư dân
 *
 *       500:
 *         description: Lỗi hệ thống
 */

/**
 * @swagger
 * /landlords/residents/remove:
 *   post:
 *     summary: Xóa cư dân khỏi phòng
 *     tags: [Landlord Resident Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       - Xóa cư dân ra khỏi phòng  
 *       - Nếu phòng trống → chuyển status về `available`  
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - accountId
 *             properties:
 *               roomId:
 *                 type: string
 *                 example: "67c123455c24cc0d226d7000"
 *               accountId:
 *                 type: string
 *                 example: "67c999999e54bf836fb60000"
 *
 *     responses:
 *       200:
 *         description: Xóa cư dân thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Dọn cư dân ra khỏi phòng thành công"
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     roomNumber:
 *                       type: string
 *                       example: "A203"
 *                     removedTenantId:
 *                       type: string
 *                     previousOccupancy:
 *                       type: string
 *                       example: "2/4"
 *                     newOccupancy:
 *                       type: string
 *                       example: "1/4"
 *
 *       400:
 *         description: Thiếu dữ liệu
 *
 *       404:
 *         description: Không tìm thấy phòng
 *
 *       500:
 *         description: Lỗi hệ thống
 */


router.get(
    "/",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RESIDENT_VIEW,
        { checkBuilding: false }),
    ResidentController.getTenants
);

router.post(
    "/add",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RESIDENT_CREATE),
    checkSubscription,
    ResidentController.addTenantToRoom
);

router.post(
    "/remove",
    checkAuthorize(["landlord", "staff"]),
    checkStaffPermission(PERMISSIONS.RESIDENT_DELETE),
    checkSubscription,
    ResidentController.removeTenantFromRoom
);

module.exports = router;