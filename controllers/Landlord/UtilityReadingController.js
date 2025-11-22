const UtilityReading = require("../../models/UtilityReading");
const Room = require("../../models/Room");
const Building = require("../../models/Building");

const toInt = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * GET /landlords/utility-readings
 * query:
 *  - buildingId
 *  - roomId
 *  - type (electricity | water)
 *  - periodMonth, periodYear
 *  - status
 *  - page, limit
 */
exports.listReadings = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      buildingId,
      roomId,
      type,
      status,
      periodMonth,
      periodYear,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isDeleted: false, landlordId };

    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (periodMonth) filter.periodMonth = Number(periodMonth);
    if (periodYear) filter.periodYear = Number(periodYear);

    const pageNumber = toInt(page, 1);
    const pageSize = Math.min(Math.max(toInt(limit, 20), 1), 100);
    const skip = (pageNumber - 1) * pageSize;

    const [items, total] = await Promise.all([
      UtilityReading.find(filter)
        .populate("roomId", "roomNumber buildingId")
        .populate("buildingId", "name address")
        .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      UtilityReading.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    console.error("listReadings error:", e);
    res.status(500).json({ message: "Lỗi lấy danh sách chỉ số tiện ích" });
  }
};

/**
 * Helper: lấy previousIndex cho 1 room + type
 */
async function getPreviousIndex({ roomId, type }) {
  // Lấy lần đọc gần nhất trước đó
  const last = await UtilityReading.findOne({
    roomId,
    type,
    isDeleted: false,
  })
    .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
    .lean();

  if (last) return last.currentIndex;

  // Nếu chưa có kỳ nào -> lấy từ room.eStart / room.wStart
  const room = await Room.findById(roomId)
    .select("eStart wStart buildingId")
    .lean();
  if (!room) throw new Error("Không tìm thấy phòng");

  if (type === "electricity") return room.eStart || 0;
  if (type === "water") return room.wStart || 0;
  return 0;
}

/**
 * POST /landlords/utility-readings
 * body:
 *  - roomId (required)
 *  - type: electricity | water (required)
 *  - periodMonth, periodYear (required)
 *  - currentIndex (required)
 *  - unitPrice (optional)
 *  - readingDate (optional)
 */
exports.createReading = async (req, res) => {
  try {
    const {
      landlordId,
      roomId,
      type,
      periodMonth,
      periodYear,
      currentIndex,
      unitPrice,
      readingDate,
    } = req.body || {};

    if (
      !roomId ||
      !type ||
      !periodMonth ||
      !periodYear ||
      currentIndex == null
    ) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc" });
    }

    const room = await Room.findById(roomId).select("buildingId").lean();
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    // Kiểm tra trùng kỳ (room + type + month/year)
    const existed = await UtilityReading.findOne({
      landlordId,
      roomId,
      type,
      periodMonth: Number(periodMonth),
      periodYear: Number(periodYear),
      isDeleted: false,
    }).lean();

    if (existed) {
      return res.status(400).json({
        message: "Đã tồn tại chỉ số cho phòng này, loại này, kỳ này",
      });
    }

    const previousIndex = await getPreviousIndex({ roomId, type });

    const doc = await UtilityReading.create({
      buildingId: room.buildingId,
      roomId,
      type,
      periodMonth: Number(periodMonth),
      periodYear: Number(periodYear),
      readingDate: readingDate ? new Date(readingDate) : new Date(),
      previousIndex,
      currentIndex: Number(currentIndex),
      unitPrice: unitPrice != null ? Number(unitPrice) : 0,
      createdById: landlordId,
    });

    res.status(201).json({
      message: "Tạo chỉ số tiện ích thành công",
      data: doc,
    });
  } catch (e) {
    console.error("createReading error:", e);
    res.status(400).json({ message: e.message });
  }
};

/**
 * GET /landlords/utility-readings/:id
 */
