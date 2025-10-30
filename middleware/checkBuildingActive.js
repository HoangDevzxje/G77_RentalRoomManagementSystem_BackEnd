const mongoose = require("mongoose");
const Building = require("../models/Building");

module.exports = async (req, res, next) => {
  try {
    // 1) Lấy buildingId từ nhiều nguồn (params/body/query)
    const buildingId =
      req.params.buildingId ||
      req.params.id ||
      req.body.buildingId ||
      req.query.buildingId;

    if (!buildingId) return next(); // route này không yêu cầu buildingId

    // 2) Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(buildingId)) {
      return res.status(400).json({ message: "buildingId không hợp lệ" });
    }

    // 3) Flag điều kiện từ query
    const includeDeleted = req.query.includeDeleted === "true";
    const allowInactive = req.query.allowInactive === "true";

    // 4) Tải tòa nhà (chỉ field cần thiết)
    const b = await Building.findById(buildingId)
      .select("_id status isDeleted landlordId")
      .lean();

    if (!b) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    }

    // 5) Nếu đã xóa mềm → chỉ Admin + includeDeleted mới được đi tiếp
    if (b.isDeleted) {
      // Cho phép admin xem khi includeDeleted=true (phục vụ trang Thùng rác)
      if (req.user?.role !== "admin" || !includeDeleted) {
        return res.status(410).json({ message: "Tòa nhà đã bị xóa" });
      }
    }

    // 6) Quyền landlord: chỉ thao tác trên tòa của mình
    if (
      req.user?.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền với tòa này" });
    }

    // 7) Trạng thái inactive: chặn mặc định, trừ khi cho phép qua allowInactive=true
    if (b.status === "inactive" && !allowInactive) {
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    }

    // 8) Gắn vào request để dùng phía sau (đỡ query lại)
    req.ctx = req.ctx || {};
    req.ctx.building = b;

    return next();
  } catch (e) {
    // Bắt lỗi CastError/khác và trả message rõ ràng
    return res.status(500).json({ message: e?.message || "Lỗi máy chủ" });
  }
};
