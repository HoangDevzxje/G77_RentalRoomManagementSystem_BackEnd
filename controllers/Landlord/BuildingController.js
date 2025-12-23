const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Floor = require("../../models/Floor");
const Room = require("../../models/Room");
const BuildingService = require("../../models/BuildingService");
const xlsx = require("xlsx");
const Excel = require("exceljs");

const { getDeviceStatus } = require("../../configs/tuyaClient");
const Contract = require("../../models/Contract");

const list = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      includeDeleted = "false",
      status,
    } = req.query;

    const filter = { isDeleted: includeDeleted !== "true" ? false : undefined };
    if (status) filter.status = status;
    if (q) filter.name = { $regex: q, $options: "i" };

    if (req.user.role === "landlord") {
      filter.landlordId = req.user._id;
    } else if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({ data: [], total: 0, page: +page, limit: +limit });
      }
      filter._id = { $in: req.staff.assignedBuildingIds };
    }

    const [data, total] = await Promise.all([
      Building.find(filter)
        .sort({ createdAt: -1 })
        .skip((+page - 1) * +limit)
        .limit(+limit)
        .populate({
          path: "landlordId",
          select: "email role userInfo fullName",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .lean(),
      Building.countDocuments(filter),
    ]);

    const items = data.map((b) => ({
      ...b,
      landlord: {
        id: b.landlordId?._id,
        email: b.landlordId?.email,
        fullName: b.landlordId?.userInfo?.fullName,
        phone: b.landlordId?.userInfo?.phone,
      },
    }));

    res.json({ data: items, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id)
      .populate({
        path: "landlordId",
        select: "email role userInfo fullName",
        populate: { path: "userInfo", select: "fullName phoneNumber" },
      })
      .lean();

    if (!building || building.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    }

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(building._id))) {
        return res.status(403).json({ message: "Không có quyền" });
      }
    } else if (req.user.role === "landlord") {
      if (String(building.landlordId?._id) !== String(req.user._id)) {
        return res.status(403).json({ message: "Không có quyền" });
      }
    }

    const result = {
      ...building,
      landlord: {
        id: building.landlordId?._id,
        email: building.landlordId?.email,
        fullName: building.landlordId?.userInfo?.fullName,
        phone: building.landlordId?.userInfo?.phone,
      },
    };

    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    const {
      name,
      address,
      eIndexType,
      ePrice,
      wIndexType,
      wPrice,
      description,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Thiếu tên tòa nhà" });
    }

    if (!address) {
      return res.status(400).json({ message: "Thiếu địa chỉ tòa nhà" });
    }

    const existed = await Building.exists({
      landlordId: req.user._id,
      name: name.trim(),
      isDeleted: false,
    });
    if (existed) {
      return res
        .status(409)
        .json({ message: "Tên tòa đã tồn tại trong tài khoản của bạn" });
    }

    if (ePrice !== undefined && ePrice !== null) {
      if (isNaN(ePrice) || Number(ePrice) < 0) {
        return res.status(400).json({ message: "Tiền điện không hợp lệ" });
      }
    }

    if (wPrice !== undefined && wPrice !== null) {
      if (isNaN(wPrice) || Number(wPrice) < 0) {
        return res.status(400).json({ message: "Tiền nước không hợp lệ" });
      }
    }

    const building = new Building({
      name,
      address,
      eIndexType,
      ePrice,
      wIndexType,
      wPrice,
      description,
      landlordId: req.user._id,
    });

    await building.save();

    if (building.wIndexType === "byPerson") {
      await upsertWaterPerPersonService({
        buildingId: building._id,
        landlordId: building.landlordId,
        fee: building.wPrice,
      });
    }

    res.status(201).json({ success: true, data: building });
  } catch (err) {
    console.error("Error creating building:", err);

    const message =
      err?.message ||
      err?.response?.data?.message ||
      err?.data?.message ||
      (typeof err === "string" ? err : JSON.stringify(err));

    res.status(400).json({
      success: false,
      message,
    });
  }
};

// helper render room number
function renderRoomNumber(tpl, { block, floorLevel, seq }) {
  const floorStr = floorLevel != null ? String(floorLevel) : "";
  let out = String(tpl);
  out = out.replace(/\{block\}/g, block ?? "");
  out = out.replace(/\{floorLevel\}/g, floorStr);
  out = out.replace(/\{floor\}/g, floorStr);
  out = out.replace(/\{seq(?::(\d+))?\}/g, (_m, p1) => {
    const pad = p1 ? parseInt(p1, 10) : 0;
    const s = String(seq ?? "");
    return pad ? s.padStart(pad, "0") : s;
  });
  return out;
}

async function upsertWaterPerPersonService({
  buildingId,
  landlordId,
  fee,
  session,
}) {
  // "water" service dùng cho trường hợp tính nước theo đầu người.
  // Nếu đã có (kể cả soft delete) thì khôi phục và cập nhật.
  const existing = await BuildingService.findOne({
    buildingId,
    landlordId,
    name: "water",
  }).session(session || null);

  const payload = {
    landlordId,
    buildingId,
    name: "water",
    label: "Nước (theo đầu người)",
    chargeType: "perPerson",
    fee: Number.isFinite(Number(fee)) ? Number(fee) : 0,
    currency: "VND",
    description: "Tự động tạo khi chọn loại chỉ số nước theo đầu người",
    isDeleted: false,
    deletedAt: null,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save({ session });
    return existing;
  }

  const created = new BuildingService(payload);
  await created.save({ session });
  return created;
}

