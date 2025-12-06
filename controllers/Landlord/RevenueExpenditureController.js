const RevenueExpenditure = require("../../models/RevenueExpenditures");
const Building = require("../../models/Building");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const create = async (req, res) => {
  try {
    const { buildingId, title, description, type, amount } =
      req.body;
    if (!title)
      return res.status(400).json({ message: "Thiếu title" });
    if (!description)
      return res.status(400).json({ message: "Thiếu description" });
    if (!type)
      return res.status(400).json({ message: "Thiếu type" });
    if (!amount)
      return res.status(400).json({ message: "Thiếu amount" });

    const building = await Building.findOne({
      _id: buildingId,
      isDeleted: false,
    }).select("landlordId");

    if (!building) {
      return res.status(404).json({ message: "Không tìm thấy tòa nhà!" });
    }
    if (
      req.user.role === "staff" &&
      !req.staff.assignedBuildingIds.includes(buildingId)
    ) {
      return res
        .status(403)
        .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
    }
    if (
      req.user.role === "landlord" &&
      String(building.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
    }
    const imageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];
    if (imageUrls.length === 0) {
      return res
        .status(400)
        .json({
          message: "Phải có ít nhất một ảnh làm bằng chứng cho thu chi",
        });
    }
    const record = await RevenueExpenditure.create({
      createBy: req.user._id,
      buildingId,
      landlordId: building.landlordId,
      title,
      description,
      type,
      amount,
      images: imageUrls,
    });

    res.status(201).json({
      message: "Ghi nhận thu chi thành công",
      data: record,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const list = async (req, res) => {
  try {
    const {
      buildingId,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isDeleted: false };

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({
          data: [],
          total: 0,
          page: +page,
          limit: +limit,
        });
      }
      if (!buildingId) {
        filter.buildingId = { $in: req.staff.assignedBuildingIds };
      } else {
        if (!req.staff.assignedBuildingIds.includes(buildingId)) {
          return res
            .status(403)
            .json({ message: "Bạn không được quản lý tòa nhà này" });
        }
      }
    } else if (req.user.role === "landlord") {
      if (!buildingId) {
        filter.landlordId = req.user._id;
      }
    }

    if (buildingId) {
      filter.buildingId = new mongoose.Types.ObjectId(buildingId);
    }

    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.recordedAt = {};
      if (startDate) filter.recordedAt.$gte = new Date(startDate);
      if (endDate) filter.recordedAt.$lte = new Date(endDate);
    }
    const [data, total] = await Promise.all([
      RevenueExpenditure.find(filter)
        .populate({
          path: "createBy",
          select: "email userInfo",
          populate: {
            path: "userInfo",
            model: "UserInformation",
            select: "fullName phoneNumber",
          },
        })
        .populate("buildingId", "name")
        .sort({ recordedAt: -1 })
        .skip((page - 1) * limit)
        .limit(+limit)
        .lean(),
      RevenueExpenditure.countDocuments(filter),
    ]);

    res.json({ data, total, page: +page, limit: +limit });
  } catch (err) {
    console.error("Lỗi list thu chi:", err);
    res.status(500).json({ message: err.message });
  }
};

const getById = async (req, res) => {
  try {
    const record = await RevenueExpenditure.findById(req.params.id)
      .populate({
        path: "createBy",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .populate("buildingId", "name")
      .populate({
        path: "landlordId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      });

    if (!record || record.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy thu chi" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const record = await RevenueExpenditure.findById(req.params.id);
    if (!record || record.isDeleted) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy bản ghi thu chi" });
    }

    if (
      req.user.role === "landlord" &&
      String(record.landlordId) !== String(req.user._id)
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền chỉnh sửa bản ghi này" });
    }
    if (req.user.role === "staff") {
      const building = await Building.findById(record.buildingId).select(
        "landlordId"
      );
      if (!req.staff.assignedBuildingIds.includes(String(record.buildingId))) {
        return res
          .status(403)
          .json({ message: "Bạn không được quản lý tòa nhà này" });
      }
    }

    const allowedFields = [
      "title",
      "description",
      "amount",
      "recordedAt",
      "type",
    ];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        record[field] = req.body[field];
      }
    });
    if (req.body.recordedAt) {
      record.recordedAt = new Date(req.body.recordedAt);
    }

    const currentImages = record.images || [];

    // Nếu có gửi danh sách ảnh muốn xóa (ví dụ: deleteImages=["url1","url2"])
    if (req.body.deleteImages && Array.isArray(req.body.deleteImages)) {
      const deleteSet = new Set(req.body.deleteImages);
      record.images = currentImages.filter((img) => !deleteSet.has(img));
    }

    // Nếu có file mới được upload
    const newImageUrls = Array.isArray(req.files)
      ? req.files.map((f) => f.path)
      : [];

    if (newImageUrls.length > 0) {
      record.images = [...record.images, ...newImageUrls];
    }

    // Bắt buộc luôn có ít nhất 1 ảnh
    if (record.images.length === 0) {
      return res.status(400).json({
        message: "Phải có ít nhất một ảnh làm bằng chứng cho giao dịch thu chi",
      });
    }

    await record.save();

    const populated = await RevenueExpenditure.findById(record._id)
      .populate({
        path: "createBy",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          model: "UserInformation",
          select: "fullName phoneNumber",
        },
      })
      .populate("buildingId", "name");

    res.json({
      message: "Cập nhật thu chi thành công",
      data: populated,
    });
  } catch (err) {
    console.error("Lỗi update thu chi:", err);
    res.status(400).json({ message: err.message });
  }
};

const softDelete = async (req, res) => {
  try {
    const record = await RevenueExpenditure.findById(req.params.id);
    if (!record || record.isDeleted)
      return res.status(404).json({ message: "Không tìm thấy" });

    record.isDeleted = true;
    await record.save();

    res.json({ message: "Đã xóa thu chi" });
  } catch (err) {
    console.error("Lỗi xóa thu chi:", err);
    res.status(500).json({ message: err.message });
  }
};

const stats = async (req, res) => {
  try {
    const { buildingId, year = new Date().getFullYear(), month } = req.query;

    const match = { isDeleted: false };

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({
          revenue: 0,
          expenditure: 0,
          profit: 0,
        });
      }
      if (buildingId) {
        if (!req.staff.assignedBuildingIds.includes(buildingId)) {
          return res
            .status(403)
            .json({ message: "Bạn không được quản lý tòa nhà này" });
        }
        match.buildingId = new mongoose.Types.ObjectId(buildingId);
      } else {
        match.buildingId = {
          $in: req.staff.assignedBuildingIds.map(
            (id) => new mongoose.Types.ObjectId(id)
          ),
        };
      }
    } else if (req.user.role === "landlord") {
      if (buildingId) {
        const building = await Building.findOne({
          _id: buildingId,
          isDeleted: false,
        }).select("landlordId");
        if (!building || String(building.landlordId) !== String(req.user._id)) {
          return res
            .status(403)
            .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
        }
        match.buildingId = new mongoose.Types.ObjectId(buildingId);
      } else {
        match.landlordId = req.user._id;
      }
    }

    if (month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      match.recordedAt = { $gte: start, $lte: end };
    } else {
      match.recordedAt = {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31, 23, 59, 59),
      };
    }

    const result = await RevenueExpenditure.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]);

    const revenue = result.find((r) => r._id === "revenue")?.total || 0;
    const expenditure = result.find((r) => r._id === "expenditure")?.total || 0;

    res.json({
      revenue,
      expenditure,
      profit: revenue - expenditure,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const monthlyComparison = async (req, res) => {
  try {
    const { buildingId, year = new Date().getFullYear() } = req.query;

    const match = {
      isDeleted: false,
      recordedAt: {
        $gte: new Date(year, 0, 1),
        $lte: new Date(year, 11, 31, 23, 59, 59),
      },
    };

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res.json({
          year,
          data: [],
        });
      }
      if (buildingId) {
        if (!req.staff.assignedBuildingIds.includes(buildingId)) {
          return res
            .status(403)
            .json({ message: "Bạn không được quản lý tòa nhà này" });
        }
        match.buildingId = new mongoose.Types.ObjectId(buildingId);
      } else {
        match.buildingId = {
          $in: req.staff.assignedBuildingIds.map(
            (id) => new mongoose.Types.ObjectId(id)
          ),
        };
      }
    } else if (req.user.role === "landlord") {
      if (buildingId) {
        const building = await Building.findOne({
          _id: buildingId,
          isDeleted: false,
        }).select("landlordId");
        if (!building || String(building.landlordId) !== String(req.user._id)) {
          return res
            .status(403)
            .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
        }
        match.buildingId = new mongoose.Types.ObjectId(buildingId);
      } else {
        match.landlordId = req.user._id;
      }
    }

    const result = await RevenueExpenditure.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            month: { $month: "$recordedAt" },
            type: "$type",
          },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const revenue =
        result.find((r) => r._id.month === month && r._id.type === "revenue")
          ?.total || 0;
      const expenditure =
        result.find(
          (r) => r._id.month === month && r._id.type === "expenditure"
        )?.total || 0;
      return {
        month,
        revenue,
        expenditure,
        profit: revenue - expenditure,
      };
    });

    // Thêm so sánh với tháng trước (lên/xuống)
    const comparedData = monthlyData.map((current, index) => {
      if (index === 0) {
        return { ...current, profitChange: 0, profitChangePercent: 0 };
      }
      const previous = monthlyData[index - 1];
      const profitChange = current.profit - previous.profit;
      const profitChangePercent =
        previous.profit !== 0 ? (profitChange / previous.profit) * 100 : 0;
      return {
        ...current,
        profitChange,
        profitChangePercent: profitChangePercent.toFixed(2),
      };
    });

    res.json({
      year,
      data: comparedData,
    });
  } catch (err) {
    console.error("Lỗi so sánh hàng tháng:", err.message);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

const exportExcel = async (req, res) => {
  try {
    const { buildingId, startDate, endDate } = req.query;

    const filter = { isDeleted: false };

    if (req.user.role === "staff") {
      if (!req.staff?.assignedBuildingIds?.length) {
        return res
          .status(403)
          .json({ message: "Bạn chưa được giao quản lý tòa nhà nào" });
      }
      if (buildingId) {
        if (!req.staff.assignedBuildingIds.includes(buildingId)) {
          return res
            .status(403)
            .json({ message: "Bạn không được quản lý tòa nhà này" });
        }
        filter.buildingId = buildingId;
      } else {
        filter.buildingId = { $in: req.staff.assignedBuildingIds };
      }
    } else if (req.user.role === "landlord") {
      if (buildingId) {
        const building = await Building.findOne({
          _id: buildingId,
          isDeleted: false,
        }).select("landlordId");
        if (!building || String(building.landlordId) !== String(req.user._id)) {
          return res
            .status(403)
            .json({ message: "Tòa nhà không thuộc quyền quản lý của bạn!" });
        }
        filter.buildingId = buildingId;
      } else {
        filter.landlordId = req.user._id;
      }
    }

    if (startDate || endDate) {
      filter.recordedAt = {};
      if (startDate) filter.recordedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.recordedAt.$lte = end;
      }
    }

    const data = await RevenueExpenditure.find(filter)
      .populate("buildingId", "name")
      .populate({
        path: "createBy",
        select: "email",
        populate: {
          path: "userInfo",
          select: "fullName",
        },
      })
      .sort({ recordedAt: -1 })
      .lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Thu Chi");

    sheet.columns = [
      { header: "Ngày", key: "date", width: 15 },
      { header: "Tòa nhà", key: "building", width: 25 },
      { header: "Loại", key: "type", width: 10 },
      { header: "Tiêu đề", key: "title", width: 35 },
      { header: "Số tiền", key: "amount", width: 18 },
      { header: "Người ghi", key: "creator", width: 20 },
      { header: "Ghi chú", key: "description", width: 40 },
    ];

    data.forEach((item) => {
      const fullName =
        item.createBy?.userInfo?.fullName ||
        item.createBy?.email ||
        "Không xác định";
      sheet.addRow({
        date: new Date(item.recordedAt).toLocaleDateString("vi-VN"),
        building: item.buildingId?.name || "Không xác định",
        type: item.type === "revenue" ? "Thu" : "Chi",
        title: item.title || "",
        amount: item.amount?.toLocaleString("vi-VN") || 0,
        creator: fullName,
        description: item.description || "",
      });
    });

    const revenueTotal = data
      .filter((d) => d.type === "revenue")
      .reduce((sum, d) => sum + d.amount, 0);
    const expenditureTotal = data
      .filter((d) => d.type === "expenditure")
      .reduce((sum, d) => sum + d.amount, 0);
    sheet.addRow([]);
    sheet.addRow({
      date: "TỔNG THU",
      amount: revenueTotal?.toLocaleString("vi-VN"),
    });
    sheet.addRow({
      date: "TỔNG CHI",
      amount: expenditureTotal?.toLocaleString("vi-VN"),
    });
    sheet.addRow({
      date: "LỢI NHUẬN",
      amount: (revenueTotal - expenditureTotal)?.toLocaleString("vi-VN"),
    });

    const fileName = `thu-chi_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${encodeURIComponent(fileName)}`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Lỗi export Excel thu chi:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Lỗi xuất file Excel" });
    }
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  softDelete,
  stats,
  monthlyComparison,
  exportExcel,
};
