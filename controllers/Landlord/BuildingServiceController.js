const Building = require("../../models/Building");
const BuildingService = require("../../models/BuildingService");

// === HELPER: Xác thực quyền sở hữu tòa nhà (Landlord) HOẶC staff được giao ===
async function assertCanAccessBuilding(req, buildingId) {
  const user = req.user;
  const staff = req.staff;

  if (!user) throw Object.assign(new Error("Không có người dùng"), { statusCode: 401 });

  if (user.role === "landlord") {
    const b = await Building.findOne({ _id: buildingId, landlordId: user._id, isDeleted: false });
    if (!b) throw Object.assign(new Error("Không tìm thấy tòa nhà hoặc không có quyền"), { statusCode: 404 });
    return b;
  }

  if (user.role === "staff") {
    if (!staff?.assignedBuildingIds?.includes(buildingId)) {
      throw Object.assign(new Error("Bạn không được quản lý tòa nhà này"), { statusCode: 403 });
    }
    const b = await Building.findById(buildingId).select("_id landlordId").lean();
    if (!b) throw Object.assign(new Error("Không tìm thấy tòa nhà"), { statusCode: 404 });
    return b;
  }
  if (user.role === "resident") {
    const b = await Building.findById(buildingId)
      .select("_id landlordId name address")
      .lean();

    if (!b || b.isDeleted) {
      throw Object.assign(new Error("Không tìm thấy tòa nhà"), { statusCode: 404 });
    }
    return b;
  }
  throw Object.assign(new Error("Vai trò không hợp lệ"), { statusCode: 403 });
}

exports.listByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    if (!buildingId) return res.status(400).json({ message: "Thiếu buildingId" });
    await assertCanAccessBuilding(req, buildingId);

    const filter = { buildingId };
    if (req.query.includeDeleted !== "true") filter.isDeleted = false;

    const list = await BuildingService.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json(list);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// POST /buildings/:buildingId/services
exports.create = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const building = await assertCanAccessBuilding(req, buildingId);

    const {
      name,
      label,
      description,
      chargeType = "fixed",
      fee = 0,
      currency = "VND",
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: "Thiếu tên dịch vụ" });
    const service = await BuildingService.create({
      buildingId,
      landlordId: building.landlordId,
      name: name.trim(),
      label: label?.trim() || name.trim(),
      description: description?.trim() || "",
      chargeType,
      fee: chargeType === "included" ? 0 : Math.max(0, Number(fee)),
      currency,
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// PATCH /buildings/:buildingId/services/:id
exports.update = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    await assertCanAccessBuilding(req, buildingId);

    const payload = { ...req.body };
    delete payload.buildingId;
    delete payload.landlordId;

    if (payload.chargeType === "included") payload.fee = 0;

    const updated = await BuildingService.findOneAndUpdate(
      { _id: id, buildingId, isDeleted: false },
      { $set: payload },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy dịch vụ hoặc đã bị xóa" });
    }

    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// DELETE (soft) /buildings/:buildingId/services/:id
exports.remove = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    await assertCanAccessBuilding(req, buildingId);

    const service = await BuildingService.findOne({ _id: id, buildingId, isDeleted: false });
    if (!service) {
      return res.status(404).json({ message: "Không tìm thấy dịch vụ hoặc đã bị xóa" });
    }

    service.isDeleted = true;
    service.deletedAt = new Date();
    await service.save();

    res.json({ message: "Đã đánh dấu xóa dịch vụ" });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// POST /buildings/:buildingId/services/:id/restore
exports.restore = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    await assertCanAccessBuilding(req, buildingId);

    const restored = await BuildingService.findOneAndUpdate(
      { _id: id, buildingId, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    );

    if (!restored) {
      return res.status(404).json({ message: "Không tìm thấy bản ghi đã xóa" });
    }

    res.json(restored);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};