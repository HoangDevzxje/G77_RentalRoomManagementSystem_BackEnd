const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { PDFDocument } = require("pdf-lib");
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

/**
 * POST /landlords/contract-templates/preview
 * Body: { buildingId, termIds:[], regulationIds:[] }
 * render file PDF preview (không lưu DB), chèn block TERM/REG vào 2 field
 *           TERMS_BLOCK và REGULATIONS_BLOCK trong base_contract_template.pdf
 */
exports.previewTemplatePdf = async (req, res) => {
  try {
    const { buildingId, termIds = [], regulationIds = [] } = req.body;
    if (!buildingId)
      return res.status(400).json({ message: "buildingId is required" });

    // Lấy template của tòa (nếu có) để lấy basePdfUrl — nếu chưa tạo, dùng ENV
    let template = await ContractTemplate.findOne({ buildingId }).lean();
    const basePdfUrl =
      template?.basePdfUrl || process.env.BASE_CONTRACT_PDF_URL;
    if (!basePdfUrl) {
      return res
        .status(400)
        .json({ message: "BASE_CONTRACT_PDF_URL is not configured" });
    }

    // Lấy Term/Reg theo id (chỉ active + đúng building)
    const [terms, regs] = await Promise.all([
      termIds.length
        ? Term.find({ _id: { $in: termIds }, status: "active", buildingId })
            .select("_id name title description")
            .lean()
        : [],
      regulationIds.length
        ? Regulation.find({
            _id: { $in: regulationIds },
            status: "active",
            buildingId,
          })
            .select("_id title description")
            .lean()
        : [],
    ]);

    // Build text block đẹp (đánh số)
    const termsText = buildBlock(terms, "Điều khoản", {
      titleKey: (it) => it.title || it.name,
    });
    const regsText = buildBlock(regs, "Nội quy", {
      titleKey: (it) => it.title,
    });

    // Tải base PDF và fill 2 field block
    const pdfBytes = await fetch(basePdfUrl).then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    setIfExists(form, "TERMS_BLOCK", termsText);
    setIfExists(form, "REGULATIONS_BLOCK", regsText);

    // Flatten để hiển thị ổn định (preview chỉ đọc)
    form.flatten();

    // Lưu ra /public/previews và trả URL
    const outBytes = await pdfDoc.save();
    const outDir = path.resolve(process.cwd(), "public", "previews");
    await fs.promises.mkdir(outDir, { recursive: true });

    const fileName = `template_preview_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}.pdf`;
    const outPath = path.join(outDir, fileName);
    await fs.promises.writeFile(outPath, Buffer.from(outBytes));

    const base = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const url = `${base}/static/previews/${fileName}`;

    return res.json({ url });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ message: e.message || "Render preview failed" });
  }
};

function buildBlock(items = [], label = "", opts = {}) {
  const getTitle = opts.titleKey || ((it) => it.title || it.name || "");
  if (!items.length) return ""; // để trống nếu chưa chọn
  const lines = items.map(
    (it, idx) =>
      `${idx + 1}) ${getTitle(it) || ""}\n${(it.description || "").trim()}`
  );
  return lines.join("\n\n");
}

function setIfExists(form, fieldName, text) {
  try {
    const tf = form.getTextField(fieldName);
    tf.setText(text || "");
  } catch {
    // field không tồn tại thì bỏ qua, không crash preview
  }
}