const mongoose = require("mongoose");
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");
const { cloudinary } = require("../configs/cloudinary");
const renderRoomNumber = require("../utils/renderRoomNumber");

//helper: lấy public_id từ Cloudinary URL
function getCloudinaryPublicId(url) {
  // Ví dụ URL:
  // https://res.cloudinary.com/<cloud>/image/upload/v1699999999/rooms/123/169...-abc.webp
  // public_id cần là: rooms/123/169...-abc
  try {
    const u = new URL(url);
    const afterUpload = u.pathname.split("/upload/")[1]; // v169.../rooms/123/169...-abc.webp
    if (!afterUpload) return null;
    const noVersion = afterUpload.replace(/^v\d+\//, ""); // rooms/123/169...-abc.webp
    return noVersion.replace(/\.[^/.]+$/, ""); // bỏ .webp
  } catch (_) {
    return null;
  }
}

const list = async (req, res) => {
  try {
    const {
      buildingId,
      floorId,
      status,
      q,
      page = 1,
      limit = 20,
      includeDeleted = "false",
      onlyActive = "false",
    } = req.query;
    const filter = {};

    if (buildingId) filter.buildingId = buildingId;
    if (floorId) filter.floorId = floorId;
    if (status) filter.status = status;
    if (q) filter.roomNumber = { $regex: q, $options: "i" };
    if (includeDeleted !== "true") filter.isDeleted = false;
    if (onlyActive === "true") filter.active = true;

    if (req.user.role === "landlord") {
      const blds = await Building.find({ landlordId: req.user._id }).select(
        "_id"
      );
      const ids = blds.map((b) => b._id);
      filter.buildingId = filter.buildingId || { $in: ids };
    }
    const data = await Room.find(filter)
      .populate("buildingId", "name address description ePrice wPrice")
      .populate("floorId", "floorNumber")
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    const total = await Room.countDocuments(filter);
    res.json({ data, total, page: +page, limit: +limit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const r = await Room.findById(req.params.id)
      .populate(
        "buildingId",
        "name address description ePrice wPrice eIndexType wIndexType"
      )
      .populate("floorId", "floorNumber level")
      .lean();

    const b = await Building.findById(r.buildingId).select(
      "landlordId isDeleted"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    res.json(r);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const create = async (req, res) => {
  try {
    // Parse JSON data from the 'data' field
    let roomData;
    if (req.body.data) {
      // New format: data is in req.body.data as JSON string
      roomData = JSON.parse(req.body.data);
    } else {
      // Fallback: old format for backward compatibility
      roomData = req.body;
    }
    
    const {
      buildingId,
      floorId,
      roomNumber,
      area,
      price,
      maxTenants = 1,
      status = "available",
      description = "",
    } = roomData;

    if (
      !mongoose.isValidObjectId(buildingId) ||
      !mongoose.isValidObjectId(floorId)
    ) {
      return res
        .status(400)
        .json({ message: "buildingId/floorId không hợp lệ" });
    }

    const [b, f] = await Promise.all([
      Building.findById(buildingId).select("landlordId isDeleted status"),
      Floor.findById(floorId).select("buildingId isDeleted status"),
    ]);

    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà đã bị xóa" });
    if (b.status === "inactive")
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });

    if (!f) {
      return res.status(404).json({
        message: "Không tìm thấy tầng (floorId sai hoặc không tồn tại)",
      });
    }
    if (f.isDeleted) return res.status(404).json({ message: "Tầng đã bị xóa" });
    if (f.status === "inactive")
      return res.status(403).json({ message: "Tầng đang tạm dừng hoạt động" });

    if (String(f.buildingId) !== String(b._id)) {
      return res
        .status(400)
        .json({ message: "floorId không thuộc buildingId đã chọn" });
    }

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // validate inputs
    const numPrice = Number(price);
    if (Number.isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ message: "price phải là số >= 0" });
    }
    const numArea = area != null ? Number(area) : undefined;
    if (numArea != null && Number.isNaN(numArea)) {
      return res.status(400).json({ message: "area phải là số" });
    }
    const numMaxTenants = Math.max(1, Number(maxTenants || 1));
    const allowedStatus = ["available", "rented", "maintenance"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "status không hợp lệ" });
    }

    // Ảnh
    const imageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];

    const doc = await Room.create({
      buildingId,
      floorId,
      roomNumber: String(roomNumber).trim(),
      area: numArea,
      price: numPrice,
      maxTenants: numMaxTenants,
      status,
      description,
      images: imageUrls,
    });
    res.status(201).json(doc);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({
        message: "Trùng số phòng trong tòa (unique {buildingId, roomNumber})",
      });
    }

    console.error("Create room error:", e);
    res.status(500).json({ message: e.message || "Internal Server Error" });
  }
};

