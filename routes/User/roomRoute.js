const router = require("express").Router();
const roomCtrl = require("../../controllers/User/RoomController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * /rooms/my-room:
 *   get:
 *     summary: Resident xem thông tin chi tiết phòng hiện tại
 *     description: |
 *       API dành cho resident xem chi tiết phòng mình đang ở hoặc sắp vào ở.
 *       Resident có thể có nhiều phòng (đang ở, sắp đến).
 *
 *       Query parameters:
 *       - roomId: (tùy chọn) ID của phòng muốn xem. Nếu không có, sẽ lấy phòng đầu tiên.
 *
 *       Response bao gồm:
 *       - Thông tin chi tiết phòng
 *       - Danh sách nội thất
 *       - Danh sách phòng có thể chọn (availableRooms)
 *
 *     tags: [Resident Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: roomId
 *         schema:
 *           type: string
 *         required: false
 *         description: ID của phòng muốn xem chi tiết
 *     responses:
 *       200:
 *         description: Lấy thành công thông tin phòng
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
 *                     room:
 *                       $ref: '#/components/schemas/RoomDetail'
 *                     furnitures:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Furniture'
 *                     availableRooms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roomId:
 *                             type: string
 *                           roomNumber:
 *                             type: string
 *                           buildingName:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [active, upcoming]
 *       403:
 *         description: Không phải resident
 *       404:
 *         description: Không có phòng nào
 *       500:
 *         description: Lỗi server
 */
router.get("/my-room", checkAuthorize("resident"), roomCtrl.getMyRoomDetail);

/**
 * @swagger
 * /rooms/my-rooms:
 *   get:
 *     summary: Resident xem danh sách các phòng của mình
 *     description: |
 *       Lấy danh sách tất cả phòng mà resident đang thuê hoặc sắp thuê.
 *       Dùng để hiển thị dropdown/switcher chọn phòng.
 *     tags: [Resident Rooms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách phòng
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
 *                     rooms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roomId:
 *                             type: string
 *                           roomNumber:
 *                             type: string
 *                           buildingName:
 *                             type: string
 *                           status:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                           endDate:
 *                             type: string
 *                     total:
 *                       type: integer
 */
router.get("/my-rooms", checkAuthorize("resident"), roomCtrl.getMyRoomsList);

module.exports = router;
