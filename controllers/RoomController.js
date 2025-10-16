const mongoose = require("mongoose");
const Building = require("../models/Building");
const Floor = require("../models/Floor");
const Room = require("../models/Room");
const { cloudinary } = require("../configs/cloudinary");

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
    const { buildingId, floorId, status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (buildingId) filter.buildingId = buildingId;
    if (floorId) filter.floorId = floorId;
    if (status) filter.status = status;
    if (q) filter.roomNumber = { $regex: q, $options: "i" };

    if (req.user.role === "landlord") {
      const blds = await Building.find({ landlordId: req.user._id }).select(
        "_id"
      );
      const ids = blds.map((b) => b._id);
      filter.buildingId = filter.buildingId || { $in: ids };
    }

    const data = await Room.find(filter)
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
    const doc = await Room.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
// ----------------- CREATE (có upload) -----------------
const create = async (req, res) => {
  try {
    const {
      buildingId,
      floorId,
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
    } = req.body;

    const [b, f] = await Promise.all([
      Building.findById(buildingId),
      Floor.findById(floorId),
    ]);
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa nhà" });
    if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
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

    // Lấy URL ảnh từ Cloudinary (secure_url nằm ở file.path)
    const imageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path) // secure_url
      : [];

    const doc = await Room.create({
      buildingId,
      floorId,
      roomNumber,
      area,
      price,
      maxTenants,
      status,
      description,
      images: imageUrls,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// ----------------- ADD IMAGES -----------------
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

// ----------------- REMOVE IMAGES -----------------
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

// ----------------- REMOVE ROOM (xóa luôn ảnh) -----------------
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

    const b = await Building.findById(doc.buildingId);
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // -------- Parse body (multipart + fields) --------
    // removeUrls có thể là JSON string nếu client gửi form-data
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
      const f = await Floor.findById(floorId);
      if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
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

    await doc.save();
    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// helper render template
function renderRoomNumber(tpl, { block, floorLevel, seq }) {
  // hỗ trợ {block} {floor} {seq} {seq:02}
  let out = tpl.replace("{block}", block ?? "");
  out = out.replace("{floor}", floorLevel != null ? String(floorLevel) : "");
  // padding cho seq
  out = out.replace(/\{seq(?::(\d+))?\}/g, (_m, p1) => {
    const pad = p1 ? parseInt(p1, 10) : 0;
    let s = String(seq);
    return pad ? s.padStart(pad, "0") : s;
  });
  return out;
}

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
    if (perFloor <= 0)
      return res.status(400).json({ message: "perFloor phải > 0" });

    const b = await Building.findById(buildingId);
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa" });

    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    // Lấy danh sách floors
    let floors = [];
    if (floorId) {
      const f = await Floor.findById(floorId);
      if (!f) return res.status(404).json({ message: "Không tìm thấy tầng" });
      if (String(f.buildingId) !== String(buildingId))
        return res
          .status(400)
          .json({ message: "floorId không thuộc buildingId" });
      floors = [f];
    } else if (Array.isArray(floorIds) && floorIds.length) {
      floors = await Floor.find({ _id: { $in: floorIds }, buildingId });
      if (floors.length !== floorIds.length)
        return res.status(400).json({ message: "Có floorId không hợp lệ" });
    } else {
      return res.status(400).json({ message: "Cần floorId hoặc floorIds" });
    }

    // Set roomNumber đã có (theo tòa)
    const existRooms = await Room.find({ buildingId })
      .select("roomNumber")
      .lean();
    const existSet = new Set(existRooms.map((x) => x.roomNumber));

    const docs = [];
    const skippedRoomNumbers = [];

    for (const f of floors) {
      for (let i = 0; i < perFloor; i++) {
        const seq = seqStart + i;
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
          area: defaults.area ?? undefined,
          price: defaults.price ?? undefined,
          maxTenants: defaults.maxTenants ?? 1,
          status: defaults.status ?? "available",
          description: defaults.description,
        });

        // thêm ngay vào set để tránh trùng trong chính request này
        existSet.add(roomNumber);
      }
    }

    // Không có gì để tạo
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

    // Tạo hàng loạt; ordered:false để không fail cả batch nếu trùng race-condition
    let created = [];
    try {
      created = await Room.insertMany(docs, { session, ordered: false });
    } catch (err) {
      // Nếu có duplicate do race-condition, vẫn commit các bản ghi hợp lệ
      // err.writeErrors có thể chứa thông tin từng dòng lỗi
      if (err.code !== 11000 && !err.writeErrors) throw err;
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
};
