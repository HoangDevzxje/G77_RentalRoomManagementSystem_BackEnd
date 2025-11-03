const BuildingService = require("../../models/BuildingService");
const Building = require("../../models/Building");

// Helper: xác thực landlord sở hữu tòa
async function assertLandlordOwnsBuilding(landlordId, buildingId) {
  const b = await Building.findById(buildingId).select("_id landlordId");
  if (!b) {
    const err = new Error("Không tìm thấy tòa nhà");
    err.statusCode = 404;
    throw err;
  }
  if (b.landlordId.toString() !== landlordId.toString()) {
    const err = new Error("Không có quyền thao tác với tòa nhà này");
    err.statusCode = 403;
    throw err;
  }
  return true;
}

// GET /buildings/:buildingId/services?includeDeleted=1
exports.listByBuilding = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const landlordId = req.user?._id || req.query.landlordId; // tùy auth
    await assertLandlordOwnsBuilding(landlordId, buildingId);

    const filter = { buildingId };
    if (!req.query.includeDeleted) filter.isDeleted = false;

    const list = await BuildingService.find(filter).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
};

// POST /buildings/:buildingId/services
exports.create = async (req, res) => {
  try {
    const { buildingId } = req.params;
    const landlordId = req.user?._id || req.body.landlordId;

    await assertLandlordOwnsBuilding(landlordId, buildingId);

    const {
      name,
      label,
      description,
      chargeType = "fixed",
      fee = 0,
      currency = "VND",
    } = req.body;

    const created = await BuildingService.create({
      buildingId,
      landlordId,
      name,
      label,
      description,
      chargeType,
      fee,
      currency,
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// PATCH /buildings/:buildingId/services/:id
exports.update = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    const landlordId = req.user?._id || req.body.landlordId;

    await assertLandlordOwnsBuilding(landlordId, buildingId);

    const payload = { ...req.body };
    // Không cho đổi buildingId/landlordId qua payload
    delete payload.buildingId;
    delete payload.landlordId;

    // Nếu chuyển sang included thì fee=0
    if (payload.chargeType === "included") payload.fee = 0;

    const updated = await BuildingService.findOneAndUpdate(
      { _id: id, buildingId, isDeleted: false },
      { $set: payload },
      { new: true }
    );

    if (!updated)
      return res
        .status(404)
        .json({ message: "Không tìm thấy dịch vụ hoặc đã bị xóa" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE (soft) /buildings/:buildingId/services/:id
exports.remove = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    const landlordId = req.user?._id || req.body.landlordId;

    await assertLandlordOwnsBuilding(landlordId, buildingId);

    const item = await BuildingService.findOne({
      _id: id,
      buildingId,
      isDeleted: false,
    });
    if (!item)
      return res
        .status(404)
        .json({ message: "Không tìm thấy dịch vụ hoặc đã bị xóa" });

    item.isDeleted = true;
    item.deletedAt = new Date();
    await item.save();

    res.json({ message: "Đã đánh dấu xóa dịch vụ" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// POST /buildings/:buildingId/services/:id/restore
exports.restore = async (req, res) => {
  try {
    const { buildingId, id } = req.params;
    const landlordId = req.user?._id || req.body.landlordId;

    await assertLandlordOwnsBuilding(landlordId, buildingId);

    const restored = await BuildingService.findOneAndUpdate(
      { _id: id, buildingId, isDeleted: true },
      { $set: { isDeleted: false, deletedAt: null } },
      { new: true }
    );

    if (!restored)
      return res.status(404).json({ message: "Không tìm thấy bản ghi đã xóa" });
    res.json(restored);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
