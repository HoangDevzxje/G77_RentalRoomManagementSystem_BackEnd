const mongoose = require("mongoose");
const Building = require("../../models/Building");
const Room = require("../../models/Room");
const Contract = require("../../models/Contract");
const Post = require("../../models/Post");
const Contact = require("../../models/Contact");

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

function parseMonthRange(monthStr) {
  // monthStr: "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0); // next month
  return { start, end };
}

function lastNMonthsRange(n = 6) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
  return { start, end: new Date(end.getFullYear(), end.getMonth() + 1, 1) };
}

// GET /landlords/dashboard/overview?buildingId=...
exports.getOverview = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { buildingId } = req.query;

    const buildingMatch = { landlordId, isDeleted: false };
    if (buildingId) buildingMatch._id = buildingId;

    const buildings = await Building.find(buildingMatch)
      .select("_id name")
      .lean();
    if (!buildings.length) return res.json({ success: true, data: [] });

    const buildingIds = buildings.map((b) => b._id);

    // Rooms stats
    const roomAgg = await Room.aggregate([
      { $match: { buildingId: { $in: buildingIds }, isDeleted: false } },
      {
        $group: {
          _id: { buildingId: "$buildingId", status: "$status" },
          rooms: { $sum: 1 },
          people: { $sum: { $size: { $ifNull: ["$currentTenantIds", []] } } },
        },
      },
    ]);

    // Active contracts stats (completed + moveInConfirmedAt exists + within date range)
    const now = new Date();
    const contractAgg = await Contract.aggregate([
      {
        $match: {
          landlordId,
          buildingId: { $in: buildingIds },
          isDeleted: false,
          status: "completed",
          moveInConfirmedAt: { $exists: true },
          "contract.startDate": { $lte: now },
          "contract.endDate": { $gte: now },
        },
      },
      { $group: { _id: "$buildingId", activeContracts: { $sum: 1 } } },
    ]);

    const map = new Map(
      buildingIds.map((id) => [
        String(id),
        {
          totalPeople: 0,
          totalRoomsAvailable: 0,
          totalRoomsRented: 0,
          activeContracts: 0,
        },
      ])
    );

    for (const row of roomAgg) {
      const bid = String(row._id.buildingId);
      const status = row._id.status; // "available" | "rented"
      const cur = map.get(bid);
      if (!cur) continue;

      if (status === "available") cur.totalRoomsAvailable += row.rooms;
      if (status === "rented") {
        cur.totalRoomsRented += row.rooms;
        cur.totalPeople += row.people; // chỉ cộng người ở phòng rented (đúng kỳ vọng)
      }
    }

    for (const row of contractAgg) {
      const bid = String(row._id);
      const cur = map.get(bid);
      if (cur) cur.activeContracts = row.activeContracts;
    }

    const data = buildings.map((b) => ({
      buildingId: b._id,
      buildingName: b.name,
      ...map.get(String(b._id)),
    }));

    res.json({ success: true, data });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: e.message || "Server error" });
  }
};

// GET /landlords/dashboard/activity?buildingId=...&month=YYYY-MM
exports.getActivity = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { buildingId, month } = req.query;

    const matchBuilding = {};
    if (buildingId) matchBuilding.buildingId = toObjectId(buildingId);

    const range = month ? parseMonthRange(month) : lastNMonthsRange(6);

    const postMatch = {
      landlordId: toObjectId(landlordId),
      isDeleted: false,
      isDraft: false,
      status: "active",
      createdAt: { $gte: range.start, $lt: range.end },
      ...matchBuilding,
    };

    const contactMatch = {
      landlordId: toObjectId(landlordId),
      isDeleted: false,
      status: { $in: ["pending", "accepted"] },
      createdAt: { $gte: range.start, $lt: range.end },
      ...matchBuilding,
    };

    // group by month (YYYY-MM)
    const [posts, contacts] = await Promise.all([
      Post.aggregate([
        { $match: postMatch },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
      Contact.aggregate([
        { $match: contactMatch },
        {
          $group: {
            _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // normalize to labels
    const toKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
    const postMap = new Map(
      posts.map((r) => [toKey(r._id.y, r._id.m), r.count])
    );
    const contactMap = new Map(
      contacts.map((r) => [toKey(r._id.y, r._id.m), r.count])
    );

    // build labels
    const labels = [];
    const cursor = new Date(
      range.start.getFullYear(),
      range.start.getMonth(),
      1
    );
    const end = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor < end) {
      labels.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(
          2,
          "0"
        )}`
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.json({
      success: true,
      data: {
        range: { start: range.start, end: range.end, month: month || null },
        labels,
        series: {
          postsActive: labels.map((k) => postMap.get(k) || 0),
          contactsActive: labels.map((k) => contactMap.get(k) || 0),
        },
      },
    });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: e.message || "Server error" });
  }
};
