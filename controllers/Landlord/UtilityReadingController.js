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
 *  - status
 *  - periodMonth, periodYear
 *  - page, limit
 */
exports.listReadings = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      buildingId,
      roomId,
      status,
      periodMonth,
      periodYear,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isDeleted: false, landlordId };

    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
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
    res.status(500).json({ message: e.message || "Server error" });
  }
};

/**
 * Helper: lấy previous index điện + nước cho 1 phòng.
 * - Ưu tiên lấy từ UtilityReading gần nhất.
 * - Nếu chưa có -> lấy từ Room.eStart / Room.wStart.
 */
async function getPreviousIndexes(roomId) {
  const last = await UtilityReading.findOne({
    roomId,
    isDeleted: false,
  })
    .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
    .lean();

  if (last) {
    return {
      ePreviousIndex:
        typeof last.eCurrentIndex === "number" &&
        Number.isFinite(last.eCurrentIndex)
          ? last.eCurrentIndex
          : 0,
      wPreviousIndex:
        typeof last.wCurrentIndex === "number" &&
        Number.isFinite(last.wCurrentIndex)
          ? last.wCurrentIndex
          : 0,
    };
  }

  const room = await Room.findById(roomId)
    .select("eStart wStart buildingId")
    .lean();
  if (!room) throw new Error("Không tìm thấy phòng");

  return {
    ePreviousIndex:
      typeof room.eStart === "number" && Number.isFinite(room.eStart)
        ? room.eStart
        : 0,
    wPreviousIndex:
      typeof room.wStart === "number" && Number.isFinite(room.wStart)
        ? room.wStart
        : 0,
  };
}

