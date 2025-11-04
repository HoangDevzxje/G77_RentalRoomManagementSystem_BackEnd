const ContractTemplate = require("../../models/ContractTemplate");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");

/**
 * lấy BASE_PDF_URL từ ENV
 */
function getBasePdfUrl() {
  const url = process.env.BASE_CONTRACT_PDF_URL;
  if (!url) {
    throw new Error("BASE_CONTRACT_PDF_URL is not configured");
  }
  return url;
}

/**
 * Tạo template mới cho 1 tòa (landlord). Mỗi tòa CHỈ 1 template.
 * Body tối thiểu: { buildingId, name?, defaultTermIds?, defaultRegulationIds? }
 */
exports.create = async (req, res) => {
  try {
    const ownerId = req.user?._id; // landlord id từ auth
    const {
      buildingId,
      name,
      defaultTermIds = [],
      defaultRegulationIds = [],
      placeholders,
    } = req.body;

    if (!buildingId)
      return res.status(400).json({ message: "buildingId is required" });

    // Kiểm tra đã tồn tại template cho tòa này chưa
    const existed = await ContractTemplate.findOne({ buildingId }).lean();
    if (existed) {
      return res
        .status(409)
        .json({ message: "Template already exists for this building" });
    }

    // Validate Term/Reg (tuỳ chọn: chỉ check isActive; chi tiết building check có thể dời sang Contracts lúc tạo HĐ)
    await validateTermsRegsBasic(defaultTermIds, defaultRegulationIds);

    const doc = await ContractTemplate.create({
      buildingId,
      ownerId,
      name: name || "Mẫu Hợp Đồng Thuê Phòng",
      basePdfUrl: getBasePdfUrl(),
      defaultTermIds,
      defaultRegulationIds,
      placeholders,
      status: "active",
    });

    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * Lấy template theo building (landlord scope).
 * GET /landlords/contract-templates/by-building/:buildingId
 */
exports.getByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const doc = await ContractTemplate.findOne({ buildingId }).lean();
    if (!doc) return res.status(404).json({ message: "Template not found" });
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * Cập nhật template (đổi tên, set defaultTermIds/defaultRegulationIds, placeholders).
 * Không cho đổi basePdfUrl ở luồng này (giữ một nguồn PDF nền duy nhất).
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;

    const updatable = {};
    const allowed = [
      "name",
      "defaultTermIds",
      "defaultRegulationIds",
      "placeholders",
      "status",
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updatable[k] = req.body[k];
    }

    if (updatable.defaultTermIds || updatable.defaultRegulationIds) {
      await validateTermsRegsBasic(
        updatable.defaultTermIds || [],
        updatable.defaultRegulationIds || []
      );
    }

    const doc = await ContractTemplate.findOneAndUpdate(
      { _id: id, ownerId: req.user?._id }, // đảm bảo chỉ chủ sở hữu tòa được sửa
      { $set: updatable },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "Template not found" });
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * Xoá template (thực tế nên dùng inactive; nhưng theo yêu cầu cho phép xoá hẳn).
 */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await ContractTemplate.findOneAndDelete({
      _id: id,
      ownerId: req.user?._id,
    });
    if (!doc) return res.status(404).json({ message: "Template not found" });
    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * List tất cả template thuộc landlord (nếu landlord quản nhiều tòa).
 */
exports.listMine = async (req, res) => {
  try {
    const items = await ContractTemplate.find({
      ownerId: req.user?._id,
    }).lean();
    return res.json(items);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * Validate cơ bản Term/Reg:
 * - Phải tồn tại
 * - status === "active"
 */
async function validateTermsRegsBasic(termIds = [], regulationIds = []) {
  if (termIds.length) {
    const terms = await Term.find({ _id: { $in: termIds }, status: "active" })
      .select("_id")
      .lean();
    if (terms.length !== termIds.length)
      throw new Error("Some terms are invalid or inactive");
  }
  if (regulationIds.length) {
    const regs = await Regulation.find({
      _id: { $in: regulationIds },
      status: "active",
    })
      .select("_id")
      .lean();
    if (regs.length !== regulationIds.length)
      throw new Error("Some regulations are invalid or inactive");
  }
}
