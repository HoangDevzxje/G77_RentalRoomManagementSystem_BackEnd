const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Floor = require("../../models/Floor");
const Room = require("../../models/Room");
const { cloudinary } = require("../../configs/cloudinary");
const renderRoomNumber = require("../../utils/renderRoomNumber");
const Contract = require("../../models/Contract");

function getCloudinaryPublicId(url) {
  try {
    const u = new URL(url);
    const afterUpload = u.pathname.split("/upload/")[1];
    if (!afterUpload) return null;
    const noVersion = afterUpload.replace(/^v\d+\//, "");
    return noVersion.replace(/\.[^/.]+$/, "");
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

    const pageNum = Math.max(+page || 1, 1);
    const limitNum = Math.max(+limit || 20, 1);

    const buildingFilter = {
      isDeleted: false,
      status: "active",
      ...(buildingId ? { _id: buildingId } : {}),
    };
    if (req.user.role === "landlord" && !buildingId) {
      buildingFilter.landlordId = req.user._id;
    }
    const validBuildingIds = await Building.find(buildingFilter).distinct(
      "_id"
    );
    if (!validBuildingIds.length) {
      return res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
    }

    const floorFilter = {
      buildingId: { $in: validBuildingIds },
      isDeleted: false,
      status: "active",
      ...(floorId ? { _id: floorId } : {}),
    };
    const validFloorIds = await Floor.find(floorFilter).distinct("_id");
    if (!validFloorIds.length) {
      return res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
    }

    const roomFilter = {
      floorId: { $in: validFloorIds },
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(q ? { roomNumber: { $regex: q, $options: "i" } } : {}),
      ...(onlyActive === "true" ? { active: true } : {}),
    };

    const [rows, total] = await Promise.all([
      Room.find(roomFilter)
        .populate("buildingId", "name address status isDeleted")
        .populate("floorId", "floorNumber level status isDeleted")
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Room.countDocuments(roomFilter),
    ]);

    res.json({ data: rows, total, page: pageNum, limit: limitNum });
  } catch (e) {
    res.status(500).json({ message: e.message || "Server error" });
  }
};

const getById = async (req, res) => {
  try {
    const r = await Room.findById(req.params.id)
      .populate(
        "buildingId",
        "name address status isDeleted landlordId ePrice wPrice eIndexType wIndexType"
      )
      .populate("floorId", "floorNumber level status isDeleted")
      .lean();

    if (!r || r.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    if (
      req.user.role === "landlord" &&
      String(r.buildingId?.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const b = r.buildingId;
    const f = r.floorId;
    if (!b || b.isDeleted || b.status !== "active") {
      return res.status(410).json({ message: "Tòa không còn hoạt động" });
    }
    if (!f || f.isDeleted || f.status !== "active") {
      return res.status(410).json({ message: "Tầng không còn hoạt động" });
    }

    res.json(r);
  } catch (e) {
    res.status(500).json({ message: e.message || "Server error" });
  }
};

const create = async (req, res) => {
  try {
    let roomData;
    if (req.body.data) {
      roomData = JSON.parse(req.body.data);
    } else {
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
      req.user.role === "staff" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });
    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds.includes(String(buildingId))) {
        return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }
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
      req.user.role === "staff" ||
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
    const { urls = [] } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ message: "Cần truyền mảng 'urls' để xóa" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    const b = await Building.findById(room.buildingId);
    const isOwner =
      req.user.role === "staff" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

    const publicIds = urls.map((u) => getCloudinaryPublicId(u)).filter(Boolean);

    if (publicIds.length) {
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: "image",
      });
    }

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
    res.json({ success: true, message: "Đã xoá phòng" });
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
      req.user.role === "staff" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    if (b.status === "inactive")
      return res
        .status(403)
        .json({ message: "Tòa nhà đang tạm dừng hoạt động" });

    let updateData;
    if (req.body && req.body.data) {
      updateData = JSON.parse(req.body.data);
    } else {
      updateData = req.body || {};
    }

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
    } = updateData;

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
    if (typeof replaceAllImages === "string") {
      replaceAllImages = ["true", "1", "yes", "on"].includes(
        replaceAllImages.toLowerCase()
      );
    }
    if (typeof removeUrls === "string") {
      try {
        removeUrls = JSON.parse(removeUrls);
      } catch {
        removeUrls = [removeUrls];
      }
    }
    if (!Array.isArray(removeUrls)) removeUrls = [];

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

    if (roomNumber !== undefined) doc.roomNumber = roomNumber;
    if (area !== undefined) doc.area = area;
    if (price !== undefined) doc.price = price;
    if (maxTenants !== undefined) doc.maxTenants = maxTenants;
    if (status !== undefined) doc.status = status;
    if (description !== undefined) doc.description = description;

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

    if (replaceAllImages) {
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

    if (Array.isArray(req.files) && req.files.length) {
      const newUrls = req.files.map((f) => f.path);
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
    if (!id) return res.status(400).json({ message: 'Thiếu id' });
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

    const room = await Room.findById(id).select(
      "_id buildingId floorId isDeleted active"
    );
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const building = await Building.findById(room.buildingId).select(
      "_id landlordId status isDeleted"
    );
    if (!building || building.isDeleted) {
      return res.status(404).json({ message: "Tòa nhà không tồn tại" });
    }
    const floor = await Floor.findById(room.floorId).select(
      "_id status isDeleted"
    );
    if (!floor || floor.isDeleted) {
      return res.status(404).json({ message: "Tầng không tồn tại" });
    }

    if (
      req.user.role === "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    if (room.active === active) {
      return res.json({ message: "Trạng thái không thay đổi" });
    }

    if (active === true) {
      if (building.status !== "active") {
        return res.status(400).json({
          message: "Không thể mở phòng khi tòa nhà đang ngưng hoạt động",
        });
      }

      if (floor.status !== "active") {
        return res.status(400).json({
          message: "Không thể mở phòng khi tầng đang ngưng hoạt động",
        });
      }
    }

    if (active === false) {
      const now = new Date();

      const hasActiveContract = await Contract.exists({
        roomId: room._id,
        status: "completed",
        isDeleted: false,
        "contract.startDate": { $lte: now },
        "contract.endDate": { $gte: now },
      });

      if (hasActiveContract) {
        return res.status(400).json({
          message:
            "Không thể ngưng phòng vì đang có hợp đồng thuê còn hiệu lực",
        });
      }
    }

    await Room.updateOne(
      { _id: room._id },
      { $set: { active } }
    );

    res.json({
      message: active
        ? "Mở hoạt động phòng thành công"
        : "Ngưng hoạt động phòng thành công",
    });
  } catch (err) {
    console.error("[updateRoomActive]", err);
    res.status(500).json({ message: "Lỗi hệ thống" });
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
    req.body.buildingId = buildingId;
    if (!buildingId)
      return res.status(400).json({ message: "buildingId là bắt buộc" });
    if (!(perFloor > 0))
      return res.status(400).json({ message: "perFloor phải > 0" });

    const b = await Building.findById(buildingId)
      .select("landlordId isDeleted status")
      .session(session);
    if (!b || b.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy tòa" });
    if (b.status === "inactive")
      return res.status(403).json({ message: "Tòa đang tạm dừng hoạt động" });

    const isOwner =
      req.user.role === "admin" ||
      req.user.role === "staff" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner) return res.status(403).json({ message: "Không có quyền" });

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
      floors = await Floor.find({ _id: { $in: floorIds }, buildingId }).session(
        session
      );
    } else {
      return res.status(400).json({ message: "Cần floorId hoặc floorIds" });
    }

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

        existSet.add(roomNumber);
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

    let created = [];
    try {
      created = await Room.insertMany(docs, { session, ordered: false });
    } catch (err) {
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