// POST /landlords/utility-readings
// Body: { roomId, periodMonth, periodYear, eCurrentIndex?, wCurrentIndex? }
exports.createReading = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { roomId, periodMonth, periodYear, eCurrentIndex, wCurrentIndex } =
      req.body || {};

    if (!roomId || periodMonth == null || periodYear == null) {
      return res.status(400).json({ message: "Thiếu roomId / kỳ" });
    }

    const month = Number(periodMonth);
    const year = Number(periodYear);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Tháng không hợp lệ (1-12)" });
    }

    if (!Number.isInteger(year) || year < 2000) {
      return res.status(400).json({ message: "Năm không hợp lệ" });
    }

    // Phòng + tòa nhà
    const room = await Room.findById(roomId)
      .select("buildingId isDeleted eStart wStart")
      .lean();

    if (!room || room.isDeleted) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy phòng hoặc phòng đã bị xóa" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId isDeleted status ePrice wPrice")
      .lean();

    if (
      !building ||
      building.isDeleted ||
      String(building.landlordId) !== String(landlordId)
    ) {
      return res
        .status(403)
        .json({ message: "Phòng không thuộc quyền quản lý của landlord" });
    }

    if (building.status !== "active") {
      return res
        .status(400)
        .json({ message: "Tòa nhà không ở trạng thái active" });
    }

    // Check trùng kỳ
    const existed = await UtilityReading.findOne({
      landlordId,
      roomId,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
    }).lean();

    if (existed) {
      return res.status(400).json({
        message: "Đã tồn tại chỉ số cho phòng này trong kỳ này",
      });
    }

    // previous indexes
    const { ePreviousIndex, wPreviousIndex } = await getPreviousIndexes(roomId);

    // Validate current indexes
    let eCurr = null;
    if (eCurrentIndex != null) {
      eCurr = Number(eCurrentIndex);
      if (!Number.isFinite(eCurr) || eCurr < 0) {
        return res
          .status(400)
          .json({ message: "eCurrentIndex phải là số >= 0" });
      }
      if (eCurr < ePreviousIndex) {
        return res.status(400).json({
          message:
            "eCurrentIndex phải >= ePreviousIndex (chỉ số điện kỳ trước)",
        });
      }
    }

    let wCurr = null;
    if (wCurrentIndex != null) {
      wCurr = Number(wCurrentIndex);
      if (!Number.isFinite(wCurr) || wCurr < 0) {
        return res
          .status(400)
          .json({ message: "wCurrentIndex phải là số >= 0" });
      }
      if (wCurr < wPreviousIndex) {
        return res.status(400).json({
          message:
            "wCurrentIndex phải >= wPreviousIndex (chỉ số nước kỳ trước)",
        });
      }
    }

    const eUnitPrice =
      typeof building.ePrice === "number" && Number.isFinite(building.ePrice)
        ? building.ePrice
        : 0;
    const wUnitPrice =
      typeof building.wPrice === "number" && Number.isFinite(building.wPrice)
        ? building.wPrice
        : 0;

    const eConsumption =
      eCurr != null && Number.isFinite(ePreviousIndex)
        ? eCurr - ePreviousIndex
        : 0;
    const eAmount = eConsumption * eUnitPrice;

    const wConsumption =
      wCurr != null && Number.isFinite(wPreviousIndex)
        ? wCurr - wPreviousIndex
        : 0;
    const wAmount = wConsumption * wUnitPrice;

    const doc = await UtilityReading.create({
      landlordId,
      buildingId: room.buildingId,
      roomId,
      periodMonth: month,
      periodYear: year,
      readingDate: new Date(), // auto = thời điểm nhập, không cho chọn tay
      ePreviousIndex,
      eCurrentIndex: eCurr,
      eConsumption,
      eUnitPrice,
      eAmount,
      wPreviousIndex,
      wCurrentIndex: wCurr,
      wConsumption,
      wUnitPrice,
      wAmount,
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
 * PUT /landlords/utility-readings/:id
 * Chỉ số đã billed (hoặc có invoiceId) thì không cho sửa index/tiền/kỳ/phòng.
 */
exports.updateReading = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const {
      ePreviousIndex,
      eCurrentIndex,
      eUnitPrice,
      wPreviousIndex,
      wCurrentIndex,
      wUnitPrice,
      periodMonth,
      periodYear,
      roomId,
      buildingId,
      status,
      note,
    } = req.body || {};

    const reading = await UtilityReading.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    });

    if (!reading) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    const locked = reading.status === "billed" || !!reading.invoiceId;

    if (locked) {
      if (
        ePreviousIndex != null ||
        eCurrentIndex != null ||
        eUnitPrice != null ||
        wPreviousIndex != null ||
        wCurrentIndex != null ||
        wUnitPrice != null ||
        periodMonth != null ||
        periodYear != null ||
        roomId != null ||
        buildingId != null
      ) {
        return res.status(400).json({
          message:
            "Chỉ số đã được lập hoá đơn, không thể sửa các trường chỉ số/tiền/kỳ/phòng. Chỉ được sửa ghi chú hoặc trạng thái hiển thị.",
        });
      }
    }

    // Nếu chưa lock, cho phép cập nhật nhưng phải validate
    if (!locked) {
      // ePreviousIndex
      if (ePreviousIndex != null) {
        const prev = Number(ePreviousIndex);
        if (!Number.isFinite(prev) || prev < 0) {
          return res
            .status(400)
            .json({ message: "ePreviousIndex phải là số >= 0" });
        }
        reading.ePreviousIndex = prev;
      }

      // wPreviousIndex
      if (wPreviousIndex != null) {
        const prev = Number(wPreviousIndex);
        if (!Number.isFinite(prev) || prev < 0) {
          return res
            .status(400)
            .json({ message: "wPreviousIndex phải là số >= 0" });
        }
        reading.wPreviousIndex = prev;
      }

      // eCurrentIndex
      if (eCurrentIndex != null) {
        const curr = Number(eCurrentIndex);
        if (!Number.isFinite(curr) || curr < 0) {
          return res
            .status(400)
            .json({ message: "eCurrentIndex phải là số >= 0" });
        }
        reading.eCurrentIndex = curr;
      }

      // wCurrentIndex
      if (wCurrentIndex != null) {
        const curr = Number(wCurrentIndex);
        if (!Number.isFinite(curr) || curr < 0) {
          return res
            .status(400)
            .json({ message: "wCurrentIndex phải là số >= 0" });
        }
        reading.wCurrentIndex = curr;
      }

      // eUnitPrice
      if (eUnitPrice != null) {
        const price = Number(eUnitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return res
            .status(400)
            .json({ message: "eUnitPrice phải là số >= 0" });
        }
        reading.eUnitPrice = price;
      }

      // wUnitPrice
      if (wUnitPrice != null) {
        const price = Number(wUnitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return res
            .status(400)
            .json({ message: "wUnitPrice phải là số >= 0" });
        }
        reading.wUnitPrice = price;
      }

      // Không cho đổi roomId / buildingId / periodMonth / periodYear qua API update
      if (
        roomId != null ||
        buildingId != null ||
        periodMonth != null ||
        periodYear != null
      ) {
        return res.status(400).json({
          message:
            "Không được thay đổi phòng / tòa / kỳ qua API update. Vui lòng xoá và tạo lại.",
        });
      }

      // Recalculate consumptions & amounts
      if (
        reading.eCurrentIndex != null &&
        Number.isFinite(reading.eCurrentIndex) &&
        Number.isFinite(reading.ePreviousIndex)
      ) {
        if (reading.eCurrentIndex < reading.ePreviousIndex) {
          return res.status(400).json({
            message:
              "eCurrentIndex phải >= ePreviousIndex (chỉ số điện kỳ trước)",
          });
        }
        reading.eConsumption = reading.eCurrentIndex - reading.ePreviousIndex;
        if (
          reading.eUnitPrice != null &&
          Number.isFinite(reading.eUnitPrice) &&
          reading.eUnitPrice >= 0
        ) {
          reading.eAmount = reading.eConsumption * reading.eUnitPrice;
        }
      }

      if (
        reading.wCurrentIndex != null &&
        Number.isFinite(reading.wCurrentIndex) &&
        Number.isFinite(reading.wPreviousIndex)
      ) {
        if (reading.wCurrentIndex < reading.wPreviousIndex) {
          return res.status(400).json({
            message:
              "wCurrentIndex phải >= wPreviousIndex (chỉ số nước kỳ trước)",
          });
        }
        reading.wConsumption = reading.wCurrentIndex - reading.wPreviousIndex;
        if (
          reading.wUnitPrice != null &&
          Number.isFinite(reading.wUnitPrice) &&
          reading.wUnitPrice >= 0
        ) {
          reading.wAmount = reading.wConsumption * reading.wUnitPrice;
        }
      }
    }

    // Các field luôn cho phép (kể cả locked)
    if (typeof note === "string") {
      reading.note = note;
    }

    if (status && ["draft", "confirmed", "billed"].includes(status)) {
      reading.status = status;
    }

    await reading.save();

    res.json({
      message: "Cập nhật chỉ số tiện ích thành công",
      data: reading.toJSON(),
    });
  } catch (e) {
    console.error("updateReading error:", e);
    res.status(400).json({ message: e.message });
  }
};

