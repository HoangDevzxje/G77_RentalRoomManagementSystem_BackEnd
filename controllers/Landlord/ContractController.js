const Contract = require("../../models/Contract");
const Contact = require("../../models/Contact");
const ContractTemplate = require("../../models/ContractTemplate");
const Term = require("../../models/Term");
const Regulation = require("../../models/Regulation");

/** Helper: get value by key path "a.b.c" */
function getValueByKeyPath(obj, keyPath) {
  return keyPath.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

/** Validate required by template.fields before sign/send */
function validateRequiredByTemplate(template, contractDoc) {
  const requiredFields = (template?.fields || []).filter((f) => f.required);
  const dataRoot = {
    A: contractDoc.A || {},
    B: contractDoc.B || {},
    contract: contractDoc.contract || {},
    room: contractDoc.room || {},
  };

  const missing = [];
  for (const f of requiredFields) {
    const override = (contractDoc.fieldValues || []).find(
      (v) => v.key === f.key
    );
    const v = override?.value ?? getValueByKeyPath(dataRoot, f.key);
    const isEmpty =
      v === null || v === undefined || (typeof v === "string" && !v.trim());
    if (isEmpty)
      missing.push({ key: f.key, pdfField: f.pdfField, type: f.type });
  }

  if (missing.length) {
    const err = new Error(
      `Thiếu dữ liệu bắt buộc: ${missing.map((m) => m.key).join(", ")}`
    );
    err.code = "VALIDATION_REQUIRED_MISSING";
    err.missing = missing;
    throw err;
  }
}

/**
 * POST /landlords/contracts/from-contact
 * Body: { contactId }
 * Tạo contract draft từ contact + template của building (kèm default terms/regs)
 */
exports.createFromContact = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { contactId } = req.body;

    const contact = await Contact.findOne({
      _id: contactId,
      landlordId,
      isDeleted: { $ne: true },
    }).lean();
    if (!contact) return res.status(404).json({ message: "Contact not found" });

    const template = await ContractTemplate.findOne({
      buildingId: contact.buildingId,
      ownerId: landlordId,
      status: "active",
    }).lean();
    if (!template)
      return res
        .status(404)
        .json({ message: "Contract template not found for building" });

    const [terms, regs] = await Promise.all([
      Term.find({
        _id: { $in: template.defaultTermIds || [] },
        status: "active",
        isDeleted: { $ne: true },
      })
        .select("_id")
        .lean(),
      Regulation.find({
        _id: { $in: template.defaultRegulationIds || [] },
        status: "active",
      })
        .select("_id")
        .lean(),
    ]);

    const doc = await Contract.create({
      contactId: contact._id,
      landlordId,
      tenantId: contact.tenantId,
      buildingId: contact.buildingId,
      roomId: contact.roomId,
      templateId: template._id,

      A: {}, // điền ở FE
      B: { name: contact.contactName, phone: contact.contactPhone }, // gợi ý
      contract: {},
      room: {},

      termIds: terms.map((t) => t._id),
      regulationIds: regs.map((r) => r._id),

      status: "draft",
    });

    return res.json(doc);
  } catch (e) {
    return res
      .status(400)
      .json({ message: e.message, code: e.code, missing: e.missing });
  }
};

/**
 * PUT /landlords/contracts/:id
 * Body: { A?, B?, contract?, room?, fieldValues?, termIds?, regulationIds?, status? }
 * Cập nhật dữ liệu hợp đồng (form). Cho phép chuyển draft -> ready_for_sign
 */
exports.updateData = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;
    const payload = req.body || {};

    const doc = await Contract.findOne({ _id: id, landlordId });
    if (!doc) return res.status(404).json({ message: "Contract not found" });

    if (payload.A) doc.A = payload.A;
    if (payload.B) doc.B = payload.B;
    if (payload.contract) doc.contract = payload.contract;
    if (payload.room) doc.room = payload.room;

    if (Array.isArray(payload.fieldValues))
      doc.fieldValues = payload.fieldValues;
    if (Array.isArray(payload.termIds) && payload.termIds.length)
      doc.termIds = payload.termIds;
    if (Array.isArray(payload.regulationIds) && payload.regulationIds.length)
      doc.regulationIds = payload.regulationIds;

    if (
      payload.status &&
      ["draft", "ready_for_sign"].includes(payload.status)
    ) {
      doc.status = payload.status;
    }

    await doc.save();
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * POST /landlords/contracts/:id/sign-landlord
 * Body: { signatureUrl }
 * Lưu chữ ký chủ trọ (ảnh) và chuyển status -> signed_by_landlord
 */
exports.signByLandlord = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;
    const { signatureUrl } = req.body || {};
    if (!signatureUrl)
      return res.status(400).json({ message: "signatureUrl is required" });

    const doc = await Contract.findOne({ _id: id, landlordId }).populate(
      "templateId"
    );
    if (!doc) return res.status(404).json({ message: "Contract not found" });

    // Validate required trước khi ký
    try {
      validateRequiredByTemplate(doc.templateId, doc);
    } catch (err) {
      return res
        .status(422)
        .json({ message: err.message, code: err.code, missing: err.missing });
    }

    doc.landlordSignatureUrl = signatureUrl;
    doc.status = "signed_by_landlord";
    await doc.save();

    return res.json({ message: "Đã lưu chữ ký chủ trọ", status: doc.status });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * POST /landlords/contracts/:id/send-to-tenant
 * Đổi status -> sent_to_tenant (gửi trong hệ thống). Không cho tenant chỉnh sửa.
 */
exports.sendToTenant = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const doc = await Contract.findOne({ _id: id, landlordId }).populate(
      "templateId"
    );
    if (!doc) return res.status(404).json({ message: "Contract not found" });

    // Validate required lần cuối
    try {
      validateRequiredByTemplate(doc.templateId, doc);
    } catch (err) {
      return res
        .status(422)
        .json({ message: err.message, code: err.code, missing: err.missing });
    }

    const ALLOWED = new Set(["ready_for_sign", "signed_by_landlord"]);
    if (!ALLOWED.has(doc.status)) {
      return res.status(400).json({
        message: `Không thể gửi khi đang ở trạng thái: ${doc.status}`,
      });
    }

    doc.status = "sent_to_tenant";
    doc.sentToTenantAt = new Date();
    await doc.save();

    // (Tuỳ chọn) gửi notification real-time cho tenant ở đây

    return res.json({
      message: "Đã gửi hợp đồng trong hệ thống",
      status: doc.status,
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/** GET /landlords/contracts/:id - xem chi tiết (read-only) */
exports.getDetail = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const doc = await Contract.findOne({ _id: id, landlordId })
      .populate("termIds", "name description")
      .populate("regulationIds", "title description effectiveFrom")
      .lean();

    if (!doc) return res.status(404).json({ message: "Contract not found" });
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};
