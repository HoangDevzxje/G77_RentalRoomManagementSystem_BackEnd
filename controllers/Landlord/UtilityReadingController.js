const UtilityReading = require("../../models/UtilityReading");
const Room = require("../../models/Room");
const Building = require("../../models/Building");
const Contract = require("../../models/Contract");
const mongoose = require("mongoose");
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
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
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

    if (isStaff) {
      const allowedBuildingIds = req.staff.assignedBuildingIds.map((id) =>
        id.toString()
      );

      if (buildingId) {
        if (!allowedBuildingIds.includes(buildingId.toString())) {
          return res
            .status(403)
            .json({ message: "Bạn không quản lý tòa nhà này" });
        }
        filter.buildingId = buildingId;
      } else if (roomId) {
        const room = await Room.findById(roomId)
          .select("buildingId isDeleted")
          .lean();

        if (!room || room.isDeleted) {
          return res.status(404).json({ message: "Không tìm thấy phòng" });
        }

        const roomBuildingId = room.buildingId.toString();
        if (!allowedBuildingIds.includes(roomBuildingId)) {
          return res
            .status(403)
            .json({
              message: "Phòng này không thuộc tòa nhà bạn được quản lý",
            });
        }

        filter.roomId = roomId;
      } else {
        filter.buildingId = { $in: req.staff.assignedBuildingIds };
      }
    } else {
      if (buildingId) filter.buildingId = buildingId;
      if (roomId) filter.roomId = roomId;
    }
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
    console.error("listReadings error:", e.message);
    res.status(500).json({ message: e.message || "Lỗi hệ thống" });
  }
};

/**
 * Helper: lấy previous index điện + nước cho 1 phòng.
 * - Ưu tiên lấy từ UtilityReading gần nhất.
 * - Nếu chưa có -> lấy từ Room.eStart / Room.wStart.
 */
async function getPreviousIndexes(roomId, landlordId) {
  const last = await UtilityReading.findOne({
    roomId,
    landlordId,
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
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { roomId, periodMonth, periodYear, eCurrentIndex, wCurrentIndex } =
      req.body || {};
    if (!roomId) {
      return res.status(400).json({ message: 'Thiếu roomId' });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'roomId không hợp lệ' });
    }
    if (periodMonth == null || periodYear == null) {
      return res.status(400).json({ message: "Thiếu periodMonth hoặc periodYear" });
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
    if (isStaff) {
      const buildingIdStr = building._id.toString();
      if (!req.staff.assignedBuildingIds.includes(buildingIdStr)) {
        return res.status(403).json({
          message: "Bạn không được quản lý tòa nhà này",
          buildingId: buildingIdStr,
          yourAssigned: req.staff.assignedBuildingIds,
        });
      }
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
    const { ePreviousIndex, wPreviousIndex } = await getPreviousIndexes(
      roomId,
      landlordId
    );

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
      createdById: req.user._id,
    });

    res.status(201).json({
      message: "Tạo chỉ số tiện ích thành công",
      data: doc,
    });
  } catch (e) {
    console.error("createReading error:", e.messagee);
    res.status(400).json({ message: "Lỗi hệ thống" });
  }
};

/**
 * GET /landlords/utility-readings/:id
 */
exports.getReading = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    const doc = await UtilityReading.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    })
      .populate("roomId", "roomNumber buildingId")
      .populate("buildingId", "name address")
      .lean();

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }
    if (isStaff) {
      const buildingIdFromRoom = doc.roomId?.buildingId?.toString();
      if (!buildingIdFromRoom) {
        // Trường hợp cực hiếm: roomId bị null hoặc populate lỗi
        return res
          .status(403)
          .json({ message: "Không xác định được tòa nhà của chỉ số này" });
      }

      if (!req.staff.assignedBuildingIds.includes(buildingIdFromRoom)) {
        return res.status(403).json({
          message: "Bạn không được quản lý tòa nhà chứa chỉ số này",
          buildingId: buildingIdFromRoom,
          yourAssigned: req.staff.assignedBuildingIds,
        });
      }
    }
    res.json({ data: doc });
  } catch (e) {
    console.error("getReading error:", e.message);
    res.status(400).json({ message: "Lỗi hệ thống" });
  }
};