/**
 * POST /landlords/utility-readings/:id/confirm
 * Chỉ cho confirm khi đang draft.
 */
exports.confirmReading = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const doc = await UtilityReading.findOne({
      _id: id,
      landlordId,
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

    // Validate điện (nếu có)
    if (doc.eCurrentIndex != null) {
      if (
        !Number.isFinite(doc.eCurrentIndex) ||
        doc.eCurrentIndex < 0 ||
        !Number.isFinite(doc.ePreviousIndex) ||
        doc.ePreviousIndex < 0
      ) {
        return res.status(400).json({
          message:
            "Giá trị ePreviousIndex / eCurrentIndex không hợp lệ (phải là số >= 0)",
        });
      }
      if (doc.eCurrentIndex < doc.ePreviousIndex) {
        return res.status(400).json({
          message:
            "eCurrentIndex phải >= ePreviousIndex (chỉ số điện kỳ trước)",
        });
      }
      if (doc.eUnitPrice != null && doc.eUnitPrice < 0) {
        return res.status(400).json({ message: "eUnitPrice phải là số >= 0" });
      }
    }

    // Validate nước (nếu có)
    if (doc.wCurrentIndex != null) {
      if (
        !Number.isFinite(doc.wCurrentIndex) ||
        doc.wCurrentIndex < 0 ||
        !Number.isFinite(doc.wPreviousIndex) ||
        doc.wPreviousIndex < 0
      ) {
        return res.status(400).json({
          message:
            "Giá trị wPreviousIndex / wCurrentIndex không hợp lệ (phải là số >= 0)",
        });
      }
      if (doc.wCurrentIndex < doc.wPreviousIndex) {
        return res.status(400).json({
          message:
            "wCurrentIndex phải >= wPreviousIndex (chỉ số nước kỳ trước)",
        });
      }
      if (doc.wUnitPrice != null && doc.wUnitPrice < 0) {
        return res.status(400).json({ message: "wUnitPrice phải là số >= 0" });
      }
    }

    doc.status = "confirmed";
    doc.confirmedAt = new Date();
    doc.confirmedById = landlordId;

    await doc.save();

    res.json({
      message: "Đã xác nhận chỉ số tiện ích",
      data: doc.toJSON(),
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

/**
 * POST /landlords/utility-readings/bulk
 * Body: { readings: [ { roomId, periodMonth, periodYear, eCurrentIndex?, wCurrentIndex? }, ... ] }
 */
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
      const { roomId, periodMonth, periodYear, eCurrentIndex, wCurrentIndex } =
        payload;

      const itemResult = {
        index: i,
        roomId: roomId || null,
        success: false,
        error: null,
        readingId: null,
      };

      try {
        if (!roomId || periodMonth == null || periodYear == null) {
          itemResult.error = "Thiếu dữ liệu bắt buộc";
          results.push(itemResult);
          continue;
        }

        const month = Number(periodMonth);
        const year = Number(periodYear);

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

        const room = await Room.findById(roomId)
          .select("buildingId isDeleted eStart wStart")
          .lean();

        if (!room || room.isDeleted) {
          itemResult.error = "Không tìm thấy phòng hoặc phòng đã bị xoá";
          results.push(itemResult);
          continue;
        }

        const building = await Building.findById(room.buildingId)
          .select("landlordId isDeleted status ePrice wPrice")
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

        // Check trùng kỳ
        const existed = await UtilityReading.findOne({
          landlordId,
          roomId,
          periodMonth: month,
          periodYear: year,
          isDeleted: false,
        }).lean();

        if (existed) {
          itemResult.error = "Đã tồn tại chỉ số cho phòng này trong kỳ này";
          results.push(itemResult);
          continue;
        }

        // previous indexes
        const { ePreviousIndex, wPreviousIndex } = await getPreviousIndexes(
          roomId
        );

        // Validate current indexes
        let eCurr = null;
        if (eCurrentIndex != null) {
          eCurr = Number(eCurrentIndex);
          if (!Number.isFinite(eCurr) || eCurr < 0) {
            itemResult.error = "eCurrentIndex phải là số >= 0";
            results.push(itemResult);
            continue;
          }
          if (eCurr < ePreviousIndex) {
            itemResult.error =
              "eCurrentIndex phải >= ePreviousIndex (chỉ số điện kỳ trước)";
            results.push(itemResult);
            continue;
          }
        }

        let wCurr = null;
        if (wCurrentIndex != null) {
          wCurr = Number(wCurrentIndex);
          if (!Number.isFinite(wCurr) || wCurr < 0) {
            itemResult.error = "wCurrentIndex phải là số >= 0";
            results.push(itemResult);
            continue;
          }
          if (wCurr < wPreviousIndex) {
            itemResult.error =
              "wCurrentIndex phải >= wPreviousIndex (chỉ số nước kỳ trước)";
            results.push(itemResult);
            continue;
          }
        }

        const eUnitPrice =
          typeof building.ePrice === "number" &&
          Number.isFinite(building.ePrice)
            ? building.ePrice
            : 0;
        const wUnitPrice =
          typeof building.wPrice === "number" &&
          Number.isFinite(building.wPrice)
            ? building.wPrice
            : 0;

        const eConsumption =
          eCurr != null && Number.isFinite(ePreviousIndex)
            ? eCurr - ePreviousIndex
            : 0;
        const eAmount = eConsumption * eUnitPrice;

        const wConsumption =
          wCurr != null && Number.isFinite(wPreviousIndex)
            ? wCurr - wPreviousIndex
            : 0;
        const wAmount = wConsumption * wUnitPrice;

        const doc = await UtilityReading.create({
          landlordId,
          buildingId: room.buildingId,
          roomId,
          periodMonth: month,
          periodYear: year,
          readingDate: new Date(), // auto = thời điểm nhập
          ePreviousIndex,
          eCurrentIndex: eCurr,
          eConsumption,
          eUnitPrice,
          eAmount,
          wPreviousIndex,
          wCurrentIndex: wCurr,
          wConsumption,
          wUnitPrice,
          wAmount,
          createdById: landlordId,
        });

        itemResult.success = true;
        itemResult.readingId = doc._id;
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
 *  - kèm trạng thái đã nhập chỉ số tiện ích trong kỳ
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

    if (!activeContracts.length) {
      return res.json({
        message: "Không có hợp đồng hiệu lực trong kỳ",
        data: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        periodMonth: month,
        periodYear: year,
      });
    }

    const activeRoomIds = [
      ...new Set(activeContracts.map((c) => c.roomId.toString())),
    ];

    // 2) Lọc phòng thuộc các hợp đồng này + option filter buildingId, q
    const roomFilter = {
      _id: { $in: activeRoomIds },
      isDeleted: false,
      status: "rented",
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
      .select("roomId status")
      .lean();

    // Xây map: roomId -> { hasReading, status }
    const readingMap = {};
    const rank = { billed: 3, confirmed: 2, draft: 1 };

    for (const r of readings) {
      const rid = r.roomId.toString();
      const rStatus = r.status || null;

      if (!readingMap[rid]) {
        readingMap[rid] = {
          hasReading: true,
          status: rStatus,
        };
      } else {
        const currentRank = rank[readingMap[rid].status] || 0;
        const newRank = rank[rStatus] || 0;
        if (newRank >= currentRank) {
          readingMap[rid].hasReading = true;
          readingMap[rid].status = rStatus;
        }
      }
    }

    // 4) Gắn meterStatus + template cho FE vào từng room
    const data = rooms.map((room) => {
      const rid = room._id.toString();
      const meterStatus = readingMap[rid] || {
        hasReading: false,
        status: null,
      };

      // Template cho FE nhập nhanh
      const readingTemplate = {
        roomId: room._id,
        periodMonth: month,
        periodYear: year,
        eCurrentIndex: null,
        wCurrentIndex: null,
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
