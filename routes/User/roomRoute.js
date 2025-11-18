const router = require("express").Router();

const roomCtrl = require("../../controllers/User/RoomController");
const { checkAuthorize } = require("../../middleware/authMiddleware");

/**
 * @swagger
 * /rooms/my-room:
 *   get:
 *     summary: Resident xem thông tin phòng hiện tại và danh sách nội thất
 *     description: |
 *       API dành cho resident (tenant) xem chi tiết phòng mình đang ở,
 *       bao gồm thông tin phòng và danh sách nội thất (RoomFurniture)
 *       để tiện chọn món khi tạo phiếu báo hỏng.
 *
 *       Điều kiện:
 *       - Chỉ áp dụng cho tài khoản có role = `resident`
 *       - Phòng phải có trạng thái `rented` và chứa tenant hiện tại trong `currentTenantIds`
 *
 *     tags: [Resident Rooms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lấy thành công thông tin phòng và danh sách nội thất
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               success:
 *                 summary: Ví dụ response thành công
 *                 value:
 *                   room:
 *                     id: "667fb7e523adf2e34f8b9123"
 *                     roomNumber: "A501"
 *                     floorId: "667fb7c123adf2e34f8b9001"
 *                     area: 25
 *                     price: 4500000
 *                     status: "rented"
 *                     building:
 *                       _id: "667fb7b923adf2e34f8b8fff"
 *                       name: "Tòa nhà Trúc Xanh"
 *                       address: "123 Đường ABC, Quận 9, TP.HCM"
 *                     currentTenantIds:
 *                       - "667fb9aa23adf2e34f8b9456"
 *                   furnitures:
 *                     - id: "6680aa1c89c1f255a0e3de01"
 *                       furnitureId: "667fba0023adf2e34f8b9555"
 *                       name: "Giường gỗ 1m6"
 *                       description: "Giường gỗ sồi 1m6x2m, có hộc kéo chứa đồ"
 *                       price: 3500000
 *                       status: "active"
 *                       quantity: 1
 *                       damageCount: 0
 *                       condition: "good"
 *                       notes: "Đầu giường hơi trầy nhẹ"
 *                     - id: "6680aa3a89c1f255a0e3de02"
 *                       furnitureId: "667fba1123adf2e34f8b9666"
 *                       name: "Tủ quần áo 3 cánh"
 *                       description: "Tủ MDF chống ẩm, 3 cánh, màu trắng"
 *                       price: 2800000
 *                       status: "active"
 *                       quantity: 1
 *                       damageCount: 1
 *                       condition: "damaged"
 *                       notes: "Bản lề cánh phải bị lỏng"
 *
 *       403:
 *         description: Không phải resident hoặc không có quyền xem thông tin phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Chỉ resident mới được dùng API này"
 *
 *       404:
 *         description: Resident chưa được gán vào phòng nào hoặc phòng không tồn tại / chưa active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Bạn chưa được gán vào phòng nào hoặc phòng chưa active"
 *
 *       500:
 *         description: Lỗi server khi lấy thông tin phòng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: "Lỗi lấy thông tin phòng"
 */
router.get("/my-room", checkAuthorize("resident"), roomCtrl.getMyRoomDetail);

module.exports = router;