/**
 * PUT /landlords/utility-readings/:id
 * Chỉ số đã billed (hoặc có invoiceId) thì không cho sửa index/tiền/kỳ/phòng.
 * Chỉ cho phép sửa ePreviousIndex/wPreviousIndex lớn hơn hoặc bằng chỉ số cũ.
 */
exports.updateReading = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
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
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    const reading = await UtilityReading.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    }).populate({
      path: "roomId",
      select: "buildingId",
      populate: {
        path: "buildingId",
        select: "landlordId status",
      },
    });

    if (!reading) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    // Kiểm tra quyền staff
    if (isStaff) {
      const buildingIdFromRoom = reading.roomId?.buildingId?._id?.toString();
      if (!buildingIdFromRoom) {
        return res
          .status(500)
          .json({ message: "Dữ liệu phòng/tòa nhà bị lỗi" });
      }
      if (!req.staff.assignedBuildingIds.includes(buildingIdFromRoom)) {
        return res.status(403).json({
          message: "Bạn không được phép chỉnh sửa chỉ số của tòa nhà này",
        });
      }
    }

    const lockedStatuses = ["confirmed", "billed"];
    const locked =
      lockedStatuses.includes(reading.status) || !!reading.invoiceId;

    // Nếu đã lập hóa đơn → chỉ được sửa note hoặc status
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

    let canEditPrevIndex = false;
    let isFirstReadingOfRoom = false;

    if (!locked && (ePreviousIndex != null || wPreviousIndex != null)) {
      // Kiểm tra đây có phải bản ghi đầu tiên của phòng không
      const firstReading = await UtilityReading.findOne({
        landlordId,
        roomId: reading.roomId,
        isDeleted: false,
      })
        .sort({ periodYear: 1, periodMonth: 1, createdAt: 1, _id: 1 })
        .select("_id")
        .lean();

      isFirstReadingOfRoom =
        firstReading && String(firstReading._id) === String(reading._id);

      if (isFirstReadingOfRoom) {
        // Kỳ đầu tiên → cho phép sửa thoải mái (bao gồm cả giảm về 0)
        canEditPrevIndex = true;
      } else {
        // Các kỳ sau → chỉ được TĂNG hoặc giữ nguyên PreviousIndex, KHÔNG ĐƯỢC GIẢM
        const newEPrev =
          ePreviousIndex !== undefined
            ? Number(ePreviousIndex)
            : reading.ePreviousIndex;
        const newWPrev =
          wPreviousIndex !== undefined
            ? Number(wPreviousIndex)
            : reading.wPreviousIndex;

        if (
          (ePreviousIndex != null && newEPrev < reading.ePreviousIndex) ||
          (wPreviousIndex != null && newWPrev < reading.wPreviousIndex)
        ) {
          return res.status(400).json({
            message:
              "Không được giảm chỉ số đầu kỳ. Chỉ được phép tăng hoặc giữ nguyên.",
          });
        }
        canEditPrevIndex = true; // được tăng → cho phép sửa
      }
    }

    if (!locked) {
      // Không cho đổi room/building/kỳ
      if (
        roomId != null ||
        buildingId != null ||
        periodMonth != null ||
        periodYear != null
      ) {
        return res.status(400).json({
          message:
            "Không được thay đổi phòng/tòa/kỳ. Vui lòng xoá và tạo lại bản ghi.",
        });
      }

      // Cập nhật ePreviousIndex
      if (ePreviousIndex != null) {
        if (!canEditPrevIndex) {
          return res
            .status(400)
            .json({ message: "Không được phép sửa ePreviousIndex." });
        }
        const val = Number(ePreviousIndex);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "ePreviousIndex phải là số >= 0" });
        }
        reading.ePreviousIndex = val;
      }

      // Cập nhật wPreviousIndex
      if (wPreviousIndex != null) {
        if (!canEditPrevIndex) {
          return res
            .status(400)
            .json({ message: "Không được phép sửa wPreviousIndex." });
        }
        const val = Number(wPreviousIndex);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "wPreviousIndex phải là số >= 0" });
        }
        reading.wPreviousIndex = val;
      }

      // eCurrentIndex
      if (eCurrentIndex != null) {
        const val = Number(eCurrentIndex);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "eCurrentIndex phải là số >= 0" });
        }
        reading.eCurrentIndex = val;
      }

      // wCurrentIndex
      if (wCurrentIndex != null) {
        const val = Number(wCurrentIndex);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "wCurrentIndex phải là số >= 0" });
        }
        reading.wCurrentIndex = val;
      }

      // eUnitPrice
      if (eUnitPrice != null) {
        const val = Number(eUnitPrice);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "eUnitPrice phải là số >= 0" });
        }
        reading.eUnitPrice = val;
      }

      // wUnitPrice
      if (wUnitPrice != null) {
        const val = Number(wUnitPrice);
        if (!Number.isFinite(val) || val < 0) {
          return res
            .status(400)
            .json({ message: "wUnitPrice phải là số >= 0" });
        }
        reading.wUnitPrice = val;
      }

      // Tính lại tiêu thụ & thành tiền
      if (
        reading.eCurrentIndex != null &&
        Number.isFinite(reading.eCurrentIndex) &&
        Number.isFinite(reading.ePreviousIndex)
      ) {
        if (reading.eCurrentIndex < reading.ePreviousIndex) {
          return res.status(400).json({
            message: "eCurrentIndex phải ≥ ePreviousIndex",
          });
        }
        reading.eConsumption = reading.eCurrentIndex - reading.ePreviousIndex;
        if (reading.eUnitPrice >= 0) {
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
            message: "wCurrentIndex phải ≥ wPreviousIndex",
          });
        }
        reading.wConsumption = reading.wCurrentIndex - reading.wPreviousIndex;
        if (reading.wUnitPrice >= 0) {
          reading.wAmount = reading.wConsumption * reading.wUnitPrice;
        }
      }
    }

    // Luôn cho phép cập nhật note và status
    if (typeof note === "string") reading.note = note.trim();
    if (status && ["draft", "confirmed", "billed"].includes(status)) {
      reading.status = status;
    }

    await reading.save();

    return res.json({
      message: "Cập nhật chỉ số tiện ích thành công",
      data: reading.toJSON(),
    });
  } catch (e) {
    console.error("updateReading error:", e.message);
    return res.status(500).json({ message: e.message || "Lỗi hệ thống" });
  }
};
/**
 * POST /landlords/utility-readings/:id/confirm
 * Chỉ cho confirm khi đang draft.
 */
