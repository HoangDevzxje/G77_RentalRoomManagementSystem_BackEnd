const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/Landlord/ContractTemplateController");
const { checkAuthorize } = require("../../middleware/authMiddleware");
const checkSubscription = require("../../middleware/checkSubscription");
const { checkStaffPermission } = require("../../middleware/checkStaffPermission");
const { PERMISSIONS } = require("../../constants/permissions");

/**
 * @swagger
 * tags:
 *   name: Landlord - Contract Templates
 *   description: Quản lý mẫu hợp đồng thuê phòng của chủ trọ
 */

/**
 * @swagger
 * /landlords/contract-templates:
 *   post:
 *     summary: Tạo mẫu hợp đồng mới cho một tòa
 *     tags: [Landlord - Contract Templates]
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
 *             properties:
 *               buildingId:
 *                 type: string
 *                 description: ID của tòa nhà
 *               name:
 *                 type: string
 *                 example: "Mẫu Hợp Đồng Tiêu Chuẩn"
 *               defaultTermIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               defaultRegulationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               placeholders:
 *                 type: object
 *                 properties:
 *                   termsTagField:
 *                     type: string
 *                     example: "TERMS_BLOCK"
 *                   regulationsTagField:
 *                     type: string
 *                     example: "REGULATIONS_BLOCK"
 *     responses:
 *       200:
 *         description: Tạo template thành công
 *       400:
 *         description: Thiếu hoặc sai dữ liệu
 *       409:
 *         description: Template đã tồn tại cho tòa này
 */
router.post("/",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.CONTRACT_CREATE, { checkBuilding: true }),
  ctrl.create);

/**
 * @swagger
 * /landlords/contract-templates:
 *   get:
 *     summary: Lấy danh sách template của landlord
 *     tags: [Landlord - Contract Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách template của landlord
 */
router.get("/",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW),
  ctrl.listMine);

/**
 * @swagger
 * /landlords/contract-templates/by-building/{buildingId}:
 *   get:
 *     summary: Lấy template theo ID tòa nhà
 *     tags: [Landlord - Contract Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: buildingId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của tòa nhà
 *     responses:
 *       200:
 *         description: Trả về template của tòa
 *       404:
 *         description: Không tìm thấy template
 */
router.get(
  "/by-building/:buildingId",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW, { checkBuilding: true }),
  ctrl.getByBuilding
);

/**
 * @swagger
 * /landlords/contract-templates/{id}:
 *   put:
 *     summary: Cập nhật thông tin template
 *     tags: [Landlord - Contract Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của template cần sửa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mẫu Hợp Đồng Sửa Đổi"
 *               defaultTermIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               defaultRegulationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               placeholders:
 *                 type: object
 *                 properties:
 *                   termsTagField:
 *                     type: string
 *                     example: "TERMS_BLOCK"
 *                   regulationsTagField:
 *                     type: string
 *                     example: "REGULATIONS_BLOCK"
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy template
 */
router.put("/:id",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.CONTRACT_EDIT,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "ContractTemplate"
    }
  ),
  ctrl.update);

/**
 * @swagger
 * /landlords/contract-templates/{id}:
 *   delete:
 *     summary: Xóa template
 *     tags: [Landlord - Contract Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID template cần xóa
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy template
 */
router.delete("/:id",
  checkAuthorize(["landlord", "staff"]),
  checkSubscription,
  checkStaffPermission(PERMISSIONS.CONTRACT_DELETE,
    {
      checkBuilding: true,
      allowFromDb: true,
      model: "ContractTemplate"
    }),
  ctrl.remove);

/**
 * @swagger
 * /landlords/contract-templates/preview:
 *   get:
 *     summary: Xem trước file PDF hợp đồng mẫu (preview)
 *     tags: [Landlord - Contract Templates]
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
 *             properties:
 *               buildingId:
 *                 type: string
 *               termIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               regulationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Trả về URL preview PDF
 *       400:
 *         description: Thiếu dữ liệu hoặc lỗi xác thực
 *       500:
 *         description: Lỗi khi render PDF
 */
// router.post(
//   "/download",
//   checkAuthorize(["landlord"]),
//   ctrl.downloadTemplatePdf
// );
router.get("/preview-pdf",
  checkAuthorize(["landlord", "staff"]),
  checkStaffPermission(PERMISSIONS.CONTRACT_VIEW, { checkBuilding: true }),
  ctrl.previewPdf);

module.exports = router;