exports.getReading = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await UtilityReading.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("roomId", "roomNumber buildingId")
      .populate("buildingId", "name address")
      .lean();

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    res.json({ data: doc });
  } catch (e) {
    console.error("getReading error:", e);
    res.status(400).json({ message: e.message });
  }
};

/**
 * PATCH /landlords/utility-readings/:id
 * Chỉ cho update khi status = draft
 * body có thể gồm: currentIndex, unitPrice, readingDate, periodMonth, periodYear
 */
exports.updateReading = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;
    const {
      previousIndex,
      currentIndex,
      unitPrice,
      amount,
      type,
      periodMonth,
      periodYear,
      roomId,
      buildingId,
      note, // cho phép chỉnh note
      status, // cho phép landlord đổi từ 'draft' -> 'confirmed'
    } = req.body || {};

    const reading = await UtilityReading.findOne({
      _id: id,
      landlordId,
    });

    if (!reading) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    const locked = reading.status === "billed" || !!reading.invoiceId;

    if (locked) {
      // Nếu locked mà cố sửa field "critical"
      if (
        previousIndex != null ||
        currentIndex != null ||
        amount != null ||
        unitPrice != null ||
        type != null ||
        periodMonth != null ||
        periodYear != null ||
        roomId != null ||
        buildingId != null
      ) {
        return res.status(400).json({
          message:
            "Chỉ số đã được lập hoá đơn, không thể sửa các trường chỉ số/tiền. Chỉ được sửa ghi chú hoặc trạng thái hiển thị.",
        });
      }
    }

    // Cho phép update bình thường khi chưa lock
    if (!locked) {
      if (previousIndex != null) reading.previousIndex = previousIndex;
      if (currentIndex != null) reading.currentIndex = currentIndex;
      if (unitPrice != null) reading.unitPrice = unitPrice;
      if (amount != null) reading.amount = amount;
      if (type != null) reading.type = type;
      if (periodMonth != null) reading.periodMonth = periodMonth;
      if (periodYear != null) reading.periodYear = periodYear;
      if (roomId != null) reading.roomId = roomId;
      if (buildingId != null) reading.buildingId = buildingId;

      // Re-calc consumption nếu có current/previous
      if (
        reading.currentIndex != null &&
        reading.previousIndex != null &&
        reading.currentIndex >= reading.previousIndex
      ) {
        reading.consumption = reading.currentIndex - reading.previousIndex;
      }
    }

    // Các field vẫn cho phép chỉnh dù đã locked
    if (note != null) reading.note = note;
    if (!locked && status) {
      // chỉ cho đổi status khi chưa billed
      reading.status = status;
    }

    await reading.save();
    return res.json({ message: "Cập nhật thành công", data: reading });
  } catch (err) {
    console.error("updateReading error:", err);
    return res.status(500).json({ message: "Lỗi cập nhật chỉ số" });
  }
};

/**
 * POST /landlords/utility-readings/:id/confirm
 * Lock lại, không cho sửa nữa
 */
exports.confirmReading = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const doc = await UtilityReading.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    if (doc.status !== "draft") {
      return res.status(400).json({
        message: "Chỉ được xác nhận chỉ số khi đang ở trạng thái draft",
      });
    }

    doc.status = "confirmed";
    doc.confirmedAt = new Date();
    doc.confirmedById = landlordId;

    await doc.save();

    res.json({
      message: "Đã xác nhận chỉ số tiện ích",
      data: doc,
    });
  } catch (e) {
    console.error("confirmReading error:", e);
    res.status(400).json({ message: e.message });
  }
};

/**
 * DELETE /landlords/utility-readings/:id
 * Soft delete
 */
exports.deleteReading = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await UtilityReading.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    if (doc.status === "billed") {
      return res.status(400).json({
        message: "Không thể xóa chỉ số đã được lên hóa đơn",
      });
    }

    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();

    res.json({ message: "Đã xóa chỉ số tiện ích (soft delete)" });
  } catch (e) {
    console.error("deleteReading error:", e);
    res.status(400).json({ message: e.message });
  }
};
