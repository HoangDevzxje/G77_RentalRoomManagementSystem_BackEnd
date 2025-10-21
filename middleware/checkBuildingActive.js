const Building = require("../models/Building");

module.exports = async (req, res, next) => {
  try {
    const buildingId =
      req.body.buildingId || req.params.buildingId || req.query.buildingId;

    if (!buildingId) return next(); // route không cần buildingId

    const b = await Building.findById(buildingId).select(
      "status isDeleted landlordId"
    );
    if (!b || b.isDeleted) {
      return res
        .status(404)
        .json({ message: "Tòa nhà không tồn tại hoặc đã bị xóa" });
    }
    // Landlord chỉ được thao tác trên tòa của mình
    if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền với tòa này" });
    }
    if (b.status === "inactive") {
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    }
    next();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
