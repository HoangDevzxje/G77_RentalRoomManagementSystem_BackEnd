const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Furniture = require("../../models/Furniture");
const BuildingFurniture = require("../../models/BuildingFurniture");
const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");

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
    const { buildingId, withStats = "true" } = req.query;

    // 1) Nếu chưa chọn tòa: trả danh sách tất cả (không thống kê) để tránh 400
    if (!buildingId) {
      const buildingFilter =
        req.user?.role === "landlord" ? { landlordId: req.user._id } : {};
      const buildings = await Building.find(buildingFilter)
        .select("_id name address description")
        .lean();

      if (!buildings.length) return res.json([]);

      const buildingIds = buildings.map((b) => b._id);

      // có thể bật populate nhẹ
      const list = await BuildingFurniture.find({
        buildingId: { $in: buildingIds },
      })
        .populate("buildingId", "name address description")
        .populate("furnitureId", "name")
        .sort({ createdAt: -1 });

      return res.json(list);
    }

    // 2) Có buildingId: kiểm tra quyền
    const building = await Building.findById(buildingId).lean();
    if (!building)
      return res.status(404).json({ message: "Không tìm thấy tòa" });

    const isOwner =
      req.user?.role === "admin" ||
      (req.user?.role === "landlord" &&
        String(building.landlordId) === String(req.user._id));

    if (!isOwner) {
      return res
        .status(403)
        .json({ message: "Không có quyền truy cập tòa này" });
    }

    if (withStats === "true") {
      const data = await BuildingFurniture.aggregate([
        { $match: { buildingId: new mongoose.Types.ObjectId(buildingId) } },

        // Rooms của tòa (không lọc hết nếu không có isDeleted)
        {
          $lookup: {
            from: "rooms",
            let: { bId: "$buildingId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$buildingId", "$$bId"] },
                  $or: [
                    { isDeleted: { $exists: false } },
                    { isDeleted: false },
                  ],
                },
              },
              { $project: { _id: 1 } },
            ],
            as: "rooms",
          },
        },
        { $addFields: { totalRooms: { $size: "$rooms" } } },

        // RoomFurniture (overrides) trùng furnitureId trong các room của tòa
        {
          $lookup: {
            from: "roomfurnitures", // đảm bảo đúng tên collection
            let: { roomIds: "$rooms._id", fId: "$furnitureId" }, // furnitureId là ObjectId
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ["$roomId", "$$roomIds"] },
                      { $eq: ["$furnitureId", "$$fId"] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, quantity: 1, roomId: 1 } },
            ],
            as: "overrides",
          },
        },

        // TÍNH TOÁN: dùng $reduce để cộng quantity trong overrides
        {
          $set: {
            // số phòng đã tùy chỉnh / theo mặc định
            roomsOverridden: { $size: "$overrides" },
            roomsByDefault: {
              $subtract: ["$totalRooms", { $size: "$overrides" }],
            },

            // Tổng số lượng thực tế = sum(override.quantity) + quantityPerRoom * roomsByDefault
            totalQuantityActual: {
              $add: [
                {
                  $reduce: {
                    input: "$overrides",
                    initialValue: 0,
                    in: {
                      $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }],
                    },
                  },
                },
                {
                  $multiply: [
                    { $ifNull: ["$quantityPerRoom", 0] },
                    {
                      $ifNull: [
                        { $subtract: ["$totalRooms", { $size: "$overrides" }] },
                        0,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },

        // Join tên furniture & building để hiển thị
        {
          $lookup: {
            from: "furnitures",
            localField: "furnitureId",
            foreignField: "_id",
            as: "furniture",
          },
        },
        { $unwind: "$furniture" },
        {
          $lookup: {
            from: "buildings",
            localField: "buildingId",
            foreignField: "_id",
            as: "building",
          },
        },
        { $unwind: "$building" },

        // Output gọn + (tạm expose sumOverrideQty để bạn kiểm tra)
        {
          $project: {
            _id: 1,
            buildingId: 1,
            furnitureId: 1,
            quantityPerRoom: 1,
            status: 1,
            notes: 1,
            createdAt: 1,
            updatedAt: 1,

            "building.name": 1,
            "building.address": 1,
            "building.description": 1,
            "furniture.name": 1,

            totalRooms: 1,
            roomsOverridden: 1,
            roomsByDefault: 1,
            sumOverrideQty: 1, // ← giúp debug, OK rồi có thể bỏ
            totalQuantityActual: 1,
          },
        },
        { $sort: { createdAt: -1 } },
      ]);

      return res.json(data);
    }

    // 4) Không withStats: find + populate (nhẹ)
    const list = await BuildingFurniture.find({ buildingId })
      .populate("buildingId", "name address description")
      .populate("furnitureId", "name")
      .sort({ createdAt: -1 });

    return res.json(list);
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
