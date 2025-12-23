const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const ContractTemplate = require("../../models/ContractTemplate");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");
const contentDisposition = require("content-disposition");
const he = require("he");
const Building = require("../../models/Building");

const FONT_REGULAR =
  process.env.CONTRACT_FONT_PATH || "public/fonts/NotoSans-Regular.ttf";

/**
 * Tạo template mới cho 1 tòa (landlord). Mỗi tòa CHỈ 1 template.
 * Body tối thiểu: { buildingId, name?, defaultTermIds?, defaultRegulationIds? }
 */
exports.create = async (req, res) => {
  try {
    const {
      buildingId,
      name,
      defaultTermIds = [],
      defaultRegulationIds = [],
    } = req.body;
    req.body.buildingId = buildingId;
    if (!buildingId)
      return res.status(400).json({ message: "buildingId is required" });
    const building = await Building.findById(buildingId);
    // Kiểm tra đã tồn tại template cho tòa này chưa
    const existed = await ContractTemplate.findOne({ buildingId }).lean();
    if (existed) {
      return res
        .status(409)
        .json({ message: "Template already exists for this building" });
    }

    await validateTermsRegsBasic(defaultTermIds, defaultRegulationIds);

    const doc = await ContractTemplate.create({
      buildingId,
      ownerId: building.landlordId,
      name: name || "Mẫu Hợp Đồng Thuê Phòng",
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
    req.query.buildingId = buildingId;
    const doc = await ContractTemplate.findOne({ buildingId })
      .populate({
        path: "buildingId",
        select: "name address status eIndexType ePrice wIndexType wPrice",
        match: { isDeleted: false },
      })
      .lean();
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
      { _id: id },
      { $set: updatable },
      { new: true }
    );

    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy mẫu hợp đồng" });
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
    const template = await ContractTemplate.findById(id).select("buildingId");
    if (!template)
      return res.status(404).json({ message: "Không tìm thấy mẫu hợp đồng" });

    const doc = await ContractTemplate.findOneAndDelete({
      _id: id,
    });
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy mẫu hợp đồng" });
    return res.json({ message: "Xóa mẫu hợp đồng thành công" });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * List tất cả template thuộc landlord (nếu landlord quản nhiều tòa).
 */
exports.listMine = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "staff") {
      const buildings = await Building.find({
        _id: { $in: req.staff.assignedBuildingIds },
        isDeleted: false,
      }).distinct("_id");
      filter.buildingId = { $in: buildings };
    } else {
      filter.ownerId = req.user._id;
    }

    const items = await ContractTemplate.find(filter)
      .populate({
        path: "buildingId",
        select: "name address status eIndexType ePrice wIndexType wPrice",
        match: { isDeleted: false },
      })
      .lean();

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
function pickArr(q, baseKey) {
  const direct = q[baseKey];
  const bracket = q[`${baseKey}[]`];

  if (Array.isArray(direct)) return direct.filter(Boolean);
  if (Array.isArray(bracket)) return bracket.filter(Boolean);

  const one = direct ?? bracket;
  if (!one) return [];
  if (typeof one === "string") {
    if (one.includes(","))
      return one
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return [one.trim()];
  }
  return [];
}

// Tên file an toàn
function sanitizeFileName(name) {
  return String(name || "download.pdf")
    .replace(/[\r\n]/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/\s+/g, " ");
}

// HTML helpers
function isHtml(s = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(s));
}
function inlineText(html = "") {
  const decoded = he.decode(String(html));
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n");
  return withBreaks.replace(/<\/?(strong|em|b|i|u|span|p)>/gi, "");
}
function extractListItems(html = "") {
  const decoded = he.decode(String(html));
  const listMatch = decoded.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
  if (!listMatch) return null;
  const isOrdered = /^<ol/i.test(listMatch[0]);
  const body = listMatch[2];

  const items = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(body))) {
    const text = inlineText(m[1]).trim();
    if (text) items.push(text);
  }
  return { isOrdered, items };
}

