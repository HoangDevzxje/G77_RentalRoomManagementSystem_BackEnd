const mongoose = require("mongoose");
const Building = require("../models/Building");
const Furniture = require("../models/Furniture");
const BuildingFurniture = require("../models/BuildingFurniture");
const Room = require("../models/Room");

// Tạo mới
exports.create = async (req, res) => {
  try {
    const data = await BuildingFurniture.create(req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Tạo nhiều với kiểm tra & tùy chọn
exports.bulkCreate = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { buildingId, items, dryRun = false, mode = "create" } = req.body;

    if (!buildingId)
      return res.status(400).json({ message: "buildingId là bắt buộc" });
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "items phải là mảng và không rỗng" });
    }
    if (!["create", "upsert"].includes(mode)) {
      return res
        .status(400)
        .json({ message: "mode phải là 'create' hoặc 'upsert'" });
    }

    // 1) Validate building + quyền
    const b = await Building.findById(buildingId).lean();
    if (!b) return res.status(404).json({ message: "Không tìm thấy tòa" });
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "landlord" &&
        String(b.landlordId) === String(req.user._id));
    if (!isOwner)
      return res.status(403).json({ message: "Không có quyền với tòa này" });

    // 2) Chuẩn hóa input & phát hiện trùng trong payload
    const normalized = items.map((it, idx) => ({
      idx,
      furnitureId: it.furnitureId,
      quantityPerRoom: Number.isFinite(+it.quantityPerRoom)
        ? +it.quantityPerRoom
        : 1,
      totalQuantity: Number.isFinite(+it.totalQuantity) ? +it.totalQuantity : 0,
      status: it.status || "active",
      notes: it.notes || "",
    }));

    // duplicates trong payload theo furnitureId
    const seen = new Set();
    const duplicateInPayload = [];
    for (const it of normalized) {
      if (seen.has(String(it.furnitureId)))
        duplicateInPayload.push(it.furnitureId);
      seen.add(String(it.furnitureId));
    }

    // 3) Kiểm tra furnitureId tồn tại
    const furnitureIds = [...new Set(normalized.map((x) => x.furnitureId))];
    const furns = await Furniture.find({ _id: { $in: furnitureIds } })
      .select("_id")
      .lean();
    const existFurnSet = new Set(furns.map((f) => String(f._id)));
    const invalidFurnitureIds = furnitureIds.filter(
      (id) => !existFurnSet.has(String(id))
    );

    // 4) Kiểm tra cái đã tồn tại trong tòa
    const existPairs = await BuildingFurniture.find({
      buildingId,
      furnitureId: {
        $in: furnitureIds.filter((id) => existFurnSet.has(String(id))),
      },
    })
      .select("furnitureId")
      .lean();
    const existSet = new Set(existPairs.map((x) => String(x.furnitureId)));

    // 5) Phân loại insert / update / skip
    const toInsert = [];
    const toUpdate = [];
    const skippedExisting = []; // đã có & mode=create thì bỏ qua

    for (const it of normalized) {
      if (!existFurnSet.has(String(it.furnitureId))) continue; // bỏ qua vì invalid
      if (existSet.has(String(it.furnitureId))) {
        if (mode === "upsert") {
          toUpdate.push(it);
        } else {
          skippedExisting.push(it.furnitureId);
        }
      } else {
        toInsert.push({
          buildingId,
          furnitureId: it.furnitureId,
          quantityPerRoom: Math.max(0, it.quantityPerRoom),
          totalQuantity: Math.max(0, it.totalQuantity),
          status: it.status,
          notes: it.notes,
        });
      }
    }

    // 6) Dry-run preview
    if (dryRun) {
      await session.abortTransaction();
      return res.status(200).json({
        dryRun: true,
        mode,
        summary: {
          willInsert: toInsert.length,
          willUpdate: toUpdate.length,
          skippedExisting: mode === "create" ? skippedExisting.length : 0,
          invalidFurnitureIds: invalidFurnitureIds.length,
          duplicateInPayload: duplicateInPayload.length,
        },
        details: {
          toInsert,
          toUpdateFurnitureIds: toUpdate.map((x) => x.furnitureId),
          skippedExisting,
          invalidFurnitureIds,
          duplicateInPayload,
        },
      });
    }

    // 7) Thực thi
    let created = [];
    if (toInsert.length) {
      // ordered:false để không fail cả batch nếu có race-condition trùng key
      created = await BuildingFurniture.insertMany(toInsert, {
        session,
        ordered: false,
      });
    }

    let updatedCount = 0;
    if (toUpdate.length) {
      const bulkOps = toUpdate.map((it) => ({
        updateOne: {
          filter: { buildingId, furnitureId: it.furnitureId },
          update: {
            $set: {
              quantityPerRoom: Math.max(0, it.quantityPerRoom),
              totalQuantity: Math.max(0, it.totalQuantity),
              status: it.status,
              notes: it.notes,
            },
          },
        },
      }));
      const r = await BuildingFurniture.bulkWrite(bulkOps, {
        session,
        ordered: false,
      });
      updatedCount = r.modifiedCount || 0;
    }

    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      mode,
      createdCount: created.length,
      updatedCount,
      skippedExistingCount: skippedExisting.length,
      invalidFurnitureIds,
      duplicateInPayload,
      created,
    });
  } catch (err) {
    await session.abortTransaction();
    // duplicate key trong trường hợp race-condition
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "Một số nội thất đã tồn tại trong tòa (duplicate key).",
        error: err.message,
      });
    }
    return res.status(400).json({ message: err.message });
  } finally {
    session.endSession();
  }
};