const addImages = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(room.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const imageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];
    if (!imageUrls.length)
      return res.status(400).json({ message: "Không có ảnh để thêm" });

    room.images = [...(room.images || []), ...imageUrls];
    await room.save();
    res.json({ message: "Đã thêm ảnh", images: room.images });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const removeImages = async (req, res) => {
  try {
    const { urls = [] } = req.body; // danh sách URL muốn xóa
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: "Cần truyền mảng 'urls' để xóa" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(room.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // Xóa Cloudinary theo public_id
    const publicIds = urls.map((u) => getCloudinaryPublicId(u)).filter(Boolean);

    if (publicIds.length) {
      // Xóa nhiều resource cùng lúc
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: "image",
      });
    }

    // Xóa URL khỏi room.images
    room.images = (room.images || []).filter((u) => !urls.includes(u));
    await room.save();

    res.json({
      message: "Đã xóa ảnh",
      images: room.images,
      deleted: urls.length,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

const remove = async (req, res) => {
  try {
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // Xóa ảnh Cloudinary nếu có
    if (Array.isArray(doc.images) && doc.images.length) {
      const publicIds = doc.images
        .map((u) => getCloudinaryPublicId(u))
        .filter(Boolean);
      if (publicIds.length) {
        await cloudinary.api.delete_resources(publicIds, {
          resource_type: "image",
        });
      }
    }

    await doc.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const update = async (req, res) => {
  try {
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(doc.buildingId).select(
      "landlordId isDeleted status"
    );
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (b.status === "inactive")
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    let {
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
      floorId,
      replaceAllImages,
      removeUrls,
    } = req.body;

    // Chuẩn hóa primitives
    if (price !== undefined) {
      const num = Number(price);
      if (Number.isNaN(num) || num < 0)
        return res.status(400).json({ message: "price phải là số >= 0" });
      doc.price = num;
    }
    if (area !== undefined) {
      const num = Number(area);
      if (Number.isNaN(num))
        return res.status(400).json({ message: "area phải là số" });
      doc.area = num;
    }
    if (maxTenants !== undefined) {
      const num = Math.max(1, Number(maxTenants));
      if (Number.isNaN(num))
        return res.status(400).json({ message: "maxTenants phải là số" });
      doc.maxTenants = num;
    }
    if (status !== undefined) {
      const allowed = ["available", "rented", "maintenance"];
      if (!allowed.includes(status))
        return res.status(400).json({ message: "status không hợp lệ" });
      doc.status = status;
    }
    if (roomNumber !== undefined) doc.roomNumber = String(roomNumber).trim();
    if (description !== undefined) doc.description = description;
    // Chuẩn hóa kiểu dữ liệu
    if (typeof replaceAllImages === "string") {
      replaceAllImages = ["true", "1", "yes", "on"].includes(
        replaceAllImages.toLowerCase()
      );
    }
    if (typeof removeUrls === "string") {
      try {
        removeUrls = JSON.parse(removeUrls);
      } catch {
        // fallback: chuỗi đơn -> mảng 1 phần tử
        removeUrls = [removeUrls];
      }
    }
    if (!Array.isArray(removeUrls)) removeUrls = [];

    // -------- Validate floorId nếu đổi tầng --------
    if (floorId) {
      const f = await Floor.findById(floorId).select(
        "buildingId isDeleted status"
      );
      if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
      if (f.isDeleted)
        return res.status(404).json({ message: "Tầng đã bị xóa" });
      if (f.status === "inactive")
        return res
          .status(403)
          .json({ message: "Tầng đang tạm dừng hoạt động" });
      if (String(f.buildingId) !== String(doc.buildingId)) {
        return res
          .status(400)
          .json({ message: "Tầng mới không thuộc cùng tòa nhà" });
      }
      doc.floorId = floorId;
    }

    // -------- Cập nhật các field primitive --------
    if (roomNumber !== undefined) doc.roomNumber = roomNumber;
    if (area !== undefined) doc.area = area;
    if (price !== undefined) doc.price = price;
    if (maxTenants !== undefined) doc.maxTenants = maxTenants;
    if (status !== undefined) doc.status = status;
    if (description !== undefined) doc.description = description;

    // -------- Ảnh: remove → replaceAll → add --------
    // 1) XÓA ẢNH THEO DANH SÁCH removeUrls
    if (removeUrls.length) {
      const publicIds = removeUrls
        .map((u) => getCloudinaryPublicId(u))
        .filter(Boolean);
      if (publicIds.length) {
        await cloudinary.api.delete_resources(publicIds, {
          resource_type: "image",
        });
      }
      doc.images = (doc.images || []).filter((u) => !removeUrls.includes(u));
    }

    // 2) THAY TOÀN BỘ ẢNH (optional)
    if (replaceAllImages) {
      // Xóa toàn bộ ảnh cũ (nếu có)
      if (Array.isArray(doc.images) && doc.images.length) {
        const publicIds = doc.images
          .map((u) => getCloudinaryPublicId(u))
          .filter(Boolean);
        if (publicIds.length) {
          await cloudinary.api.delete_resources(publicIds, {
            resource_type: "image",
          });
        }
      }
      doc.images = [];
    }

    // 3) THÊM ẢNH MỚI (nếu upload kèm theo)
    if (Array.isArray(req.files) && req.files.length) {
      const newUrls = req.files.map((f) => f.path); // secure_url
      doc.images = [...(doc.images || []), ...newUrls];
    }

    try {
      await doc.save();
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({
          message: "Trùng số phòng trong tòa (unique {buildingId, roomNumber})",
        });
      }
      throw e;
    }
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
const softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;
    const r = await Room.findById(id).select("buildingId isDeleted");
    if (!r || r.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(r.buildingId).select(
      "landlordId isDeleted"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (force === "true" && req.user.role === "admin") {
      await Room.deleteOne({ _id: id });
      return res.json({ message: "Đã xóa vĩnh viễn phòng" });
    }

    await Room.updateOne(
      { _id: id },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    res.json({ message: "Đã xóa mềm phòng" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
const restore = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await Room.findById(id).select("buildingId isDeleted");
    if (!r || !r.isDeleted)
      return res
        .status(404)
        .json({ message: "Không tìm thấy hoặc phòng chưa bị xóa" });

    const b = await Building.findById(r.buildingId).select(
      "landlordId isDeleted status"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (b.status === "inactive")
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });
    if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    await Room.updateOne(
      { _id: id },
      { $set: { isDeleted: false, deletedAt: null } }
    );
    res.json({ message: "Đã khôi phục phòng" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
const updateActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    if (typeof active !== "boolean") {
      return res
        .status(400)
        .json({ message: "Giá trị active phải là boolean" });
    }

    const r = await Room.findById(id).select("buildingId isDeleted");
    if (!r || r.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(r.buildingId).select(
      "landlordId isDeleted"
    );
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (
      req.user.role === "landlord" &&
      String(b.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    await Room.updateOne({ _id: id }, { $set: { active } });
    res.json({ message: "Cập nhật trạng thái hoạt động của phòng thành công" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const quickCreate = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const {
      buildingId,
      floorId,
      floorIds,
      perFloor = 1,
      seqStart = 1,
      roomNumberTemplate = "{floor}{seq:02}",
      templateVars = {},
      defaults = {},
      skipExisting = true,
    } = req.body;

    if (!buildingId)
      return res.status(400).json({ message: "buildingId là bắt buộc" });
    if (!(perFloor > 0))
      return res.status(400).json({ message: "perFloor phải > 0" });

    // 1) Kiểm tra tòa + quyền + trạng thái
    const b = await Building.findById(buildingId)
      .select("landlordId isDeleted status")
      .session(session);
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa" });
    if (b.status === "inactive")
      return res.status(403).json({ message: "Tòa đang tạm dừng hoạt động" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // 2) Lấy danh sách floor hợp lệ trong tòa (cùng session)
    let floors = [];
    if (floorId) {
      const f = await Floor.findById(floorId)
        .select("buildingId isDeleted status level")
        .session(session);
      if (!f || f.isDeleted)
        return res.status(404).json({ message: "Không tìm thấy tầng" });
      if (f.status === "inactive")
        return res
          .status(403)
          .json({ message: "Tầng đang tạm dừng hoạt động" });
      if (String(f.buildingId) !== String(buildingId)) {
        return res
          .status(400)
          .json({ message: "floorId không thuộc buildingId" });
      }
      floors = [f];
    } else if (Array.isArray(floorIds) && floorIds.length) {
      const list = await Floor.find({
        _id: { $in: floorIds },
        buildingId,
        isDeleted: false,
      })
        .select("level status")
        .session(session)
        .lean();
      if (list.length !== floorIds.length) {
        return res
          .status(400)
          .json({ message: "Có floorId không hợp lệ hoặc đã xóa" });
      }
      const inactive = list.find((x) => x.status === "inactive");
      if (inactive)
        return res
          .status(403)
          .json({ message: "Có tầng đang tạm dừng hoạt động" });
      // cần lại _id + level => truy vấn lại đầy đủ
      floors = await Floor.find({ _id: { $in: floorIds }, buildingId }).session(
        session
      );
    } else {
      return res.status(400).json({ message: "Cần floorId hoặc floorIds" });
    }

    // 3) Chuẩn hóa defaults
    const numPrice =
      defaults.price != null ? Number(defaults.price) : undefined;
    if (numPrice != null && (Number.isNaN(numPrice) || numPrice < 0)) {
      return res
        .status(400)
        .json({ message: "defaults.price phải là số >= 0" });
    }
    const numArea = defaults.area != null ? Number(defaults.area) : undefined;
    if (numArea != null && Number.isNaN(numArea)) {
      return res.status(400).json({ message: "defaults.area phải là số" });
    }
    const numMaxTenants =
      defaults.maxTenants != null
        ? Math.max(1, Number(defaults.maxTenants))
        : 1;
    const allowedStatus = ["available", "rented", "maintenance"];
    const initStatus = defaults.status ?? "available";
    if (!allowedStatus.includes(initStatus)) {
      return res.status(400).json({ message: "defaults.status không hợp lệ" });
    }
    const numEStart =
      defaults.eStart != null ? Math.max(0, Number(defaults.eStart)) : 0;
    const numWStart =
      defaults.wStart != null ? Math.max(0, Number(defaults.wStart)) : 0;
    // 4) Lấy các roomNumber đã có trong tòa (để tránh trùng)
    const existRooms = await Room.find({ buildingId, isDeleted: false })
      .select("roomNumber")
      .session(session)
      .lean();
    const existSet = new Set(existRooms.map((x) => x.roomNumber));

    const docs = [];
    const skippedRoomNumbers = [];

    for (const f of floors) {
      for (let i = 0; i < perFloor; i++) {
        const seq = Number(seqStart) + i;
        const roomNumber = renderRoomNumber(roomNumberTemplate, {
          block: templateVars.block,
          floorLevel: f.level,
          seq,
        });

        if (skipExisting && existSet.has(roomNumber)) {
          skippedRoomNumbers.push(roomNumber);
          continue;
        }

        docs.push({
          buildingId,
          floorId: f._id,
          roomNumber,
          area: numArea,
          price: numPrice,
          maxTenants: numMaxTenants,
          status: initStatus,
          description: defaults.description,
          eStart: numEStart,
          wStart: numWStart,
        });

        existSet.add(roomNumber); // tránh trùng trong chính batch
      }
    }

    if (!docs.length) {
      await session.abortTransaction();
      return res.status(409).json({
        message:
          "Tất cả roomNumber yêu cầu đã tồn tại, không có phòng nào được tạo.",
        createdCount: 0,
        skippedCount: skippedRoomNumbers.length,
        skippedRoomNumbers,
        created: [],
      });
    }

    // 5) Tạo hàng loạt trong transaction; ordered:false để commit phần hợp lệ
    let created = [];
    try {
      created = await Room.insertMany(docs, { session, ordered: false });
    } catch (err) {
      // Nếu có duplicate do race-condition, vẫn commit phần hợp lệ
      if (!(err?.code === 11000 || err?.writeErrors)) throw err;
    }

    await session.commitTransaction();
    return res.status(201).json({
      message: "Tạo nhanh phòng thành công.",
      createdCount: created.length,
      skippedCount: skippedRoomNumbers.length,
      skippedRoomNumbers,
      created,
    });
  } catch (e) {
    await session.abortTransaction();
    return res.status(400).json({ message: e.message });
  } finally {
    session.endSession();
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addImages,
  removeImages,
  quickCreate,
  softDelete,
  restore,
  updateActive,
};
