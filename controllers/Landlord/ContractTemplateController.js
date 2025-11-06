const path = require("path");
const fs = require("fs");
const { PDFDocument, rgb } = require("pdf-lib");
const ContractTemplate = require("../../models/ContractTemplate");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");
const fontkit = require("@pdf-lib/fontkit");

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

const _fetch =
  global.fetch ||
  ((...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args)));
exports.downloadByTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    // Tìm template và check quyền
    const tpl = await ContractTemplate.findOne({
      _id: id,
      ownerId: req.user?._id,
    }).lean();
    if (!tpl) return res.status(404).json({ message: "Template not found" });

    const pdfBytes = await buildContractPdf(tpl);
    const fileName = `${(tpl.name || "Mau Hop Dong").replace(/\s+/g, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

exports.downloadByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;

    const tpl = await ContractTemplate.findOne({
      buildingId,
      ownerId: req.user?._id,
    }).lean();
    if (!tpl) return res.status(404).json({ message: "Template not found" });

    const pdfBytes = await buildContractPdf(tpl);
    const fileName = `${(tpl.name || "Mau Hop Dong").replace(/\s+/g, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * Helper: dựng PDF từ template (nội bộ)
 */
async function buildContractPdf(tpl) {
  // 1) Lấy nền PDF
  const baseUrl = tpl.basePdfUrl || getBasePdfUrl();
  const resp = await _fetch(baseUrl);
  if (!resp.ok) throw new Error("Cannot fetch base PDF");
  const basePdfBytes = await resp.arrayBuffer();

  // 2) Load PDF + font
  const pdfDoc = await PDFDocument.load(basePdfBytes);
  pdfDoc.registerFontkit(fontkit);

  // Font: gắn 1 font hỗ trợ Unicode (ví dụ NotoSans-Regular.ttf) từ local
  // Bạn có thể thay đường dẫn phù hợp hạ tầng của bạn:
  const fontPath = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "NotoSans-Regular.ttf"
  );
  const fontBytes = fs.readFileSync(fontPath);
  const noto = await pdfDoc.embedFont(fontBytes, { subset: true });

  // 3) Lấy dữ liệu Terms/Regs
  const [terms, regs] = await Promise.all([
    tpl.defaultTermIds?.length
      ? Term.find({ _id: { $in: tpl.defaultTermIds }, status: "active" })
          .select("title description order")
          .sort({ order: 1, createdAt: 1 })
          .lean()
      : [],
    tpl.defaultRegulationIds?.length
      ? Regulation.find({
          _id: { $in: tpl.defaultRegulationIds },
          status: "active",
        })
          .select("title description order")
          .sort({ order: 1, createdAt: 1 })
          .lean()
      : [],
  ]);

  // 4) Vẽ nội dung vào trang đầu (và tự thêm trang nếu tràn)
  const pageMargin = 56;
  const lineGap = 6;
  const fontSizeTitle = 12;
  const fontSizeBody = 10;

  const drawWrapped = (page, text, x, y, opts = {}) => {
    const { size = fontSizeBody, maxWidth = page.getWidth() - x - pageMargin } =
      opts;

    const lines = wrapText(text, noto, size, maxWidth);
    let cursorY = y;
    for (const line of lines) {
      if (cursorY < pageMargin + size) {
        // hết chỗ -> sang trang mới
        const n = pdfDoc.addPage();
        cursorY = n.getHeight() - pageMargin;
        page = n;
      }
      page.drawText(line, { x, y: cursorY, size, font: noto });
      cursorY -= size + lineGap;
    }
    return { page, y: cursorY };
  };

  let page = pdfDoc.getPage(0);
  let cursorY = page.getHeight() - pageMargin;

  // Header cứng (có thể bỏ nếu nền đã có)
  const header = [
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "ĐỘC LẬP – TỰ DO – HẠNH PHÚC",
    "",
    (tpl.name || "HỢP ĐỒNG THUÊ PHÒNG").toUpperCase(),
  ];
  for (const h of header) {
    ({ page, y: cursorY } = drawWrapped(page, h, pageMargin, cursorY, {
      size: fontSizeTitle,
    }));
  }
  cursorY -= 8;

  // Điều khoản
  if (terms?.length) {
    ({ page, y: cursorY } = drawWrapped(
      page,
      "I. NỘI DUNG ĐIỀU KHOẢN",
      pageMargin,
      cursorY,
      {
        size: fontSizeTitle,
      }
    ));
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const head = `${i + 1}. ${t.title || "Điều khoản"}`;
      ({ page, y: cursorY } = drawWrapped(page, head, pageMargin, cursorY, {
        size: fontSizeBody + 1,
      }));
      if (t.description) {
        ({ page, y: cursorY } = drawWrapped(
          page,
          String(t.description),
          pageMargin + 16,
          cursorY
        ));
      }
      cursorY -= 4;
    }
    cursorY -= 8;
  }

  // Quy định
  if (regs?.length) {
    ({ page, y: cursorY } = drawWrapped(
      page,
      "II. NỘI DUNG QUY ĐỊNH",
      pageMargin,
      cursorY,
      {
        size: fontSizeTitle,
      }
    ));
    for (let i = 0; i < regs.length; i++) {
      const r = regs[i];
      const head = `${i + 1}. ${r.title || "Quy định"}`;
      ({ page, y: cursorY } = drawWrapped(page, head, pageMargin, cursorY, {
        size: fontSizeBody + 1,
      }));
      if (r.description) {
        ({ page, y: cursorY } = drawWrapped(
          page,
          String(r.description),
          pageMargin + 16,
          cursorY
        ));
      }
      cursorY -= 4;
    }
  }

  return await pdfDoc.save();
}

/**
 * Word-wrapping cơ bản cho pdf-lib
 */
function wrapText(text, font, size, maxWidth) {
  const words = String(text).replace(/\r/g, "").split(/\s+/);
  const lines = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}