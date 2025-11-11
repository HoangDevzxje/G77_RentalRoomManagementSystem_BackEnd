const Contract = require("../../models/Contract");

/** GET /contracts?status=sent_to_tenant */
exports.listMyContracts = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { status } = req.query;

    const filter = { tenantId };
    if (status) filter.status = status;

    const items = await Contract.find(filter)
      .select("_id status buildingId roomId sentToTenantAt updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json(items);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/** GET /contracts/:id - lấy chi tiết hợp đồng (read-only) */
exports.getMyContract = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const doc = await Contract.findOne({ _id: id, tenantId })
      .populate("termIds", "name description")
      .populate("regulationIds", "title description effectiveFrom")
      .lean();

    if (!doc) return res.status(404).json({ message: "Contract not found" });

    // (optional) đánh dấu đã xem lần đầu
    if (!doc.tenantSeenAt) {
      await Contract.updateOne(
        { _id: id },
        { $set: { tenantSeenAt: new Date() } }
      );
      doc.tenantSeenAt = new Date();
    }

    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};

/**
 * POST /contracts/:id/sign
 * Body: { signatureUrl }
 * Tenant ký → status: signed_by_tenant; nếu landlord cũng đã ký → completed
 * Lưu ý: Tenant CHỈ ký khi status === 'sent_to_tenant'
 */
exports.signByTenant = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { signatureUrl } = req.body || {};
    if (!signatureUrl)
      return res.status(400).json({ message: "signatureUrl is required" });

    const doc = await Contract.findOne({ _id: id, tenantId });
    if (!doc) return res.status(404).json({ message: "Contract not found" });

    if (doc.status !== "sent_to_tenant") {
      return res
        .status(400)
        .json({ message: `Không thể ký ở trạng thái: ${doc.status}` });
    }

    doc.tenantSignatureUrl = signatureUrl;
    doc.status = "signed_by_tenant";

    // Nếu landlord đã ký rồi → hoàn tất
    if (doc.landlordSignatureUrl) {
      doc.status = "completed";
    }

    await doc.save();
    return res.json({ message: "Đã ký hợp đồng", status: doc.status });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};