async function softDeleteWaterService({ buildingId, landlordId, session }) {
  await BuildingService.updateMany(
    { buildingId, landlordId, name: "water", isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { session }
  );
}

const quickSetup = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      name,
      address,
      landlordId: landlordIdInput,
      floors,
      rooms,
      dryRun = false,
      eIndexType = "byNumber",
      ePrice = 0,
      wIndexType = "byNumber",
      wPrice = 0,
    } = req.body;

    if (ePrice < 0 || wPrice < 0) {
      return res.status(400).json({ message: "ePrice/wPrice phải >= 0" });
    }

    const landlordId =
      req.user.role === "landlord"
        ? req.user._id
        : landlordIdInput || req.user._id;

    const existed = await Building.exists({
      landlordId,
      name: name.trim(),
      isDeleted: false,
    });
    if (existed) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(409)
        .json({ message: "Tên tòa đã tồn tại trong tài khoản của bạn" });
    }

    const building = new Building({
      name,
      address,
      landlordId,
      eIndexType,
      ePrice,
      wIndexType,
      wPrice,
    });
    if (!dryRun) await building.save({ session });

    if (!dryRun && wIndexType === "byPerson") {
      await upsertWaterPerPersonService({
        buildingId: building._id,
        landlordId,
        fee: wPrice,
        session,
      });
    }

    // 2) Tạo Floors
    let createdFloors = [];
    if (floors?.count && floors?.startLevel != null) {
      const levels = Array.from(
        { length: +floors.count },
        (_, i) => +floors.startLevel + i
      );
      const existing = await Floor.find({ buildingId: building._id })
        .select("level")
        .lean();
      const existSet = new Set(existing.map((x) => x.level));

      const toInsert = levels
        .filter((lv) => !existSet.has(lv))
        .map((lv) => ({
          buildingId: building._id,
          level: lv,
          description: floors.description,
        }));

      if (!dryRun && toInsert.length) {
        createdFloors = await Floor.insertMany(toInsert, { session });
      } else {
        createdFloors = toInsert.map((x) => ({
          ...x,
          _id: new mongoose.Types.ObjectId(),
        })); // giả lập khi dryRun
      }
    }

    let createdRooms = [];
    if (rooms?.perFloor && createdFloors.length) {
      const {
        perFloor,
        seqStart = 1,
        roomNumberTemplate = "{floor}{seq:02}",
        defaults = {},
        templateVars = {},
      } = rooms;

      // tập roomNumber đã có
      const existRooms = await Room.find({ buildingId: building._id })
        .select("roomNumber")
        .lean();
      const existSet = new Set(existRooms.map((x) => x.roomNumber));

      // chuẩn hóa & validate defaults
      const dArea = defaults.area != null ? Number(defaults.area) : undefined;
      if (dArea != null && Number.isNaN(dArea)) {
        return res.status(400).json({ message: "defaults.area phải là số" });
      }
      const dPrice =
        defaults.price != null ? Number(defaults.price) : undefined;
      if (dPrice != null && (Number.isNaN(dPrice) || dPrice < 0)) {
        return res
          .status(400)
          .json({ message: "defaults.price phải là số >= 0" });
      }
      const dMax =
        defaults.maxTenants != null
          ? Math.max(1, Number(defaults.maxTenants))
          : 1;
      const dStatus = defaults.status ?? "available";
      if (!["available", "rented", "maintenance"].includes(dStatus)) {
        return res
          .status(400)
          .json({ message: "defaults.status không hợp lệ" });
      }

      const roomDocs = [];
      for (const f of createdFloors) {
        for (let i = 0; i < perFloor; i++) {
          const seq = seqStart + i;
          const roomNumber = renderRoomNumber(roomNumberTemplate, {
            block: templateVars.block,
            floorLevel: f.level,
            seq,
          });
          if (existSet.has(roomNumber)) continue;
          roomDocs.push({
            buildingId: building._id,
            floorId: f._id,
            roomNumber,
            area: dArea,
            price: dPrice,
            maxTenants: dMax,
            status: dStatus,
            description: defaults.description,
          });
          existSet.add(roomNumber);
        }
      }
      if (!dryRun && roomDocs.length) {
        createdRooms = await Room.insertMany(roomDocs, { session });
      } else {
        createdRooms = roomDocs.map((x) => ({
          ...x,
          _id: new mongoose.Types.ObjectId(),
        }));
      }
    }

    if (dryRun) {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({
        dryRun: true,
        preview: { building, floors: createdFloors, rooms: createdRooms },
      });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({
      message: "Tạo tòa + tầng + phòng thành công",
      building,
      floors: createdFloors,
      rooms: createdRooms,
    });
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    if (e.code === 11000) {
      return res.status(409).json({
        error: e.message,
      });
    }
    return res.status(400).json({ message: "Lỗi hệ thống" });
  }
};

