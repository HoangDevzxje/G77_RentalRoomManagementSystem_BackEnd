const UtilityReading = require("../../models/UtilityReading");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const Contract = require("../../models/Contract");

const toInt = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Nếu chưa có, bạn có thể dùng lại từ InvoiceController hoặc define riêng:
function getPeriodRange(periodMonth, periodYear) {
  const start = new Date(periodYear, periodMonth - 1, 1, 0, 0, 0, 0);
  const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
  return { start, end };
}
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
exports.bulkCreateReadings = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { readings } = req.body || {};

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({
        message: "Danh sách readings phải là array và không được rỗng",
        data: [],
        total: 0,
      });
    }

    const results = [];

    for (let i = 0; i < readings.length; i++) {
      const payload = readings[i] || {};
      const {
        roomId,
        type,
        periodMonth,
        periodYear,
        currentIndex,
        unitPrice,
        readingDate,
      } = payload;

      const itemResult = {
        index: i,
        roomId,
        type,
        periodMonth,
        periodYear,
        success: false,
      };

      try {
        // 1) Validate cơ bản
        if (
          !roomId ||
          !type ||
          periodMonth == null ||
          periodYear == null ||
          currentIndex == null
        ) {
          itemResult.error = "Thiếu dữ liệu bắt buộc";
          results.push(itemResult);
          continue;
        }

        if (!["electricity", "water"].includes(type)) {
          itemResult.error = "Loại tiện ích không hợp lệ (electricity | water)";
          results.push(itemResult);
          continue;
        }

        const month = Number(periodMonth);
        const year = Number(periodYear);
        const currIdx = Number(currentIndex);

        if (!Number.isInteger(month) || month < 1 || month > 12) {
          itemResult.error = "Tháng không hợp lệ (1-12)";
          results.push(itemResult);
          continue;
        }
        if (!Number.isInteger(year) || year < 2000) {
          itemResult.error = "Năm không hợp lệ";
          results.push(itemResult);
          continue;
        }
        if (!Number.isFinite(currIdx) || currIdx < 0) {
          itemResult.error = "currentIndex phải là số >= 0";
          results.push(itemResult);
          continue;
        }

        // 2) Kiểm tra phòng + tòa thuộc landlord
        const room = await Room.findById(roomId)
          .select("buildingId isDeleted")
          .lean();

        if (!room || room.isDeleted) {
          itemResult.error = "Không tìm thấy phòng hoặc phòng đã bị xoá";
          results.push(itemResult);
          continue;
        }

        const building = await Building.findById(room.buildingId)
          .select("landlordId isDeleted status")
          .lean();

        if (
          !building ||
          building.isDeleted ||
          String(building.landlordId) !== String(landlordId)
        ) {
          itemResult.error =
            "Phòng không thuộc quyền quản lý của landlord hiện tại";
          results.push(itemResult);
          continue;
        }

        if (building.status !== "active") {
          itemResult.error = "Tòa nhà không ở trạng thái active";
          results.push(itemResult);
          continue;
        }

        // 3) Check trùng kỳ (thêm landlordId cho chặt chẽ)
        const existed = await UtilityReading.findOne({
          landlordId,
          roomId,
          type,
          periodMonth: month,
          periodYear: year,
          isDeleted: false,
        }).lean();

        if (existed) {
          itemResult.error =
            "Đã tồn tại chỉ số cho phòng này, loại này, kỳ này";
          results.push(itemResult);
          continue;
        }

        // 4) Lấy previousIndex (dùng helper sẵn có của bạn)
        const previousIndex = await getPreviousIndex({ roomId, type });

        // 5) Tạo UtilityReading
        const doc = await UtilityReading.create({
          landlordId,
          buildingId: room.buildingId,
          roomId,
          type,
          periodMonth: month,
          periodYear: year,
          readingDate: readingDate ? new Date(readingDate) : new Date(),
          previousIndex,
          currentIndex: currIdx,
          unitPrice: unitPrice != null ? Number(unitPrice) : 0,
          createdById: landlordId,
        });

        itemResult.success = true;
        itemResult.data = doc;
        results.push(itemResult);
      } catch (err) {
        console.error("bulkCreateReadings item error:", err);
        itemResult.error = err.message || "Lỗi không xác định";
        results.push(itemResult);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return res.status(successCount > 0 ? 200 : 400).json({
      message: `Đã xử lý ${results.length} chỉ số: thành công ${successCount}, lỗi ${failCount}`,
      data: results,
      total: results.length,
      successCount,
      failCount,
    });
  } catch (e) {
    console.error("bulkCreateReadings error:", e);
    res.status(500).json({
      message: e.message || "Server error",
      data: [],
      total: 0,
    });
  }
};
/**
 * GET /landlords/utility-readings/rooms
 * Lấy danh sách phòng:
 *  - thuộc landlord hiện tại
 *  - phòng đang rented
 *  - có hợp đồng completed hiệu lực trong kỳ periodMonth/periodYear
 *  - kèm trạng thái đã nhập điện/nước trong kỳ
 */