exports.previewPdf = async (req, res) => {
  let doc;

  try {
    const buildingId = String(req.query.buildingId || "").trim();
    req.query.buildingId = buildingId;
    if (!buildingId)
      return res.status(400).json({ message: "buildingId is required" });

    // Lấy mảng ID từ query
    const termIds = pickArr(req.query, "termIds");
    const regulationIds = pickArr(req.query, "regulationIds");

    // Tên file an toàn
    const rawName =
      req.query.fileName ||
      `${req.query.templateName || "HopDong_ThuPhong"}_XemTruoc.pdf`;
    const safeName = sanitizeFileName(rawName).endsWith(".pdf")
      ? sanitizeFileName(rawName)
      : `${sanitizeFileName(rawName)}.pdf`;

    // Lấy template theo quyền sở hữu
    const template = await ContractTemplate.findOne({
      buildingId,
    }).lean();
    if (!template)
      return res.status(404).json({ message: "Template not found" });

    // ====== LẤY ĐÚNG FIELD CỦA TERM & REGULATION ======
    const [terms, regs] = await Promise.all([
      termIds.length
        ? Term.find({
            _id: { $in: termIds },
            status: "active",
            isDeleted: { $ne: true },
          })
            .select("name description") // <-- name + description
            .lean()
        : Promise.resolve([]),
      regulationIds.length
        ? Regulation.find({
            _id: { $in: regulationIds },
            status: "active",
          })
            .select("title description effectiveFrom") // <-- title + description + effectiveFrom
            .lean()
        : Promise.resolve([]),
    ]);

    // ==== Khởi tạo PDF (chưa pipe) ====
    const FONT_REGULAR =
      process.env.CONTRACT_FONT_PATH || "public/fonts/NotoSans-Regular.ttf";
    const FONT_BOLD =
      process.env.CONTRACT_FONT_BOLD_PATH || "public/fonts/NotoSans-Bold.ttf";

    doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, left: 50, right: 50, bottom: 50 },
    });

    doc.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || "PDF stream error" });
      } else {
        try {
          res.end();
        } catch {}
      }
    });

    try {
      doc.font(FONT_REGULAR); // font tiếng Việt
    } catch (e) {
      doc.font("Times-Roman"); // fallback (có thể lỗi dấu)
    }

    // ===== Render header =====
    doc
      .fontSize(12)
      .text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" })
      .moveDown(0.2)
      .text("ĐỘC LẬP – TỰ DO – HẠNH PHÚC", { align: "center" });

    doc.moveDown(0.8);
    try {
      doc.font(FONT_BOLD);
    } catch {}
    doc.fontSize(16).text("HỢP ĐỒNG THUÊ PHÒNG" || template.name, {
      align: "center",
      underline: true,
    });

    try {
      doc.font(FONT_REGULAR);
    } catch {}
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor("gray")
      .text("Số: ....../...../HĐTN", { align: "center" })
      .fillColor("black");

    doc.moveDown(1);
    doc
      .fontSize(12)
      .text("Hôm nay, ngày ... tháng ... năm 202..., tại: ..................")
      .moveDown(0.5)
      .text(
        "BÊN CHO THUÊ NHÀ (BÊN A): ........................................"
      )
      .text(
        "Đại diện (Ông/Bà): ................................................"
      )
      .text(
        "CCCD: ..............  Cấp ngày: ........., Nơi cấp: ..............."
      )
      .text(
        "Hộ khẩu thường trú: ..............................................."
      )
      .text(
        "Điện thoại: ..........................  STK: ......................."
      )
      .moveDown(0.5)
      .text(
        "BÊN THUÊ NHÀ (BÊN B): ............................................."
      )
      .text(
        "Đại diện (Ông/Bà): ................................................"
      )
      .text(
        "CCCD/Passport: ..........  Cấp ngày: ........., Tại: .............."
      )
      .text(
        "Hộ khẩu thường trú: ..............................................."
      )
      .text(
        "Điện thoại: ......................................................"
      );

    // ===== Render Điều khoản (Terms) =====
    if (terms.length) {
      doc.moveDown(1);
      try {
        doc.font(FONT_BOLD);
      } catch {}
      doc.fontSize(13).text("I. NỘI DUNG ĐIỀU KHOẢN", { underline: true });
      try {
        doc.font(FONT_REGULAR);
      } catch {}
      doc.moveDown(0.3);

      terms.forEach((t, idx) => {
        try {
          doc.font(FONT_BOLD);
        } catch {}
        doc.fontSize(12).text(`${idx + 1}. ${t.name || "Điều khoản"}`);
        try {
          doc.font(FONT_REGULAR);
        } catch {}

        const desc = t.description || "";
        if (!desc) {
          doc.moveDown(0.3);
          return;
        }

        if (isHtml(desc)) {
          const list = extractListItems(desc);
          if (list && list.items.length) {
            doc.moveDown(0.2);
            list.items.forEach((it, i) => {
              const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
              try {
                doc.font(FONT_BOLD);
              } catch {}
              doc.fontSize(11).text(prefix, { continued: true });
              try {
                doc.font(FONT_REGULAR);
              } catch {}
              doc.fontSize(11).text(it, {
                paragraphGap: 4,
                align: "justify",
              });
            });
          } else {
            doc.moveDown(0.2);
            doc
              .fontSize(11)
              .text(inlineText(desc), { align: "justify", paragraphGap: 6 });
          }
        } else {
          doc.moveDown(0.2);
          doc
            .fontSize(11)
            .text(String(desc), { align: "justify", paragraphGap: 6 });
        }
        doc.moveDown(0.3);
      });
    }

    // ===== Render Quy định (Regulations) =====
    if (regs.length) {
      doc.moveDown(0.6);
      try {
        doc.font(FONT_BOLD);
      } catch {}
      doc.fontSize(13).text("II. QUY ĐỊNH", { underline: true });
      try {
        doc.font(FONT_REGULAR);
      } catch {}
      doc.moveDown(0.3);

      regs.forEach((r, idx) => {
        try {
          doc.font(FONT_BOLD);
        } catch {}
        doc.fontSize(12).text(`${idx + 1}. ${r.title || "Quy định"}`);
        try {
          doc.font(FONT_REGULAR);
        } catch {}

        if (r.effectiveFrom) {
          const d = new Date(r.effectiveFrom);
          const dStr = `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}/${d.getFullYear()}`;
          doc.fontSize(10).fillColor("gray").text(`(Hiệu lực từ: ${dStr})`);
          doc.fillColor("black");
        }

        const desc = r.description || "";
        if (!desc) {
          doc.moveDown(0.3);
          return;
        }

        if (isHtml(desc)) {
          const list = extractListItems(desc);
          if (list && list.items.length) {
            doc.moveDown(0.2);
            list.items.forEach((it, i) => {
              const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
              try {
                doc.font(FONT_BOLD);
              } catch {}
              doc.fontSize(11).text(prefix, { continued: true });
              try {
                doc.font(FONT_REGULAR);
              } catch {}
              doc.fontSize(11).text(it, {
                paragraphGap: 4,
                align: "justify",
              });
            });
          } else {
            doc.moveDown(0.2);
            doc
              .fontSize(11)
              .text(inlineText(desc), { align: "justify", paragraphGap: 6 });
          }
        } else {
          doc.moveDown(0.2);
          doc
            .fontSize(11)
            .text(String(desc), { align: "justify", paragraphGap: 6 });
        }
        doc.moveDown(0.3);
      });
    }

    // Ký tên
    doc.moveDown(1);
    doc
      .fontSize(12)
      .text("ĐẠI DIỆN BÊN A", { align: "left", continued: true })
      .text("ĐẠI DIỆN BÊN B", { align: "right" });
    doc.moveDown(3);
    doc
      .text("(Ký, ghi rõ họ tên)", { align: "left", continued: true })
      .text("(Ký, ghi rõ họ tên)", { align: "right" });

    // ======= MỌI THỨ OK → set header & pipe =======
    const cd = contentDisposition(safeName, { type: "attachment" });
    res.setHeader("Content-Disposition", cd);
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);
    doc.end();
  } catch (e) {
    if (!res.headersSent) {
      return res.status(400).json({ message: e.message || "Bad Request" });
    }
    try {
      res.end();
    } catch {}
  }
};