exports.confirmReading = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Thiếu id' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'id không hợp lệ' });
    }
    const doc = await UtilityReading.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    }).populate({
      path: "roomId",
      select: "buildingId",
      populate: {
        path: "buildingId",
        select: "landlordId status",
      },
    });

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }
    if (isStaff) {
      const buildingId = doc.roomId?.buildingId?._id?.toString();
      if (!buildingId) {
        return res
          .status(500)
          .json({ message: "Không xác định được tòa nhà của chỉ số này" });
      }

      if (!req.staff.assignedBuildingIds.includes(buildingId)) {
        return res.status(403).json({
          message: "Bạn không được phép xác nhận chỉ số của tòa nhà này",
          buildingId,
          yourAssigned: req.staff.assignedBuildingIds,
        });
      }
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

    // Khi xác nhận chỉ số thành công, cập nhật chỉ số bắt đầu của phòng (eStart/wStart)
    // nếu có giá trị eCurrentIndex/wCurrentIndex. Không block nếu update fail.
    try {
      if (doc.roomId) {
        const room = await Room.findById(doc.roomId)
          .select("eStart wStart")
          .lean();
        if (room) {
          const roomUpdate = {};
          if (
            typeof doc.eCurrentIndex === "number" &&
            Number.isFinite(doc.eCurrentIndex)
          ) {
            // only update if it's greater or equal to the existing eStart to avoid regressions
            if (room.eStart == null || doc.eCurrentIndex >= room.eStart) {
              roomUpdate.eStart = doc.eCurrentIndex;
            }
          }
          if (
            typeof doc.wCurrentIndex === "number" &&
            Number.isFinite(doc.wCurrentIndex)
          ) {
            // only update if it's greater or equal to the existing wStart to avoid regressions
            if (room.wStart == null || doc.wCurrentIndex >= room.wStart) {
              roomUpdate.wStart = doc.wCurrentIndex;
            }
          }

          if (Object.keys(roomUpdate).length > 0) {
            await Room.updateOne({ _id: doc.roomId }, { $set: roomUpdate });
          }
        }
      }
    } catch (err) {
      console.error(
        "confirmReading - failed to update room eStart/wStart for room",
        doc.roomId,
        err
      );
      // intentionally not throwing so we don't fail the confirm endpoint
    }

    res.json({
      message: "Đã xác nhận chỉ số tiện ích",
      data: doc.toJSON(),
    });
  } catch (e) {
    console.error("confirmReading error:", e.message);
    res.status(400).json({ message: "Lỗi hệ thống" });
  }
};

