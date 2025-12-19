const mongoose = require("mongoose");
const Building = require("../models/Building");

module.exports = async (req, res, next) => {
  try {
    const buildingId =
      req.params.buildingId ||
      req.params.id ||
      req.body.buildingId ||
      req.query.buildingId;

    if (!buildingId) return next();

    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: "buildingId không hợp lệ" });
    }

    const includeDeleted = req.query.includeDeleted === "true";
    const allowInactive = req.query.allowInactive === "true";

    const b = await Building.findById(buildingId)
      .select("_id status isDeleted landlordId")
      .lean();

    if (!b) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    }

    if (b.isDeleted) {
      if (req.user?.role !== "admin" || !includeDeleted) {
        return res.status(410).json({ message: "Tòa nhà đã bị xóa" });
      }
    }

    if (
      req.user?.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền với tòa này" });
    }

    if (b.status === "inactive" && !allowInactive) {
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    }

    req.ctx = req.ctx || {};
    req.ctx.building = b;

    return next();
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Lỗi máy chủ" });
  }
};