exports.listRoomsForUtility = async (req, res) => {
  try {
    const landlordId = req.user?._id;

    let {
      buildingId,
      periodMonth,
      periodYear,
      q,
      page = 1,
      limit = 20,
    } = req.query;

    const now = new Date();
    const month = toInt(periodMonth, now.getMonth() + 1);
    const year = toInt(periodYear, now.getFullYear());
    const pageNum = Math.max(toInt(page, 1), 1);
    const limitNum = Math.max(toInt(limit, 20), 1);

    // 1) Tìm tất cả hợp đồng completed, hiệu lực trong kỳ
    const { start, end } = getPeriodRange(month, year);

    const activeContracts = await Contract.find({
      landlordId,
      status: "completed",
      "contract.startDate": { $lte: end },
      $or: [
        { "contract.endDate": { $gte: start } },
        { "contract.endDate": null },
      ],
      isDeleted: false,
    })
      .select("roomId")
      .lean();

    const roomIds = [
      ...new Set(
        activeContracts
          .map((c) => c.roomId && c.roomId.toString())
          .filter(Boolean)
      ),
    ];

    if (!roomIds.length) {
      return res.json({
        message: "Không có phòng nào có hợp đồng hiệu lực trong kỳ này",
        data: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        periodMonth: month,
        periodYear: year,
      });
    }

    // 2) Lọc Room trong roomIds: đang rented, không xoá, (option: theo buildingId, q)
    const roomFilter = {
      _id: { $in: roomIds },
      status: "rented",
      isDeleted: false,
    };

    if (buildingId) {
      roomFilter.buildingId = buildingId;
    }
    if (q) {
      roomFilter.roomNumber = { $regex: q, $options: "i" };
    }

    const [rooms, total] = await Promise.all([
      Room.find(roomFilter)
        .populate("buildingId", "name address status isDeleted")
        .populate("floorId", "floorNumber level status isDeleted")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Room.countDocuments(roomFilter),
    ]);

    if (!rooms.length) {
      return res.json({
        message: "Không có phòng thoả điều kiện",
        data: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        periodMonth: month,
        periodYear: year,
      });
    }

    // 3) Lấy trạng thái UtilityReading cho từng phòng trong kỳ (1 query duy nhất)
    const pageRoomIds = rooms.map((r) => r._id.toString());

    const readings = await UtilityReading.find({
      landlordId,
      roomId: { $in: pageRoomIds },
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
    })
      .select("roomId type status")
      .lean();

    // Xây map: roomId -> { electricity: {hasReading, status}, water: {...} }
    const readingMap = {};
    for (const r of readings) {
      const rid = r.roomId.toString();
      if (!readingMap[rid]) {
        readingMap[rid] = {
          electricity: { hasReading: false, status: null },
          water: { hasReading: false, status: null },
        };
      }
      const key = r.type === "water" ? "water" : "electricity";
      const current = readingMap[rid][key];

      // Ưu tiên thứ tự status: billed > confirmed > draft
      const rank = { billed: 3, confirmed: 2, draft: 1 };
      const newRank = rank[r.status] || 0;
      const oldRank = rank[current.status] || 0;

      if (newRank >= oldRank) {
        readingMap[rid][key] = {
          hasReading: true,
          status: r.status,
        };
      }
    }

    // 4) Gắn meterStatus + template cho FE vào từng room
    const data = rooms.map((room) => {
      const rid = room._id.toString();
      const meterStatus = readingMap[rid] || {
        electricity: { hasReading: false, status: null },
        water: { hasReading: false, status: null },
      };

      // Template cho FE nhập nhanh
      const readingTemplate = {
        roomId: room._id,
        periodMonth: month,
        periodYear: year,
        electricity: {
          type: "electricity",
          currentIndex: null,
          unitPrice: null,
          readingDate: null,
        },
        water: {
          type: "water",
          currentIndex: null,
          unitPrice: null,
          readingDate: null,
        },
      };

      return {
        ...room,
        meterStatus,
        readingTemplate,
      };
    });

    return res.json({
      message: "Danh sách phòng có hợp đồng hiệu lực trong kỳ",
      data,
      total,
      page: pageNum,
      limit: limitNum,
      periodMonth: month,
      periodYear: year,
    });
  } catch (e) {
    console.error("listRoomsForUtility error:", e);
    return res.status(500).json({
      message: e.message || "Server error",
      data: [],
      total: 0,
    });
  }
};