/**
 * DELETE /landlords/utility-readings/:id
 * Soft delete
 */
exports.deleteReading = async (req, res) => {
  try {
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { id } = req.params;

    const doc = await UtilityReading.findOne({
      _id: id,
      isDeleted: false,
    }).populate({
      path: "roomId",
      select: "buildingId",
      populate: {
        path: "buildingId",
        select: "landlordId",
      },
    });

    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy chỉ số" });
    }

    if (isStaff) {
      const buildingId = doc.roomId?.buildingId?._id?.toString();

      if (!buildingId) {
        return res
          .status(500)
          .json({ message: "Không xác định được tòa nhà của chỉ số này" });
      }

      if (!req.staff.assignedBuildingIds.includes(buildingId)) {
        return res.status(403).json({
          message: "Bạn không được phép xóa chỉ số của tòa nhà này",
          buildingId,
          yourAssigned: req.staff.assignedBuildingIds,
        });
      }
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
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;
    const { readings } = req.body || {};

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({
        message: "Danh sách readings phải là array và không được rỗng",
        data: [],
        total: 0,
      });
    }
    const allowedBuildingIds = isStaff
      ? req.staff.assignedBuildingIds.map((id) => id.toString())
      : null;

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
        if (String(building.landlordId) !== String(landlordId)) {
          itemResult.error = "Phòng không thuộc quyền quản lý";
          results.push(itemResult);
          continue;
        }

        // === QUAN TRỌNG: KIỂM TRA QUYỀN STAFF ===
        if (isStaff) {
          const buildingIdStr = building._id.toString();
          if (!allowedBuildingIds.includes(buildingIdStr)) {
            itemResult.error = "Bạn không được quản lý tòa nhà này";
            results.push(itemResult);
            continue;
          }
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
          roomId,
          landlordId
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
          createdById: req.user._id,
        });

        itemResult.success = true;
        itemResult.readingId = doc._id;
        results.push(itemResult);
      } catch (err) {
        console.error("bulkCreateReadings item error:", err.message);
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
    console.error("bulkCreateReadings error:", e.message);
    res.status(500).json({
      message: e.message || "Lỗi hệ thống",
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
    const isStaff = req.user.role === "staff";
    const landlordId = isStaff ? req.staff.landlordId : req.user._id;

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
    if (isStaff) {
      if (buildingId) {
        // Nếu có truyền buildingId → kiểm tra quyền trước
        if (!req.staff.assignedBuildingIds.includes(buildingId.toString())) {
          return res.status(403).json({
            message: "Bạn không được quản lý tòa nhà này",
          });
        }
        roomFilter.buildingId = buildingId;
      } else {
        // Không truyền buildingId → chỉ lấy các tòa nhà được assign
        roomFilter.buildingId = { $in: req.staff.assignedBuildingIds };
      }
    } else {
      // Landlord: có thể filter buildingId hoặc không
      if (buildingId) {
        roomFilter.buildingId = buildingId;
      }
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
    console.error("listRoomsForUtility error:", e.message);
    return res.status(500).json({
      message: e.message || "Lỗi hệ thống",
      data: [],
      total: 0,
    });
  }
};