// Lấy danh sách theo tòa
exports.getAll = async (req, res) => {
  try {
    const { buildingId } = req.query;
    const filter = buildingId ? { buildingId } : {};
    const list = await BuildingFurniture.find(filter).populate(
      "buildingId furnitureId"
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Lấy 1
exports.getOne = async (req, res) => {
  try {
    const item = await BuildingFurniture.findById(req.params.id).populate(
      "buildingId furnitureId"
    );
    if (!item) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Cập nhật
exports.update = async (req, res) => {
  try {
    const updated = await BuildingFurniture.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Xóa
exports.remove = async (req, res) => {
  try {
    await BuildingFurniture.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa thành công" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * Áp dụng cấu hình nội thất của tòa cho phòng
 *
 * Body:
 * {
 *   "furnitureIds": ["...","..."],   // optional - nếu bỏ trống sẽ lấy tất cả cấu hình nội thất ACTIVE của tòa
 *   "roomIds": ["...","..."],        // optional - nếu bỏ trống sẽ áp cho tất cả phòng trong tòa (hoặc theo floorIds)
 *   "floorIds": ["...","..."],       // optional - lọc phòng theo tầng
 *   "mode": "set" | "increment",     // default "set"
 *   "overrideQty": 2,                // optional - nếu có sẽ dùng thay vì quantityPerRoom trong BuildingFurniture
 *   "dryRun": false                  // optional - chỉ preview, không ghi DB
 * }
 */
exports.applyToRooms = async (req, res) => {
  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    const { buildingId } = req.params;
    const {
      furnitureIds = [],
      roomIds = [],
      floorIds = [],
      mode = "set",
      overrideQty = null,
      dryRun = false,
    } = req.body;

    if (!["set", "increment"].includes(mode)) {
      return res
        .status(400)
        .json({ message: "mode phải là 'set' hoặc 'increment'" });
    }

    //Lấy cấu hình nội thất ở tòa
    const invFilter = { buildingId, status: "active" };
    if (Array.isArray(furnitureIds) && furnitureIds.length) {
      invFilter.furnitureId = { $in: furnitureIds };
    }
    const buildingInvs = await BuildingFurniture.find(invFilter).lean();
    if (!buildingInvs.length) {
      return res
        .status(400)
        .json({ message: "Không có cấu hình nội thất ACTIVE trong tòa để áp" });
    }

    //Lấy danh sách phòng mục tiêu
    const roomFilter = { buildingId };
    if (Array.isArray(roomIds) && roomIds.length)
      roomFilter._id = { $in: roomIds };
    if (Array.isArray(floorIds) && floorIds.length)
      roomFilter.floorId = { $in: floorIds };
    const rooms = await Room.find(roomFilter).select("_id buildingId").lean();
    if (!rooms.length)
      return res.status(400).json({ message: "Không có phòng để áp" });

    //Lập bulkWrite ops cho RoomFurniture
    const ops = [];
    for (const r of rooms) {
      for (const inv of buildingInvs) {
        const qty = overrideQty ?? inv.quantityPerRoom ?? 0;
        if (qty < 0) continue;

        if (mode === "set") {
          // Ghi đè quantity = qty (nếu chưa có thì upsert)
          ops.push({
            updateOne: {
              filter: { roomId: r._id, furnitureId: inv.furnitureId },
              update: {
                $set: { quantity: qty },
                $setOnInsert: {
                  buildingId: r.buildingId,
                  roomId: r._id,
                  furnitureId: inv.furnitureId,
                  condition: "good",
                },
              },
              upsert: true,
            },
          });
        } else {
          // increment: cộng dồn số lượng
          ops.push({
            updateOne: {
              filter: { roomId: r._id, furnitureId: inv.furnitureId },
              update: {
                $inc: { quantity: qty },
                $setOnInsert: {
                  buildingId: r.buildingId,
                  roomId: r._id,
                  furnitureId: inv.furnitureId,
                  quantity: 0, // để $inc hoạt động khi upsert
                  condition: "good",
                },
              },
              upsert: true,
            },
          });
        }
      }
    }

    if (!ops.length) {
      await session.abortTransaction();
      return res
        .status(200)
        .json({ message: "Không có thay đổi nào cần áp.", affected: 0 });
    }

    if (dryRun) {
      await session.abortTransaction();
      return res.status(200).json({
        dryRun: true,
        preview: {
          totalRooms: rooms.length,
          totalItems: buildingInvs.length,
          operations: ops.length,
          mode,
          overrideQty,
        },
      });
    }

    //Thực thi
    const result = await RoomFurniture.bulkWrite(ops, {
      session,
      ordered: false,
    });
    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      mode,
      overrideQty,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
      upserted:
        (result.upsertedIds && Object.keys(result.upsertedIds).length) || 0,
      totalOps: ops.length,
    });
  } catch (e) {
    await session.abortTransaction();
    return res.status(400).json({ message: e.message });
  } finally {
    session.endSession();
  }
};
