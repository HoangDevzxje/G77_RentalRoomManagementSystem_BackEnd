const router = require("express").Router();
const scheduleController = require("../../controllers/Landlord/ScheduleController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");

/**
 * @swagger
 * tags:
 *   - name: Landlord Schedule
 *     description: Quản lý lịch rảnh của chủ trọ
 */

/**
 * @swagger
 * /landlords/schedules:
 *   post:
 *     summary: Tạo hoặc cập nhật lịch rảnh cho tòa
 *     tags: [Landlord Schedule]
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
 *               - defaultSlots
 *             properties:
 *               buildingId:
 *                 type: string
 *                 example: 6717e5c3f1a8b4e567123abc
 *               defaultSlots:
 *                 type: array
 *                 description: Lịch cố định trong tuần (0 = Chủ nhật, 6 = Thứ 7)
 *                 items:
 *                   type: object
 *                   properties:
 *                     dayOfWeek:
 *                       type: integer
 *                       example: 1
 *                     isAvailable:
 *                       type: boolean
 *                       example: true
 *                     startTime:
 *                       type: string
 *                       example: "09:00"
 *                     endTime:
 *                       type: string
 *                       example: "17:00"
 *                 example:
 *                   - dayOfWeek: 0
 *                     isAvailable: false
 *                   - dayOfWeek: 1
 *                     isAvailable: true
 *                     startTime: "09:00"
 *                     endTime: "17:00"
 *                   - dayOfWeek: 2
 *                     isAvailable: true
 *                     startTime: "09:00"
 *                     endTime: "17:00"
 *                   - dayOfWeek: 3
 *                     isAvailable: true
 *                     startTime: "09:00"
 *                     endTime: "17:00"
 *                   - dayOfWeek: 4
 *                     isAvailable: true
 *                     startTime: "09:00"
 *                     endTime: "17:00"
 *                   - dayOfWeek: 5
 *                     isAvailable: true
 *                     startTime: "09:00"
 *                     endTime: "12:00"
 *                   - dayOfWeek: 6
 *                     isAvailable: false
 *               overrides:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                     isAvailable:
 *                       type: boolean
 *                     startTime:
 *                       type: string
 *                     endTime:
 *                       type: string
 *                     note:
 *                       type: string
 *                 example:
 *                   - date: "2025-11-01"
 *                     isAvailable: false
 *                     note: "Bận công tác"
 *     responses:
 *       200:
 *         description: Cập nhật lịch thành công
 */

/**
 * @swagger
 * /landlords/schedules/{buildingId}:
 *   get:
 *     summary: Lấy lịch rảnh của một tòa
 *     description: Chủ trọ xem lịch rảnh (bao gồm cả lịch cố định và ngoại lệ) của tòa cụ thể.
 *     tags: [Landlord Schedule]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của tòa nhà
 *     responses:
 *       200:
 *         description: Trả về lịch rảnh của tòa
 *       404:
 *         description: Chưa thiết lập lịch
 *
 *   delete:
 *     summary: Xóa lịch rảnh của tòa
 *     tags: [Landlord Schedule]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID của tòa nhà
 *     responses:
 *       200:
 *         description: Đã xóa lịch thành công
 *       404:
 *         description: Không tìm thấy lịch
 */

router.post("/", checkAuthorize(["landlord"]), checkSubscription, scheduleController.upsertSchedule);
router.get("/:buildingId", checkAuthorize(["landlord"]), checkSubscription, scheduleController.getSchedule);
router.delete("/:buildingId", checkAuthorize(["landlord"]), checkSubscription, scheduleController.deleteSchedule);

module.exports = router;
