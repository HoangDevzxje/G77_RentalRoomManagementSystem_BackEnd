const Regulation = require("../../models/Regulation");
const Building = require("../../models/Building");

// GET: Tenant & Landlord xem danh sách quy định
exports.getList = async (req, res) => {
  try {
    const { buildingId } = req.query;
    if (!buildingId)
      return res.status(400).json({ message: "Thiếu buildingId" });

    const building = await Building.findOne({
      _id: buildingId,
      isDeleted: false,
    }).select(
      "name address status ePrice wPrice eIndexType wIndexType landlordId"
    );

    if (!building) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà!" });
    }

    if (req.user.role === "staff") {
      // chú ý: assignedBuildingIds thường là ObjectId => so sánh string cho chắc
      const ok = (req.staff?.assignedBuildingIds || []).some(
        (id) => String(id) === String(buildingId)
      );
      if (!ok)
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
    }

    const query = { buildingId, status: "active" };

    const regulations = await Regulation.find(query)
      .populate({
        path: "createdBy",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .populate({
        path: "buildingId",
        select: "name address status ePrice wPrice eIndexType wIndexType",
        match: { isDeleted: false },
      })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(regulations);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// POST: Landlord tạo quy định mới
exports.create = async (req, res) => {
  try {
    const { buildingId, title, description, effectiveFrom } = req.body;
    if (!buildingId || !title || !description)
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });

    req.body.buildingId = buildingId;

    const building = await Building.findById(buildingId);
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa" });

    if (
      req.user.role !== "admin" &&
      String(building.landlordId) !== String(req.user._id) &&
      req.user.role !== "staff"
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền tạo quy định cho tòa này" });
    }
    const newReg = await Regulation.create({
      buildingId,
      title,
      description,
      effectiveFrom,
      createdBy: req.user._id,
    });

    return res
      .status(201)
      .json({ message: "Tạo quy định thành công", data: newReg });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// PUT: Landlord cập nhật quy định
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Thiếu id" });
    const reg = await Regulation.findById(id).populate("buildingId");
    if (!reg)
      return res.status(404).json({ message: "Không tìm thấy quy định" });

    if (
      req.user.role !== "admin" &&
      String(reg.buildingId.landlordId) !== String(req.user._id) &&
      req.user.role !== "staff"
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền chỉnh sửa quy định này" });
    }

    Object.assign(reg, req.body);
    await reg.save();

    return res.json({ message: "Cập nhật thành công", data: reg });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE: Landlord xóa quy định
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Thiếu id" });
    const reg = await Regulation.findById(id).populate("buildingId");
    if (!reg)
      return res.status(404).json({ message: "Không tìm thấy quy định" });

    if (
      req.user.role !== "admin" &&
      String(reg.buildingId.landlordId) !== String(req.user._id) &&
      req.user.role !== "staff"
    ) {
      return res
        .status(403)
        .json({ message: "Không có quyền xóa quy định này" });
    }

    await reg.deleteOne();
    return res.json({ message: "Đã xóa quy định" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