const update = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    // auth
    if (req.user.role === "staff") {
      const assigned = (req.staff?.assignedBuildingIds || []).map((x) =>
        String(x)
      );
      if (!assigned.includes(String(building._id))) {
        return res.status(403).json({ message: "Không có quyền" });
      }
    } else if (req.user.role === "landlord") {
      if (String(building.landlordId) !== String(req.user._id)) {
        return res.status(403).json({ message: "Không có quyền" });
      }
    }

    const { name, address, ePrice, wPrice, wIndexType } = req.body;
    const ownerLandlordId = building.landlordId;
    if (!name) {
      return res.status(400).json({ message: "Thiếu tên tòa nhà" });
    }
    if (!address) {
      return res.status(400).json({ message: "Thiếu địa chỉ tòa nhà" });
    }
    if (ePrice !== undefined && ePrice !== null) {
      if (isNaN(ePrice) || Number(ePrice) < 0) {
        return res.status(400).json({ message: "Tiền điện không hợp lệ" });
      }
    }

    if (wPrice !== undefined && wPrice !== null) {
      if (isNaN(wPrice) || Number(wPrice) < 0) {
        return res.status(400).json({ message: "Tiền nước không hợp lệ" });
      }
    }

    // Nếu đổi wIndexType thì chặn khi đang có hợp đồng completed còn hiệu lực
    if (wIndexType && wIndexType !== building.wIndexType) {
      const now = new Date();
      const roomIds = await Room.find({
        buildingId: building._id,
        isDeleted: false,
      })
        .select("_id")
        .lean();
      const ids = roomIds.map((r) => r._id);
      const hasActiveContract = await Contract.exists({
        roomId: { $in: ids },
        isDeleted: false,
        status: "completed",
        "contract.startDate": { $lte: now },
        "contract.endDate": { $gte: now },
      });
      if (hasActiveContract) {
        return res.status(400).json({
          message:
            "Không thể thay đổi loại chỉ số nước vì tòa đang có hợp đồng thuê còn hiệu lực",
        });
      }
    }

    if (name && name.trim() !== building.name) {
      const existed = await Building.exists({
        landlordId: ownerLandlordId,
        name: name.trim(),
        _id: { $ne: building._id },
        isDeleted: false,
      });

      if (existed) {
        return res
          .status(409)
          .json({ message: "Tên tòa đã tồn tại trong tài khoản của bạn" });
      }
    }

    const oldWIndexType = building.wIndexType;
    Object.assign(building, req.body);
    await building.save();

    const wIndexChanged = wIndexType && wIndexType !== oldWIndexType;
    const wPriceChanged = wPrice !== undefined && wPrice !== null;

    // Đồng bộ BuildingService cho trường hợp tính nước theo đầu người
    if (building.wIndexType === "byPerson") {
      if (wIndexChanged || wPriceChanged) {
        await upsertWaterPerPersonService({
          buildingId: building._id,
          landlordId: building.landlordId,
          fee: building.wPrice,
        });
      }
    } else if (wIndexChanged && oldWIndexType === "byPerson") {
      await softDeleteWaterService({
        buildingId: building._id,
        landlordId: building.landlordId,
      });
    }

    res.json({ success: true, data: building });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const softDelete = async (req, res) => {
  try {
    const { force } = req.query;
    const id = req.params.id;

    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (force === "true" && req.user.role === "admin") {
      await Promise.all([
        Room.deleteMany({ buildingId: id }),
        Floor.deleteMany({ buildingId: id }),
        Building.deleteOne({ _id: id }),
      ]);
      return res.json({ message: "Đã xóa vĩnh viễn (force)" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const now = new Date();
      await Building.updateOne(
        { _id: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await Floor.updateMany(
        { buildingId: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await Room.updateMany(
        { buildingId: id },
        { $set: { isDeleted: true, deletedAt: now } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã xóa mềm tòa nhà (cascade floor/room)" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const restore = async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || !doc.isDeleted)
      return res
        .status(404)
        .json({ message: "Không tìm thấy hoặc chưa bị xóa" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await Building.updateOne(
        { _id: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await Floor.updateMany(
        { buildingId: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await Room.updateMany(
        { buildingId: id },
        { $set: { isDeleted: false, deletedAt: null } },
        { session }
      );
      await session.commitTransaction();
      session.endSession();
      res.json({ message: "Đã khôi phục tòa nhà (cascade floor/room)" });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
const updateStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Giá trị status không hợp lệ" });
    }

    const building = await Building.findById(id).select(
      "_id landlordId isDeleted status"
    );

    if (!building || building.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    }
    if (
      req.user.role === "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (building.status === status) {
      return res.json({ message: "Trạng thái không thay đổi" });
    }

    if (status === "inactive") {
      const roomIds = await Room.find({
        buildingId: building._id,
        isDeleted: false,
      }).distinct("_id");

      if (roomIds.length > 0) {
        const now = new Date();

        const hasActiveContract = await Contract.exists({
          roomId: { $in: roomIds },
          status: "completed",
          isDeleted: false,
          "contract.startDate": { $lte: now },
          "contract.endDate": { $gte: now },
        });

        if (hasActiveContract) {
          return res.status(400).json({
            message:
              "Không thể ngưng hoạt động tòa nhà vì vẫn còn phòng có hợp đồng thuê còn hiệu lực.",
          });
        }
      }
    }

    await Building.updateOne({ _id: building._id }, { $set: { status } });
    if (status === "inactive") {
      await Floor.updateMany(
        { buildingId: building._id, isDeleted: false },
        { $set: { status: "inactive" } }
      );

      await Room.updateMany(
        { buildingId: building._id, isDeleted: false },
        { $set: { active: false } }
      );
    }
    res.json({ message: "Cập nhật trạng thái tòa nhà thành công" });
  } catch (err) {
    console.error("[updateBuildingStatus]", err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
const remove = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(doc.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const floorCount = await Floor.countDocuments({ buildingId: doc._id });
    const roomCount = await Room.countDocuments({ buildingId: doc._id });
    if (floorCount > 0 || roomCount > 0) {
      return res.status(409).json({
        message: "Hãy xoá/di chuyển Floors & Rooms trước khi xoá Building",
      });
    }
    await doc.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const downloadImportTemplate = async (req, res) => {
  try {
    const wb = new Excel.Workbook();

    // ===== Sheet Tham chiếu (ẩn) =====
    const refs = wb.addWorksheet("References");
    // Bảng enum: code EN | label VI
    // Bạn có thể mở rộng thêm hàng tùy theo hệ thống
    const enumBlocks = {
      buildingStatus: [
        ["active", "Hoạt động"],
        ["inactive", "Ngưng hoạt động"],
      ],
      floorStatus: [
        ["active", "Hoạt động"],
        ["inactive", "Ngưng hoạt động"],
      ],
      roomStatus: [
        ["available", "Sẵn sàng"],
        ["occupied", "Đang thuê"],

        ["inactive", "Ngưng hoạt động"],
      ],
      eIndexType: [["byNumber", "Theo chỉ số"]],
      wIndexType: [
        ["byNumber", "Theo chỉ số"],
        ["byPerson", "Theo đầu người"],
      ],
    };

    // Ghi từng block theo cột riêng để dễ đặt dải
    // A: buildingStatus, C: floorStatus, E: roomStatus, G: indexType
    const anchors = {
      buildingStatus: "A",
      floorStatus: "C",
      roomStatus: "E",
      eIndexType: "G",
      wIndexType: "I",
    };

    // Header
    refs.getCell("A1").value = "BuildingStatus_EN";
    refs.getCell("B1").value = "BuildingStatus_VI";
    refs.getCell("C1").value = "FloorStatus_EN";
    refs.getCell("D1").value = "FloorStatus_VI";
    refs.getCell("E1").value = "RoomStatus_EN";
    refs.getCell("F1").value = "RoomStatus_VI";

    refs.getCell("G1").value = "EIndexType_EN";
    refs.getCell("H1").value = "EIndexType_VI";
    refs.getCell("I1").value = "WIndexType_EN";
    refs.getCell("J1").value = "WIndexType_VI";

    // Đổ dữ liệu enums
    const putEnum = (startCol, rows) => {
      rows.forEach((r, i) => {
        refs.getCell(`${startCol}${i + 2}`).value = r[0]; // EN
        // kế bên là VI
        const viCol = String.fromCharCode(startCol.charCodeAt(0) + 1);
        refs.getCell(`${viCol}${i + 2}`).value = r[1];
      });
    };
    putEnum("A", enumBlocks.buildingStatus);
    putEnum("C", enumBlocks.floorStatus);
    putEnum("E", enumBlocks.roomStatus);
    putEnum("G", enumBlocks.eIndexType);
    putEnum("I", enumBlocks.wIndexType);
    // (Ẩn) sheet tham chiếu
    refs.state = "veryHidden";

    // ===== README =====
    const readme = wb.addWorksheet("README");
    readme.getCell("A1").value = "RMS – Hướng dẫn nhập Excel";
    readme.getCell("A3").value =
      "- Các cột enum dùng TIẾNG VIỆT (dropdown). Hệ thống sẽ tự map sang TIẾNG ANH.";
    readme.getCell("A4").value = "- Không đổi tên header ở hàng 1.";
    readme.getCell("A5").value = "- Số (giá/diện tích/chỉ số) phải >= 0.";
    readme.getColumn(1).width = 120;

    // ===== Buildings =====
    const wsB = wb.addWorksheet("Buildings");
    const buildingsHeaders = [
      "name",
      "address",
      "status",
      "eIndexType",
      "ePrice",
      "wIndexType",
      "wPrice",
    ];
    wsB.addRow(buildingsHeaders);
    wsB.addRow([
      "Tòa A",
      "123 Lê Lợi, Quận 1, TP.HCM",
      "Hoạt động",
      "Theo chỉ số",
      3500,
      "Theo chỉ số",
      15000,
    ]);
    wsB.autoFilter = { from: "A1", to: "G1" };
    wsB.columns = buildingsHeaders.map((h) => ({
      header: h,
      width: Math.max(12, h.length + 2),
    }));

    // ===== Floors =====
    const wsF = wb.addWorksheet("Floors");
    const floorsHeaders = ["buildingName", "level", "description", "status"];
    wsF.addRow(floorsHeaders);
    wsF.addRow(["Tòa A", 1, "Khu chính", "Hoạt động"]);
    wsF.addRow(["Tòa A", 2, "Khu phụ", "Hoạt động"]);
    wsF.autoFilter = { from: "A1", to: "D1" };
    wsF.columns = floorsHeaders.map((h) => ({
      header: h,
      width: Math.max(12, h.length + 2),
    }));

    // ===== Rooms =====
    const wsR = wb.addWorksheet("Rooms");
    const roomsHeaders = [
      "buildingName",
      "floorLevel",
      "roomNumber",
      "area",
      "price",
      "maxTenants",
      "status",
      "eStart",
      "wStart",
      "description",
    ];
    wsR.addRow(roomsHeaders);
    wsR.addRow([
      "Tòa A",
      1,
      "101",
      25,
      3500000,
      2,
      "Sẵn sàng",
      0,
      0,
      "Phòng tiêu chuẩn",
    ]);
    wsR.addRow([
      "Tòa A",
      1,
      "102",
      20,
      3000000,
      2,
      "Sẵn sàng",
      0,
      0,
      "Gần thang máy",
    ]);
    wsR.addRow(["Tòa A", 2, "201", 30, 4000000, 3, "Sẵn sàng", 0, 0, ""]);
    wsR.autoFilter = { from: "A1", to: "J1" };
    wsR.columns = roomsHeaders.map((h) => ({
      header: h,
      width: Math.max(12, h.length + 2),
    }));

    // ===== Data Validation (Dropdown tiếng Việt) =====
    // Công thức tham chiếu danh sách tiếng Việt ở sheet References
    const lists = {
      buildingStatusVI: `References!$B$2:$B$${
        enumBlocks.buildingStatus.length + 1
      }`,
      floorStatusVI: `References!$D$2:$D$${enumBlocks.floorStatus.length + 1}`,
      roomStatusVI: `References!$F$2:$F$${enumBlocks.roomStatus.length + 1}`,

      eIndexTypeVI: `References!$H$2:$H$${enumBlocks.eIndexType.length + 1}`,
      wIndexTypeVI: `References!$J$2:$J$${enumBlocks.wIndexType.length + 1}`,
    };

    // Helper: áp dropdown cho 1 cột từ dòng 2 → 1000 (tùy chỉnh)
    const applyListValidation = (ws, colNumber, formula) => {
      for (let r = 2; r <= 1000; r++) {
        ws.getCell(r, colNumber).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [formula],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Giá trị không hợp lệ",
          error: "Vui lòng chọn trong danh sách sổ xuống.",
          showInputMessage: true,
          promptTitle: "Chọn từ danh sách",
          prompt: "Nhấn vào mũi tên để chọn.",
        };
      }
    };

    // Buildings: status (C), eIndexType (D), wIndexType (F)
    applyListValidation(wsB, 3, lists.buildingStatusVI);
    applyListValidation(wsB, 4, lists.eIndexTypeVI);
    applyListValidation(wsB, 6, lists.wIndexTypeVI);

    // Floors: status (D)
    applyListValidation(wsF, 4, lists.floorStatusVI);

    // Rooms: status (G)
    applyListValidation(wsR, 7, lists.roomStatusVI);

    // (Tuỳ chọn) Validation số >= 0
    const applyNumberNonNegative = (ws, colNumber) => {
      for (let r = 2; r <= 1000; r++) {
        ws.getCell(r, colNumber).dataValidation = {
          type: "decimal",
          operator: "greaterThanOrEqual",
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Số không hợp lệ",
          error: "Giá trị phải là số ≥ 0.",
        };
      }
    };
    applyNumberNonNegative(wsB, 5); // ePrice
    applyNumberNonNegative(wsB, 7); // wPrice
    applyNumberNonNegative(wsR, 4); // area
    applyNumberNonNegative(wsR, 5); // price
    applyNumberNonNegative(wsR, 6); // maxTenants
    applyNumberNonNegative(wsR, 8); // eStart
    applyNumberNonNegative(wsR, 9); // wStart

    // Xuất file
    const filename = "rms_import_template.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message || "Không thể tạo template" });
  }
};

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const isNum = (v) => Number.isFinite(Number(v));
const toNum = (v, d = 0) => (isNum(v) ? Number(v) : d);

// ===== Map VI -> EN cho dropdown trong Excel =====
const VI_EN_MAP = {
  buildingStatus: {
    "hoạt động": "active",
    "ngưng hoạt động": "inactive",
  },
  floorStatus: {
    "hoạt động": "active",
    "ngưng hoạt động": "inactive",
  },
  roomStatus: {
    "sẵn sàng": "available",
    "đang thuê": "occupied",
    "bảo trì": "maintenance",
    "ngưng hoạt động": "inactive",
  },
  indexType: {
    "theo chỉ số": "byNumber",
    "theo đầu người": "byPerson",
    "đã bao gồm": "included",
  },
};

// Tập EN hợp lệ (để chấp nhận cả khi user gõ code EN)
const ALLOW = {
  buildingStatus: new Set(["active", "inactive"]),
  floorStatus: new Set(["active", "inactive"]),
  roomStatus: new Set(["available", "occupied", "maintenance", "inactive"]),
  indexType: new Set(["byNumber", "byPerson", "included"]),
};

// Helper: map & validate enum
function mapEnumOrError(raw, kind, fallbackEN, humanLabelList) {
  const vRaw = String(raw || "").trim();
  if (!vRaw) return { ok: true, value: fallbackEN }; // cho phép để trống → dùng default
  const vNorm = norm(vRaw);

  // nếu gõ EN hợp lệ → giữ nguyên
  if (ALLOW[kind].has(vRaw)) return { ok: true, value: vRaw };
  // nếu gõ EN (lower) hợp lệ → trả về dạng chuẩn
  if (ALLOW[kind].has(vNorm)) return { ok: true, value: vNorm };

  // nếu gõ VI đúng → map sang EN
  const mapped = VI_EN_MAP[kind][vNorm];
  if (mapped) return { ok: true, value: mapped };

  // không khớp → trả lỗi gợi ý
  const suggest = humanLabelList.join(" | ");
  return {
    ok: false,
    error: `Giá trị không hợp lệ: "${vRaw}". Hợp lệ: ${suggest}`,
  };
}

const importFromExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Thiếu file Excel" });

    const partsRaw = String(
      req.query.parts ?? req.body.parts ?? "auto"
    ).toLowerCase();
    const chosen =
      partsRaw === "auto"
        ? null
        : new Set(partsRaw.split(",").map((s) => s.trim()));
    const doB = chosen ? chosen.has("buildings") : null;
    const doF = chosen ? chosen.has("floors") : null;
    const doR = chosen ? chosen.has("rooms") : null;

    // on-duplicate behavior
    const onDupFloor = String(
      req.query.onDupFloor ?? req.body.onDupFloor ?? "error"
    ); // 'skip' | 'error'
    const onDupRoom = String(
      req.query.onDupRoom ?? req.body.onDupRoom ?? "error"
    ); // 'skip' | 'error'

    const wb = xlsx.read(req.file.buffer, { type: "buffer" });

    // Đọc 3 sheet, defval để không bị undefined
    const shBuildings = xlsx.utils.sheet_to_json(wb.Sheets["Buildings"] || {}, {
      defval: "",
    });
    const shFloors = xlsx.utils.sheet_to_json(wb.Sheets["Floors"] || {}, {
      defval: "",
    });
    const shRooms = xlsx.utils.sheet_to_json(wb.Sheets["Rooms"] || {}, {
      defval: "",
    });

    // Nếu parts = auto → suy ra từ việc sheet có dữ liệu
    const willDoB = chosen ? doB : shBuildings.length > 0;
    const willDoF = chosen ? doF : shFloors.length > 0;
    const willDoR = chosen ? doR : shRooms.length > 0;

    if (!willDoB && !willDoF && !willDoR) {
      return res.status(400).json({
        message:
          "Không có phần nào để import (check 'parts' hoặc dữ liệu trong sheet).",
      });
    }

    const errors = [];

    // ===================== VALIDATE & PAYLOAD =====================

    // Buildings
    const buildingsPayload = willDoB
      ? shBuildings.map((r, i) => {
          const name = r.name;
          const address = r.address;

          // status: default 'active'
          const mStatus = mapEnumOrError(r.status, "buildingStatus", "active", [
            "Hoạt động/active",
            "Ngưng hoạt động/inactive",
          ]);

          // eIndexType, wIndexType: default 'byNumber'
          const mEIdx = mapEnumOrError(r.eIndexType, "indexType", "byNumber", [
            "Theo chỉ số/byNumber",
            "Theo đầu người/byPerson",
            "Đã bao gồm/included",
          ]);
          const mWIdx = mapEnumOrError(r.wIndexType, "indexType", "byNumber", [
            "Theo chỉ số/byNumber",
            "Theo đầu người/byPerson",
            "Đã bao gồm/included",
          ]);

          const ePrice = toNum(r.ePrice, 0);
          const wPrice = toNum(r.wPrice, 0);

          const rowErr = [];
          if (!name || !norm(name)) rowErr.push("name bắt buộc");
          if (!address) rowErr.push("address bắt buộc");
          if (!mStatus.ok) rowErr.push(`status: ${mStatus.error}`);
          if (!mEIdx.ok) rowErr.push(`eIndexType: ${mEIdx.error}`);
          if (!mWIdx.ok) rowErr.push(`wIndexType: ${mWIdx.error}`);
          if (ePrice < 0) rowErr.push("ePrice >= 0");
          if (wPrice < 0) rowErr.push("wPrice >= 0");

          if (rowErr.length)
            errors.push({ sheet: "Buildings", row: i + 2, errors: rowErr });

          return {
            name,
            address,
            status: mStatus.ok ? mStatus.value : "active",
            eIndexType: mEIdx.ok ? mEIdx.value : "byNumber",
            ePrice,
            wIndexType: mWIdx.ok ? mWIdx.value : "byNumber",
            wPrice,
          };
        })
      : [];

    // Floors
    const floorsPayload = willDoF
      ? shFloors.map((r, i) => {
          const buildingName = r.buildingName;
          const level = toNum(r.level, NaN);
          const description = r.description || "";

          const mStatus = mapEnumOrError(r.status, "floorStatus", "active", [
            "Hoạt động/active",
            "Ngưng hoạt động/inactive",
          ]);

          const rowErr = [];
          if (!buildingName) rowErr.push("buildingName bắt buộc");
          if (!isNum(level)) rowErr.push("level bắt buộc và là số");
          if (!mStatus.ok) rowErr.push(`status: ${mStatus.error}`);

          if (rowErr.length)
            errors.push({ sheet: "Floors", row: i + 2, errors: rowErr });

          return {
            buildingName,
            level: Number(level),
            description,
            status: mStatus.ok ? mStatus.value : "active",
          };
        })
      : [];

    // Rooms
    const roomsPayload = willDoR
      ? shRooms.map((r, i) => {
          const buildingName = r.buildingName;
          const floorLevel = toNum(r.floorLevel, NaN);
          const roomNumber = String(r.roomNumber || "").trim();
          const area = toNum(r.area, 0);
          const price = toNum(r.price, 0);
          const maxTenants = toNum(r.maxTenants, 1);
          const eStart = toNum(r.eStart, 0);
          const wStart = toNum(r.wStart, 0);
          const description = r.description || "";

          const mStatus = mapEnumOrError(r.status, "roomStatus", "available", [
            "Sẵn sàng/available",
            "Đang thuê/occupied",
            "Bảo trì/maintenance",
            "Ngưng hoạt động/inactive",
          ]);

          const rowErr = [];
          if (!buildingName) rowErr.push("buildingName bắt buộc");
          if (!isNum(floorLevel)) rowErr.push("floorLevel bắt buộc và là số");
          if (!roomNumber) rowErr.push("roomNumber bắt buộc");
          if (area <= 0) rowErr.push("area > 0");
          if (price < 0) rowErr.push("price >= 0");
          if (maxTenants < 1) rowErr.push("maxTenants >= 1");
          if (eStart < 0) rowErr.push("eStart >= 0");
          if (wStart < 0) rowErr.push("wStart >= 0");
          if (!mStatus.ok) rowErr.push(`status: ${mStatus.error}`);

          if (rowErr.length)
            errors.push({ sheet: "Rooms", row: i + 2, errors: rowErr });

          return {
            buildingName,
            floorLevel: Number(floorLevel),
            roomNumber,
            area,
            price,
            maxTenants,
            status: mStatus.ok ? mStatus.value : "available",
            eStart,
            wStart,
            description,
          };
        })
      : [];

    if (errors.length)
      return res.status(422).json({ message: "Dữ liệu không hợp lệ", errors });

    // Trùng tên tòa trong file (chỉ check khi đang import buildings)
    if (willDoB) {
      const seen = new Set();
      for (const b of buildingsPayload) {
        const key = norm(b.name);
        if (seen.has(key)) {
          errors.push({
            sheet: "Buildings",
            errors: [`Tên tòa '${b.name}' trùng trong file`],
          });
        } else seen.add(key);
      }
      if (errors.length)
        return res
          .status(422)
          .json({ message: "Tên tòa bị trùng trong file", errors });
    }

    // ===================== TRA CỨU TỪ DB CHO LIÊN KẾT =====================

    // Tên tòa sẽ dùng (từ buildings mới + từ floors/rooms tham chiếu)
    const namesUsed = new Set([
      ...(willDoB ? buildingsPayload.map((b) => norm(b.name)) : []),
      ...(willDoF ? floorsPayload.map((f) => norm(f.buildingName)) : []),
      ...(willDoR ? roomsPayload.map((r) => norm(r.buildingName)) : []),
    ]);
    namesUsed.delete("");

    // Tải các tòa có sẵn trong DB theo name
    const landlordFilter =
      req.user?.role === "landlord" ? { landlordId: req.user._id } : {};
    let existedBuildings = [];
    if (namesUsed.size) {
      const orConds = Array.from(namesUsed).map((n) => ({
        name: new RegExp(
          `^\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
          "i"
        ),
        isDeleted: false,
      }));
      existedBuildings = await Building.find({
        ...landlordFilter,
        $or: orConds,
      }).lean();
    }

    // Map tên (normalized) -> buildingDoc[]
    const existingMap = new Map();
    for (const b of existedBuildings) {
      const k = norm(b.name);
      if (!existingMap.has(k)) existingMap.set(k, []);
      existingMap.get(k).push(b);
    }

    // Nếu KHÔNG import buildings mà lại muốn import floors/rooms → bắt buộc tất cả buildingName phải tồn tại
    if (!willDoB && (willDoF || willDoR)) {
      const missing = [];
      const needNames = new Set([
        ...(willDoF ? floorsPayload.map((f) => norm(f.buildingName)) : []),
        ...(willDoR ? roomsPayload.map((r) => norm(r.buildingName)) : []),
      ]);
      for (const nm of needNames) {
        if (!existingMap.has(nm)) missing.push(nm);
      }
      if (missing.length) {
        return res.status(422).json({
          message:
            "Một số buildingName tham chiếu không tồn tại trong DB (và bạn không import Buildings).",
          missingBuildingNames: missing,
        });
      }
    }

    // Trùng tên tòa trong DB (chỉ check khi import buildings)
    if (willDoB && buildingsPayload.length) {
      const dbDup = await Building.find({
        ...landlordFilter,
        isDeleted: false,
        name: {
          $in: buildingsPayload.map(
            (b) =>
              new RegExp(
                `^\\s*${b.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
                "i"
              )
          ),
        },
      }).select("name");
      if (dbDup.length) {
        return res.status(422).json({
          message: `Tòa '${dbDup[0].name}' đã tồn tại trong hệ thống`,
        });
      }
    }

    // ===================== TRANSACTION =====================
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const landlordId =
        req.user?.role === "landlord" ? req.user._id : undefined;

      // 1) Create Buildings (tuỳ phần)
      const newlyCreatedBuildings = [];
      if (willDoB && buildingsPayload.length) {
        const docs = buildingsPayload.map((b) => ({
          name: b.name.trim(),
          address: b.address,
          status: b.status, // đã map EN
          eIndexType: b.eIndexType, // đã map EN
          ePrice: b.ePrice || 0,
          wIndexType: b.wIndexType, // đã map EN
          wPrice: b.wPrice || 0,
          landlordId,
          isDeleted: false,
        }));
        const inserted = await Building.insertMany(docs, { session });
        newlyCreatedBuildings.push(...inserted);
      }

      // Map tên tòa → _id (gộp cả có sẵn & mới tạo)
      const buildingIdByName = new Map();
      for (const b of existedBuildings)
        buildingIdByName.set(norm(b.name), b._id);
      for (const b of newlyCreatedBuildings)
        buildingIdByName.set(norm(b.name), b._id);

      // 2) Create Floors (tuỳ phần)
      const floorsCreated = [];
      if (willDoF && floorsPayload.length) {
        const floorDocs = [];

        for (const f of floorsPayload) {
          const bId = buildingIdByName.get(norm(f.buildingName));
          if (!bId)
            throw new Error(
              `Không tìm thấy tòa để tạo tầng: "${f.buildingName}"`
            );

          // kiểm tra trùng Floor theo (buildingId, level)
          const existed = await Floor.findOne(
            { buildingId: bId, level: f.level, isDeleted: false },
            null,
            { session }
          );
          if (existed) {
            if (onDupFloor === "skip") continue;
            if (onDupFloor === "error") {
              throw new Error(
                `Tầng đã tồn tại: ${f.buildingName} - level ${f.level}`
              );
            }
          }

          floorDocs.push({
            buildingId: bId,
            level: f.level,
            floorNumber: f.level,
            description: f.description || "",
            status: f.status, // đã map EN
            isDeleted: false,
          });
        }

        if (floorDocs.length) {
          const insertedF = await Floor.insertMany(floorDocs, { session });
          floorsCreated.push(...insertedF);
        }
      }

      // Chuẩn bị map floorId theo (buildingId, level) phục vụ tạo room
      const floorIdByBuildingLevel = new Map();
      if (willDoR && roomsPayload.length) {
        // load tất cả floor liên quan từ DB (bao gồm vừa có sẵn, vừa mới tạo)
        const bIdSet = new Set(
          roomsPayload
            .map((r) => buildingIdByName.get(norm(r.buildingName)))
            .filter(Boolean)
        );
        const levelsSet = new Set(roomsPayload.map((r) => r.floorLevel));

        if (bIdSet.size && levelsSet.size) {
          const existedFloors = await Floor.find(
            {
              buildingId: { $in: Array.from(bIdSet) },
              level: { $in: Array.from(levelsSet) },
              isDeleted: false,
            },
            null,
            { session }
          ).lean();

          for (const f of existedFloors) {
            floorIdByBuildingLevel.set(
              `${String(f.buildingId)}|${f.level}`,
              f._id
            );
          }
        }
        // thêm các floor mới tạo (nếu có)
        for (const f of floorsCreated) {
          floorIdByBuildingLevel.set(
            `${String(f.buildingId)}|${f.level}`,
            f._id
          );
        }
      }

      // 3) Create Rooms (tuỳ phần)
      let roomsInsertedCount = 0;
      if (willDoR && roomsPayload.length) {
        const roomDocs = [];

        for (const r of roomsPayload) {
          const bId = buildingIdByName.get(norm(r.buildingName));
          if (!bId)
            throw new Error(
              `Không tìm thấy tòa cho phòng: "${r.buildingName}"`
            );

          const fId = floorIdByBuildingLevel.get(
            `${String(bId)}|${r.floorLevel}`
          );
          if (!fId)
            throw new Error(
              `Không tìm thấy tầng ${r.floorLevel} của tòa "${r.buildingName}"`
            );

          // kiểm tra trùng phòng (floorId, roomNumber)
          const existed = await Room.findOne(
            { floorId: fId, roomNumber: r.roomNumber, isDeleted: false },
            null,
            { session }
          );
          if (existed) {
            if (onDupRoom === "skip") continue;
            if (onDupRoom === "error") {
              throw new Error(
                `Phòng trùng số: ${r.roomNumber} (tầng ${r.floorLevel} - ${r.buildingName})`
              );
            }
          }

          roomDocs.push({
            buildingId: bId,
            floorId: fId,
            roomNumber: r.roomNumber,
            area: r.area,
            price: r.price,
            maxTenants: r.maxTenants,
            status: r.status, // đã map EN
            description: r.description || "",
            eStart: r.eStart || 0,
            wStart: r.wStart || 0,
            isDeleted: false,
          });
        }

        if (roomDocs.length) {
          await Room.insertMany(roomDocs, { session });
          roomsInsertedCount = roomDocs.length;
        }
      }

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: "Import thành công",
        results: {
          buildingsCreated: willDoB ? buildingsPayload.length : 0,
          floorsCreated: willDoF ? floorsCreated.length : 0,
          roomsCreated: willDoR ? roomsInsertedCount : 0,
        },
      });
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: txErr.message || "Import thất bại" });
    }
  } catch (e) {
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
async function getLaundryDevicesInBuilding({
  user,
  buildingId,
  floorId,
  status,
  type,
}) {
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    const err = new Error("buildingId không hợp lệ");
    err.statusCode = 400;
    throw err;
  }

  const building = await Building.findById(buildingId)
    .select("landlordId isDeleted status")
    .lean();

  if (!building || building.isDeleted) {
    const err = new Error("Không tìm thấy tòa nhà");
    err.statusCode = 404;
    throw err;
  }

  // ===== FLOOR FILTER =====
  const floorFilter = { buildingId, isDeleted: false };
  if (floorId) {
    if (!mongoose.Types.ObjectId.isValid(floorId)) {
      const err = new Error("floorId không hợp lệ");
      err.statusCode = 400;
      throw err;
    }
    floorFilter._id = floorId;
  }

  const floors = await Floor.find(floorFilter)
    .select("_id level description laundryDevices")
    .lean();

  if (!floors.length) return { buildingId, total: 0, data: [] };

  // ===== COLLECT WASHERS =====
  const washerDevices = [];
  for (const floor of floors) {
    (floor.laundryDevices || []).forEach((d) => {
      washerDevices.push({
        buildingId,
        floorId: floor._id,
        floorLevel: floor.level,
        deviceId: d._id,
        name: d.name,
        tuyaDeviceId: d.tuyaDeviceId,
        type: d.type,
      });
    });
  }

  // Apply type filter if requested (washer|dryer)
  let filteredDevices = washerDevices;
  if (type && typeof type === "string") {
    const t = String(type).toLowerCase();
    if (["washer", "dryer"].includes(t)) {
      filteredDevices = filteredDevices.filter((d) => d.type === t);
    } else {
      const err = new Error("type không hợp lệ (washer|dryer)");
      err.statusCode = 400;
      throw err;
    }
  }

  if (!filteredDevices.length) return { buildingId, total: 0, data: [] };

  // ===== CHECK TUYA STATUS =====
  const mapDeviceWithStatus = async (dev) => {
    try {
      const statusList = await getDeviceStatus(dev.tuyaDeviceId);
      let power = 0;
      let switchOn = false;

      statusList.forEach((item) => {
        if (item.code === "cur_power") power = item.value || 0;
        if (item.code === "switch_1") switchOn = !!item.value;
      });

      let runningStatus = "idle";
      if (switchOn && power > 3) runningStatus = "running";

      return { ...dev, status: runningStatus, power };
    } catch (err) {
      console.error("getDeviceStatus error:", dev.tuyaDeviceId, err.message);
      return { ...dev, status: "unknown", power: 0 };
    }
  };

  let devicesWithStatus = await Promise.all(
    filteredDevices.map(mapDeviceWithStatus)
  );

  // FILTER BY STATUS
  if (status && ["running", "idle", "unknown"].includes(status)) {
    devicesWithStatus = devicesWithStatus.filter((d) => d.status === status);
  }

  return {
    buildingId,
    total: devicesWithStatus.length,
    data: devicesWithStatus,
  };
}

// GET /buildings/:buildingId/laundry-devices
// Danh sách tất cả thiết bị giặt/sấy (washer/dryer) trong 1 tòa, có filter theo tầng, loại & trạng thái
const listLaundryDevicesInBuilding = async (req, res) => {
  try {
    const result = await getLaundryDevicesInBuilding({
      user: req.user,
      buildingId: req.params.buildingId,
      floorId: req.query.floorId,
      status: req.query.status,
      type: req.query.type,
    });

    return res.json(result);
  } catch (err) {
    console.error("listWashersInBuilding error:", err);
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Lỗi máy chủ" });
  }
};

module.exports = {
  list,
  getById,
  create,
  quickSetup,
  update,
  softDelete,
  restore,
  updateStatus,
  remove,
  downloadImportTemplate,
  importFromExcel,
  listLaundryDevicesInBuilding,
  getLaundryDevicesInBuilding,
};
