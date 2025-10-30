const mongoose = require("mongoose");
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");
const xlsx = require("xlsx");

const list = async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      includeDeleted = "false",
      status,
    } = req.query;
    const filter = {};
    if (status) filter.status = String(status);
    if (includeDeleted !== "true") filter.isDeleted = false;
    if (q) filter.name = { $regex: q, $options: "i" };
    if (req.user.role === "landlord") filter.landlordId = req.user._id;

    const data = await Building.find(filter)
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .populate({
        path: "landlordId",
        select: "email role userInfo fullName",
        populate: { path: "userInfo", select: "fullName phone" },
      })
      .lean(); // để trả về object thuần, dễ map

    // Tuỳ ý: flatten thông tin landlord cho FE dễ dùng
    const items = data.map((b) => ({
      ...b,
      landlord: {
        id: b.landlordId?._id,
        email: b.landlordId?.email,
        role: b.landlordId?.role,
        fullName: b.landlordId?.userInfo?.fullName,
        phone: b.landlordId?.userInfo?.phone,
      },
    }));

    const total = await Building.countDocuments(filter);
    res.json({ data: items, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message.message });
  }
};

const getById = async (req, res) => {
  try {
    const doc = await Building.findById(req.params.id)
      .populate({
        path: "landlordId",
        select: "email role userInfo fullName",
        populate: { path: "userInfo", select: "fullName phone" },
      })
      .lean();
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });

    if (
      req.user.role === "landlord" &&
      String(doc.landlordId?._id) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const result = {
      ...doc,
      landlord: {
        id: doc.landlordId?._id,
        email: doc.landlordId?.email,
        role: doc.landlordId?.role,
        fullName: doc.landlordId?.userInfo?.fullName,
        phone: doc.landlordId?.userInfo?.phone,
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
    return res.status(400).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
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
    if (
      req.user.role !== "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }
    Object.assign(building, req.body);
    await building.save();
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

    // Soft delete + cascade mềm xuống Floor/Room
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

    const doc = await Building.findById(id).select("landlordId isDeleted");
    if (!doc || doc.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (
      req.user.role === "landlord" &&
      String(doc.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    await Building.updateOne({ _id: id }, { $set: { status } });
    res.json({ message: "Cập nhật trạng thái thành công" });
  } catch (e) {
    res.status(500).json({ message: e.message });
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
    // 1) Tạo workbook mới
    const wb = xlsx.utils.book_new();

    // 2) Dữ liệu mẫu cho từng sheet (có thể sửa theo nhu cầu)
    // ===== Sheet Buildings =====
    const buildingsHeaders = [
      "name",
      "address",
      "status",
      "eIndexType",
      "ePrice",
      "wIndexType",
      "wPrice",
    ];
    const buildingsRows = [
      {
        name: "Tòa A",
        address: "123 Lê Lợi, Quận 1, TP.HCM",
        status: "active",
        eIndexType: "byNumber",
        ePrice: 3500,
        wIndexType: "byNumber",
        wPrice: 15000,
      },
    ];
    const wsBuildings = xlsx.utils.json_to_sheet(buildingsRows, {
      header: buildingsHeaders,
    });

    // ===== Sheet Floors =====
    const floorsHeaders = ["buildingName", "level", "description", "status"];
    const floorsRows = [
      {
        buildingName: "Tòa A",
        level: 1,
        description: "Khu chính",
        status: "active",
      },
      {
        buildingName: "Tòa A",
        level: 2,
        description: "Khu phụ",
        status: "active",
      },
    ];
    const wsFloors = xlsx.utils.json_to_sheet(floorsRows, {
      header: floorsHeaders,
    });

    // ===== Sheet Rooms =====
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
    const roomsRows = [
      {
        buildingName: "Tòa A",
        floorLevel: 1,
        roomNumber: "101",
        area: 25,
        price: 3500000,
        maxTenants: 2,
        status: "available",
        eStart: 0,
        wStart: 0,
        description: "Phòng tiêu chuẩn",
      },
      {
        buildingName: "Tòa A",
        floorLevel: 1,
        roomNumber: "102",
        area: 20,
        price: 3000000,
        maxTenants: 2,
        status: "available",
        eStart: 0,
        wStart: 0,
        description: "Gần thang máy",
      },
      {
        buildingName: "Tòa A",
        floorLevel: 2,
        roomNumber: "201",
        area: 30,
        price: 4000000,
        maxTenants: 3,
        status: "available",
        eStart: 0,
        wStart: 0,
        description: "",
      },
    ];
    const wsRooms = xlsx.utils.json_to_sheet(roomsRows, {
      header: roomsHeaders,
    });

    // 3) Thêm sheet vào workbook
    xlsx.utils.book_append_sheet(wb, wsBuildings, "Buildings");
    xlsx.utils.book_append_sheet(wb, wsFloors, "Floors");
    xlsx.utils.book_append_sheet(wb, wsRooms, "Rooms");

    // 4) Kẻ khung header (tùy chọn nhỏ gọn)
    const autoFit = (ws, headers) => {
      const colWidths = headers.map((h) => ({
        wch: Math.max(12, String(h).length + 2),
      }));
      ws["!cols"] = colWidths;
    };
    autoFit(wsBuildings, buildingsHeaders);
    autoFit(wsFloors, floorsHeaders);
    autoFit(wsRooms, roomsHeaders);

    // 5) Xuất ra buffer xlsx
    const buf = xlsx.write(wb, { bookType: "xlsx", type: "buffer" });

    // 6) Header tải file về
    const filename = "rms_import_template.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buf);
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
          const status =
            norm(r.status || "active") === "inactive" ? "inactive" : "active";
          const eIndexType = r.eIndexType || "byNumber";
          const ePrice = toNum(r.ePrice, 0);
          const wIndexType = r.wIndexType || "byNumber";
          const wPrice = toNum(r.wPrice, 0);

          const rowErr = [];
          if (!name || !norm(name)) rowErr.push("name bắt buộc");
          if (!address) rowErr.push("address bắt buộc");
          if (ePrice < 0) rowErr.push("ePrice >= 0");
          if (wPrice < 0) rowErr.push("wPrice >= 0");
          if (rowErr.length)
            errors.push({ sheet: "Buildings", row: i + 2, errors: rowErr });

          return {
            name,
            address,
            status,
            eIndexType,
            ePrice,
            wIndexType,
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
          const status =
            norm(r.status || "active") === "inactive" ? "inactive" : "active";

          const rowErr = [];
          if (!buildingName) rowErr.push("buildingName bắt buộc");
          if (!isNum(level)) rowErr.push("level bắt buộc và là số");
          if (rowErr.length)
            errors.push({ sheet: "Floors", row: i + 2, errors: rowErr });

          return { buildingName, level: Number(level), description, status };
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
          const status = r.status || "available";
          const eStart = toNum(r.eStart, 0);
          const wStart = toNum(r.wStart, 0);
          const description = r.description || "";

          const rowErr = [];
          if (!buildingName) rowErr.push("buildingName bắt buộc");
          if (!isNum(floorLevel)) rowErr.push("floorLevel bắt buộc và là số");
          if (!roomNumber) rowErr.push("roomNumber bắt buộc");
          if (area <= 0) rowErr.push("area > 0");
          if (price < 0) rowErr.push("price >= 0");
          if (maxTenants < 1) rowErr.push("maxTenants >= 1");
          if (eStart < 0) rowErr.push("eStart >= 0");
          if (wStart < 0) rowErr.push("wStart >= 0");
          if (rowErr.length)
            errors.push({ sheet: "Rooms", row: i + 2, errors: rowErr });

          return {
            buildingName,
            floorLevel: Number(floorLevel),
            roomNumber,
            area,
            price,
            maxTenants,
            status,
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
          status: b.status,
          eIndexType: b.eIndexType || "byNumber",
          ePrice: b.ePrice || 0,
          wIndexType: b.wIndexType || "byNumber",
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
            status: f.status || "active",
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
            status: r.status || "available",
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
};
