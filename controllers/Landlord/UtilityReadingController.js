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


// POST /landlords/utility-readings
exports.createReading = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
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
      periodMonth == null ||
      periodYear == null ||
      currentIndex == null
    ) {
      return res.status(400).json({ message: "Thiếu dữ liệu bắt buộc" });
    }

    if (!["electricity", "water"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Loại tiện ích không hợp lệ (electricity | water)" });
    }

    const month = Number(periodMonth);
    const year = Number(periodYear);
    const currIdx = Number(currentIndex);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ message: "Tháng không hợp lệ (1-12)" });
    }

    if (!Number.isInteger(year) || year < 2000) {
      return res.status(400).json({ message: "Năm không hợp lệ" });
    }

    if (!Number.isFinite(currIdx) || currIdx < 0) {
      return res.status(400).json({ message: "currentIndex phải là số >= 0" });
    }

    // 2) Validate phòng + tòa thuộc landlord hiện tại
    const room = await Room.findById(roomId)
      .select("buildingId isDeleted")
      .lean();

    if (!room || room.isDeleted) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy phòng hoặc phòng đã bị xóa" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId isDeleted status")
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

    // 3) Check trùng kỳ
    const existed = await UtilityReading.findOne({
      landlordId,
      roomId,
      type,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
    }).lean();

    if (existed) {
      return res.status(400).json({
        message: "Đã tồn tại chỉ số cho phòng này, loại này, kỳ này",
      });
    }

    // 4) previousIndex + validate so với currentIndex
    let previousIndex = await getPreviousIndex({ roomId, type });
    if (!Number.isFinite(previousIndex) || previousIndex < 0) {
      previousIndex = 0;
    }

    if (currIdx < previousIndex) {
      return res.status(400).json({
        message:
          "currentIndex phải lớn hơn hoặc bằng previousIndex (chỉ số kỳ trước)",
      });
    }

    // 5) Validate unitPrice
    let price = 0;
    if (unitPrice != null) {
      price = Number(unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ message: "unitPrice phải là số >= 0" });
      }
    }

    // 6) Tạo document
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
      unitPrice: price,
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

// PATCH /landlords/utility-readings/:id
exports.updateReading = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;
    const {
      previousIndex,
      currentIndex,
      unitPrice,

      type,
      periodMonth,
      periodYear,
      roomId,
      buildingId,
      note,
      status,
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
      if (
        previousIndex != null ||
        currentIndex != null ||
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

    // Nếu chưa lock, cho phép cập nhật nhưng phải validate
    if (!locked) {
      // previousIndex
      if (previousIndex != null) {
        const prev = Number(previousIndex);
        if (!Number.isFinite(prev) || prev < 0) {
          return res
            .status(400)
            .json({ message: "previousIndex phải là số >= 0" });
        }
        reading.previousIndex = prev;
      }

      // currentIndex
      if (currentIndex != null) {
        const curr = Number(currentIndex);
        if (!Number.isFinite(curr) || curr < 0) {
          return res
            .status(400)
            .json({ message: "currentIndex phải là số >= 0" });
        }
        reading.currentIndex = curr;
      }

      // Check current >= previous nếu cả 2 đã có
      if (
        reading.currentIndex != null &&
        reading.previousIndex != null &&
        reading.currentIndex < reading.previousIndex
      ) {
        return res.status(400).json({
          message:
            "currentIndex phải lớn hơn hoặc bằng previousIndex (chỉ số kỳ trước)",
        });
      }

      // unitPrice
      if (unitPrice != null) {
        const price = Number(unitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({ message: "unitPrice phải là số >= 0" });
        }
        reading.unitPrice = price;
      }

      if (type != null) reading.type = type;
      if (periodMonth != null) reading.periodMonth = Number(periodMonth);
      if (periodYear != null) reading.periodYear = Number(periodYear);
      if (roomId != null) reading.roomId = roomId;
      if (buildingId != null) reading.buildingId = buildingId;
      // consumption + amount sẽ được schema pre("validate") tự tính lại
    }

    // Các field vẫn cho phép chỉnh dù locked
    if (note != null) reading.note = note;
    if (!locked && status) {
      reading.status = status;
    }

    await reading.save();
    return res.json({ message: "Cập nhật thành công", data: reading });
  } catch (err) {
    console.error("updateReading error:", err);
    return res.status(500).json({ message: "Lỗi cập nhật chỉ số" });
  }
};

// POST /landlords/utility-readings/:id/confirm
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

    // Validate trước khi confirm: currentIndex >= previousIndex, unitPrice >= 0
    if (
      !Number.isFinite(doc.currentIndex) ||
      doc.currentIndex < 0 ||
      !Number.isFinite(doc.previousIndex) ||
      doc.previousIndex < 0
    ) {
      return res.status(400).json({
        message:
          "Giá trị previousIndex / currentIndex không hợp lệ (phải là số >= 0)",
      });
    }

    if (doc.currentIndex < doc.previousIndex) {
      return res.status(400).json({
        message:
          "currentIndex phải lớn hơn hoặc bằng previousIndex (chỉ số kỳ trước)",
      });
    }

    if (doc.unitPrice != null && doc.unitPrice < 0) {
      return res.status(400).json({ message: "unitPrice phải là số >= 0" });
    }

    // Cập nhật trạng thái
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

        // Validate unitPrice
        let price = 0;
        if (unitPrice != null) {
          price = Number(unitPrice);
          if (!Number.isFinite(price) || price < 0) {
            itemResult.error = "unitPrice phải là số >= 0";
            results.push(itemResult);
            continue;
          }
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

        // 3) Check trùng kỳ
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

        // 4) previousIndex + validate
        let previousIndex = await getPreviousIndex({ roomId, type });
        if (!Number.isFinite(previousIndex) || previousIndex < 0) {
          previousIndex = 0;
        }

        if (currIdx < previousIndex) {
          itemResult.error =
            "currentIndex phải lớn hơn hoặc bằng previousIndex (chỉ số kỳ trước)";
          results.push(itemResult);
          continue;
        }

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
          unitPrice: price,
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
