const Floor = require("../models/Floor");
const Building = require("../models/Building");

module.exports = async function loadFloorAndCheckParent(req, res, next, id) {
  try {
    const f = await Floor.findById(id)
      .select("_id buildingId isDeleted")
      .lean();
    if (!f || f.isDeleted)
      return res
        .status(410)
        .json({ message: "Tầng đã bị xóa hoặc không tồn tại" });

    const b = await Building.findById(f.buildingId)
      .select("_id landlordId isDeleted status")
      .lean();
    if (!b) return res.status(404).json({ message: "Tòa không tồn tại" });

    const includeDeleted = req.query.includeDeleted === "true";
    const isAdmin = req.user?.role === "admin";
    if (b.isDeleted && !(isAdmin && includeDeleted)) {
      return res.status(410).json({ message: "Tòa đã bị xóa" });
    }

    if (
      req.user?.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền với tòa này" });
    }

    // // (Optional) Resident phải thuộc building được phép
    // if (req.user?.role === "resident") {
    //   const allowed =
    //     Array.isArray(req.user.memberOfBuildingIds) &&
    //     req.user.memberOfBuildingIds.map(String).includes(String(b._id));
    //   if (!allowed) return res.status(403).json({ message: "Không có quyền" });
    // }

    // Gắn sẵn để controller dùng
    req.ctx = req.ctx || {};
    req.ctx.floor = f;
    req.ctx.building = b;
    return next();
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
