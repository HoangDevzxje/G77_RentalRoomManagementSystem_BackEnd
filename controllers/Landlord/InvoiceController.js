const Invoice = require("../../models/Invoice");
const UtilityReading = require("../../models/UtilityReading");
const Room = require("../../models/Room");
const Contract = require("../../models/Contract");
const Building = require("../../models/Building");
const BuildingService = require("../../models/BuildingService");
const RevenueExpenditure = require("../../models/RevenueExpenditures");
const sendEmail = require("../../utils/sendMail");

function getPeriodRange(periodMonth, periodYear) {
  const start = new Date(periodYear, periodMonth - 1, 1, 0, 0, 0, 0);
  const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
  return { start, end };
}

async function findActiveContractForRoom(roomId, { periodMonth, periodYear }) {
  const { start, end } = getPeriodRange(periodMonth, periodYear);

  const contract = await Contract.findOne({
    roomId,
    status: "completed",
    "contract.startDate": { $lte: end },
    $or: [
      { "contract.endDate": { $gte: start } },
      { "contract.endDate": null },
    ],
    isDeleted: false,
  })
    .sort({ "contract.startDate": -1 })
    .lean();

  return contract;
}

async function sendInvoiceEmailCore(invoiceId, landlordId) {
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    landlordId,
    isDeleted: false,
  })
    .populate({
      path: "tenantId",
      select: "email userInfo",
      populate: { path: "userInfo", select: "fullName" },
    })
    .populate("roomId", "roomNumber")
    .populate("buildingId", "name address")
    .lean();

  if (!invoice) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  if (["paid", "cancelled"].includes(invoice.status)) {
    return {
      skipped: true,
      reason: `Không thể gửi email cho hóa đơn ở trạng thái ${invoice.status}`,
    };
  }

  const tenant = invoice.tenantId;
  if (!tenant || !tenant.email) {
    throw new Error(
      "Người thuê chưa có email, không thể gửi hóa đơn qua email"
    );
  }

  const to = tenant.email;
  const subject = `Hóa đơn tiền phòng - ${invoice.invoiceNumber}`;
  const roomNumber = invoice.roomId?.roomNumber || "";
  const buildingName = invoice.buildingId?.name || "";
  const total = invoice.totalAmount || 0;
  const due = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("vi-VN")
    : "N/A";

  let html = `<p>Chào ${
    tenant.userInfo?.fullName || "Anh/Chị"
  },</p><p>Chủ trọ đã gửi hóa đơn tiền phòng cho bạn.</p>`;
  html += `<p><b>Tòa nhà:</b> ${buildingName}</p>`;
  html += `<p><b>Phòng:</b> ${roomNumber}</p>`;
  html += `<p><b>Số hóa đơn:</b> ${invoice.invoiceNumber}</p>`;
  html += `<p><b>Kỳ:</b> ${invoice.periodMonth}/${invoice.periodYear}</p>`;
  html += `<p><b>Hạn thanh toán:</b> ${due}</p>`;
  html += `<p><b>Tổng tiền:</b> ${total.toLocaleString("vi-VN")} VND</p>`;

  if (Array.isArray(invoice.items) && invoice.items.length > 0) {
    html += "<p><b>Chi tiết:</b></p><ul>";
    for (const item of invoice.items) {
      const label = item.label || item.type || "Khoản thu";
      const q = item.quantity || 1;
      const price = item.unitPrice || 0;
      const amount = item.amount || 0;
      html += `<li>${label}: ${q} x ${price.toLocaleString(
        "vi-VN"
      )} = ${amount.toLocaleString("vi-VN")} VND</li>`;
    }
    html += "</ul>";
  }

  html += "<p>Vui lòng thanh toán đúng hạn. Xin cảm ơn!</p>";

  const text = html.replace(/<[^>]+>/g, " ");

  const emailResult = await sendEmail({
    email: to,
    subject,
    html,
    text,
  });

  const update = {
    $set: {
      emailStatus: emailResult ? "sent" : "failed",
      emailSentAt: new Date(),
    },
  };

  const updatedInvoice = await Invoice.findByIdAndUpdate(invoiceId, update, {
    new: true,
  });

  return {
    invoice: updatedInvoice,
    update: {
      status: updatedInvoice.status,
      emailStatus: updatedInvoice.emailStatus,
    },
  };
}
async function ensureRevenueLogForInvoicePaid(invoice, { actorId } = {}) {
  try {
    if (!invoice) return;

    // Chỉ log cho hóa đơn đã thanh toán và còn hiệu lực
    if (invoice.isDeleted) return;
    if (invoice.status !== "paid") return;

    // Tránh tạo trùng nếu đã có log cho hóa đơn này
    const existed = await RevenueExpenditure.findOne({
      invoiceId: invoice._id,
      isDeleted: false,
    }).lean();

    if (existed) {
      return existed;
    }

    // Nếu không có buildingId/landlordId thì thôi (không tạo log)
    if (!invoice.buildingId || !invoice.landlordId) return;

    const amount = Number(invoice.totalAmount) || 0;
    if (amount <= 0) return;

    const title = `Thu tiền hóa đơn ${
      invoice.invoiceNumber || String(invoice._id)
    }`;

    const descParts = [];
    if (invoice.roomSnapshot?.roomNumber) {
      descParts.push(`Phòng: ${invoice.roomSnapshot.roomNumber}`);
    }
    if (invoice.periodMonth && invoice.periodYear) {
      descParts.push(`Kỳ: ${invoice.periodMonth}/${invoice.periodYear}`);
    }
    descParts.push(`InvoiceId: ${invoice._id.toString()}`);

    const description = descParts.join(" | ");

    const record = await RevenueExpenditure.create({
      createBy: actorId || invoice.landlordId,
      landlordId: invoice.landlordId,
      buildingId: invoice.buildingId,
      invoiceId: invoice._id,
      title,
      description,
      type: "revenue",
      amount,
      recordedAt: invoice.paidAt || new Date(),
      images: [], // auto log từ hóa đơn -> không cần ảnh
    });

    return record;
  } catch (err) {
    console.error("ensureRevenueLogForInvoicePaid error:", err);
    // Không throw để tránh làm fail API thanh toán
    return null;
  }
}

// POST /landlords/invoices/generate-monthly
// body: { roomId, periodMonth, periodYear, includeRent?, extraItems? }
exports.generateMonthlyInvoice = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      roomId,
      periodMonth,
      periodYear,
      includeRent = true,
      extraItems = [],
    } = req.body || {};

    if (!roomId || !periodMonth || !periodYear) {
      return res.status(400).json({
        message: "Thiếu roomId hoặc periodMonth/periodYear",
      });
    }

    const month = Number(periodMonth);
    const year = Number(periodYear);
    if (
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      month < 1 ||
      month > 12 ||
      year < 2000
    ) {
      return res
        .status(400)
        .json({ message: "periodMonth/periodYear không hợp lệ" });
    }

    // 1. Kiểm tra phòng + quyền landlord
    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId ePrice wPrice status isDeleted")
      .lean();
    if (!building || String(building.landlordId) !== String(landlordId)) {
      return res.status(403).json({ message: "Bạn không quản lý phòng này" });
    }
    if (building.isDeleted || building.status === "inactive") {
      return res
        .status(400)
        .json({ message: "Tòa nhà đã bị khóa / không còn hoạt động" });
    }

    // 2. Tìm contract active trong kỳ
    const contract = await findActiveContractForRoom(roomId, {
      periodMonth: month,
      periodYear: year,
    });

    if (!contract) {
      return res.status(400).json({
        message:
          "Không tìm thấy hợp đồng completed nào áp dụng trong kỳ này cho phòng",
      });
    }

    // 3. Check đã có hóa đơn kỳ này chưa
    const existed = await Invoice.findOne({
      landlordId,
      tenantId: contract.tenantId,
      roomId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
    }).lean();

    if (existed) {
      return res.status(409).json({
        message: "Đã tồn tại hóa đơn cho phòng/hợp đồng/kỳ này",
        invoiceId: existed._id,
      });
    }

    // 4. Lấy bản ghi điện nước đã xác nhận (một bản cho cả điện + nước)
    const utilityReading = await UtilityReading.findOne({
      landlordId,
      buildingId: room.buildingId,
      roomId,
      periodMonth: month,
      periodYear: year,
      status: "confirmed",
      isDeleted: false,
      invoiceId: null,
    }).lean();

    // 5. Lấy danh sách dịch vụ tòa nhà
    const buildingServices = await BuildingService.find({
      landlordId,
      buildingId: room.buildingId,
      isDeleted: false,
    }).lean();

    const items = [];

    // 5.1. Tiền phòng (tuỳ chọn)
    if (includeRent && contract.contract?.price) {
      items.push({
        type: "rent",
        label: "Tiền phòng",
        description: `Tiền phòng tháng ${month}/${year}`,
        quantity: 1,
        unitPrice: contract.contract.price,
        amount: Number(contract.contract.price),
      });
    }

    // 5.2. Tiền điện / nước từ UtilityReading + giá ở tòa
    if (utilityReading) {
      const eConsumption = utilityReading.eConsumption || 0;
      const wConsumption = utilityReading.wConsumption || 0;
      const ePrice = building.ePrice || 0;
      const wPrice = building.wPrice || 0;

      if (eConsumption > 0 && ePrice >= 0) {
        const quantity = eConsumption;
        const unitPrice = ePrice;
        const amount = Math.max(0, quantity * unitPrice);

        items.push({
          type: "electric",
          label: "Tiền điện",
          description: `Tiền điện tháng ${month}/${year}`,
          quantity,
          unitPrice,
          amount,
          utilityReadingId: utilityReading._id,
          meta: {
            previousIndex: utilityReading.ePreviousIndex,
            currentIndex: utilityReading.eCurrentIndex,
          },
        });
      }

      if (wConsumption > 0 && wPrice >= 0) {
        const quantity = wConsumption;
        const unitPrice = wPrice;
        const amount = Math.max(0, quantity * unitPrice);

        items.push({
          type: "water",
          label: "Tiền nước",
          description: `Tiền nước tháng ${month}/${year}`,
          quantity,
          unitPrice,
          amount,
          utilityReadingId: utilityReading._id,
          meta: {
            previousIndex: utilityReading.wPreviousIndex,
            currentIndex: utilityReading.wCurrentIndex,
          },
        });
      }
    }

    // 5.3. Dịch vụ tòa nhà (internet, gửi xe, vệ sinh...)
    const occupantCount = 1 + (contract.roommates?.length || 0);

    for (const sv of buildingServices) {
      // included: vẫn cho hiện 1 line với amount = 0 để minh bạch
      let quantity = 1;
      if (sv.chargeType === "perPerson") {
        quantity = occupantCount;
      }

      const unitPrice = sv.fee || 0;
      const amount = Math.max(0, quantity * unitPrice);

      const label =
        sv.label ||
        (sv.name === "internet"
          ? "Internet"
          : sv.name === "parking"
          ? "Gửi xe"
          : sv.name === "cleaning"
          ? "Phí vệ sinh"
          : sv.name === "security"
          ? "Bảo vệ"
          : "Dịch vụ khác");

      items.push({
        type: "service",
        label,
        description:
          sv.description ||
          `Dịch vụ ${label.toLowerCase()} tháng ${month}/${year}`,
        quantity,
        unitPrice,
        amount,
        meta: {
          buildingServiceId: sv._id,
          chargeType: sv.chargeType,
        },
      });
    }

    // 5.4. Chi phí phát sinh (extraItems) – cho chủ trọ nhập tay
    if (Array.isArray(extraItems)) {
      for (const raw of extraItems) {
        if (!raw) continue;
        const label = String(raw.label || "").trim();
        if (!label) continue;

        const description = raw.description
          ? String(raw.description)
          : `Chi phí phát sinh tháng ${month}/${year}`;

        const quantity = Number.isFinite(Number(raw.quantity))
          ? Number(raw.quantity)
          : 1;
        const unitPrice = Number.isFinite(Number(raw.unitPrice))
          ? Number(raw.unitPrice)
          : 0;
        const amountRaw = Number(raw.amount);
        const amount =
          Number.isFinite(amountRaw) && amountRaw >= 0
            ? amountRaw
            : Math.max(0, quantity * unitPrice);

        if (amount <= 0 && unitPrice <= 0) continue;

        items.push({
          type: "other",
          label,
          description,
          quantity,
          unitPrice,
          amount,
        });
      }
    }

    if (!items.length) {
      return res.status(400).json({
        message:
          "Không có dữ liệu để tạo hóa đơn (không có tiền phòng, điện/nước, dịch vụ hay chi phí phát sinh)",
      });
    }

    // 6. Tính dueDate mặc định nếu chưa truyền
    let dueDate = null;
    if (req.body.dueDate) {
      dueDate = new Date(req.body.dueDate);
    } else {
      // mặc định: ngày 10 của tháng kế tiếp
      const d = new Date(year, month - 1, 1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(10);
      d.setHours(23, 59, 59, 999);
      dueDate = d;
    }

    // 7. Sinh số hoá đơn
    const invoiceNumber = await Invoice.generateInvoiceNumber({
      landlordId,
      periodMonth: month,
      periodYear: year,
    });

    const invoice = new Invoice({
      landlordId,
      tenantId: contract.tenantId,
      roomId,
      buildingId: room.buildingId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      invoiceNumber,
      issuedAt: new Date(),
      dueDate,
      items,
      status: "draft",
      createdBy: landlordId,
    });

    invoice.recalculateTotals();
    await invoice.save();

    // Gắn invoiceId + cập nhật trạng thái UtilityReading nếu có
    if (utilityReading) {
      await UtilityReading.updateOne(
        { _id: utilityReading._id },
        { $set: { invoiceId: invoice._id, status: "billed" } }
      );
    }

    return res.status(201).json({
      message:
        "Đã tạo hoá đơn tháng (tiền phòng, điện/nước, dịch vụ toà + chi phí phát sinh)",
      data: invoice,
    });
  } catch (e) {
    console.error("generateMonthlyInvoice error:", e);
    return res.status(500).json({
      message: "Lỗi tạo hoá đơn tháng",
      error: e.message,
    });
  }
};

// GET /landlords/invoices
// Lấy danh sách hóa đơn
exports.getInvoices = async (req, res) => {
  try {
    const landlordId = req.user._id;

    const {
      status,
      buildingId,
      roomId,
      contractId,
      periodMonth,
      periodYear,
      q,
      page = 1,
      limit = 20,
      sortBy = "issuedAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {
      landlordId,
      isDeleted: false,
    };

    if (status) filter.status = status;
    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (contractId) filter.contractId = contractId;
    if (periodMonth) filter.periodMonth = Number(periodMonth);
    if (periodYear) filter.periodYear = Number(periodYear);

    if (q) {
      filter.$or = [
        { invoiceNumber: { $regex: q, $options: "i" } },
        { "searchMeta.roomNumber": { $regex: q, $options: "i" } },
        { "searchMeta.buildingName": { $regex: q, $options: "i" } },
        { "searchMeta.tenantName": { $regex: q, $options: "i" } },
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate("roomId", "roomNumber")
        .populate("buildingId", "name")
        .populate({
          path: "tenantId",
          select: "userInfo",
          populate: {
            path: "userInfo",
            select: "fullName",
          },
        })
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    return res.json({
      data: items,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (e) {
    console.error("getInvoices error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

// GET /landlords/invoices/:id
// Chi tiết hoá đơn
exports.getInvoiceDetail = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    })
      .populate("roomId", "roomNumber")
      .populate("buildingId", "name address")
      .populate({
        path: "tenantId",
        select: "userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber",
        },
      })
      .lean();

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    return res.json({ data: invoice });
  } catch (e) {
    console.error("getInvoiceDetail error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

// PATCH /landlords/invoices/:id
// Cập nhật hoá đơn (chỉ cho phép sửa một số field)
exports.updateInvoice = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;

    const allowedFields = [
      "items",
      "note",
      "discountAmount",
      "lateFee",
      "status",
    ];

    const update = {};
    for (const field of allowedFields) {
      if (field in req.body) {
        update[field] = req.body[field];
      }
    }

    let invoice = await Invoice.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    Object.assign(invoice, update);

    invoice.recalculateTotals();
    await invoice.save();

    return res.json({
      message: "Cập nhật hoá đơn thành công",
      data: invoice,
    });
  } catch (e) {
    console.error("updateInvoice error:", e);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

// PATCH /landlords/invoices/:id/pay
// Đánh dấu đã thanh toán
exports.markInvoicePaid = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;
    const { paymentMethod, paidAt, note, paidAmount } = req.body || {};

    const invoice = await Invoice.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    // Không cho mark paid nếu đã hủy
    if (invoice.status === "cancelled") {
      return res
        .status(400)
        .json({ message: "Hóa đơn đã bị hủy, không thể ghi nhận thanh toán" });
    }

    // Nếu đã paid trước đó: đảm bảo đã có log thu, rồi trả về luôn
    if (invoice.status === "paid") {
      await ensureRevenueLogForInvoicePaid(invoice, {
        actorId: req.user?._id,
      });
      return res.json({
        message: "Hóa đơn đã được ghi nhận thanh toán trước đó",
        data: invoice,
      });
    }

    // Validate số tiền
    const total = Number(invoice.totalAmount) || 0;
    if (!total || total <= 0) {
      return res.status(400).json({
        message: "Số tiền hóa đơn không hợp lệ",
      });
    }

    let finalPaidAmount =
      typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : total;

    // Nếu muốn sau này hỗ trợ thanh toán một phần thì ở đây sẽ khác.
    // Hiện tại: coi như thanh toán đủ 100%.
    invoice.paidAmount = finalPaidAmount;
    invoice.status = "paid";

    if (paymentMethod) {
      const allowed = ["cash", "online_gateway", null];
      if (!allowed.includes(paymentMethod)) {
        return res.status(400).json({ message: "paymentMethod không hợp lệ" });
      }
      invoice.paymentMethod = paymentMethod;
    } else if (!invoice.paymentMethod) {
      // default nếu landlord không truyền: coi như tiền mặt
      invoice.paymentMethod = "cash";
    }

    invoice.paidAt = paidAt ? new Date(paidAt) : new Date();

    if (note) {
      invoice.paymentNote = note;
    }

    await invoice.save();

    // 🔗 Sau khi hóa đơn đã "paid" → tự động ghi log thu
    await ensureRevenueLogForInvoicePaid(invoice, { actorId: req.user?._id });

    return res.json({
      message: "Đã ghi nhận thanh toán hóa đơn",
      data: invoice,
    });
  } catch (e) {
    console.error("markInvoicePaid error:", e);
    return res.status(500).json({ message: e.message });
  }
};

// POST /landlords/invoices/:id/send-email
exports.sendInvoiceEmail = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;

    const result = await sendInvoiceEmailCore(id, landlordId);

    if (result.skipped) {
      return res.status(400).json({
        message: result.reason,
        skipped: true,
      });
    }

    return res.json({
      message: "Đã gửi email hóa đơn cho người thuê",
      status: result.update.status || result.invoice.status,
      emailStatus: result.update.emailStatus,
    });
  } catch (e) {
    console.error("sendInvoiceEmail error:", e);
    return res.status(400).json({ message: e.message });
  }
};

// POST /landlords/invoices/generate
// body: { roomId, periodMonth, periodYear, dueDate?, includeRent?, extraItems? }
exports.generateInvoice = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const {
      roomId,
      periodMonth,
      periodYear,
      dueDate, // optional, ISO string
      includeRent = true,
      extraItems = [],
    } = req.body || {};

    if (!roomId || !periodMonth || !periodYear) {
      return res.status(400).json({
        message: "Thiếu roomId, periodMonth hoặc periodYear",
      });
    }

    const month = Number(periodMonth);
    const year = Number(periodYear);
    if (
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      month < 1 ||
      month > 12 ||
      year < 2000
    ) {
      return res
        .status(400)
        .json({ message: "periodMonth/periodYear không hợp lệ" });
    }

    // 1. Kiểm tra room + building thuộc landlord
    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId ePrice wPrice status isDeleted")
      .lean();
    if (!building || String(building.landlordId) !== String(landlordId)) {
      return res.status(403).json({ message: "Bạn không quản lý phòng này" });
    }
    if (building.isDeleted || building.status === "inactive") {
      return res
        .status(400)
        .json({ message: "Tòa nhà đã bị khóa / không còn hoạt động" });
    }

    // 2. Check HĐ hiện tại của phòng
    const roomWithContract = await Room.findById(roomId)
      .select("currentContractId")
      .lean();
    if (!roomWithContract || !roomWithContract.currentContractId) {
      return res
        .status(400)
        .json({ message: "Phòng chưa có hợp đồng để tạo hóa đơn" });
    }

    const contract = await Contract.findOne({
      _id: roomWithContract.currentContractId,
      landlordId,
      status: "completed",
      isDeleted: false,
    }).lean();

    if (!contract) {
      return res.status(400).json({
        message: "Phòng chưa có hợp đồng hoàn tất để tạo hóa đơn",
      });
    }

    // 3. Check đã có hoá đơn kỳ này chưa
    const existed = await Invoice.findOne({
      landlordId,
      tenantId: contract.tenantId,
      buildingId: room.buildingId,
      roomId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
    }).lean();

    if (existed) {
      return res.status(409).json({
        message: "Đã tồn tại hoá đơn cho phòng/hợp đồng/kỳ này",
        invoiceId: existed._id,
      });
    }

    // 4. Lấy utilityReading confirmed của kỳ này (nếu có)
    const utilityReading = await UtilityReading.findOne({
      landlordId,
      buildingId: room.buildingId,
      roomId,
      periodMonth: month,
      periodYear: year,
      status: "confirmed",
      isDeleted: false,
      invoiceId: null,
    }).lean();

    // 5. Dịch vụ tòa nhà
    const buildingServices = await BuildingService.find({
      landlordId,
      buildingId: room.buildingId,
      isDeleted: false,
    }).lean();

    const items = [];

    // 5.1 Tiền phòng
    if (includeRent && contract.contract?.price) {
      items.push({
        type: "rent",
        label: "Tiền phòng",
        description: `Tiền phòng tháng ${month}/${year}`,
        quantity: 1,
        unitPrice: contract.contract.price,
        amount: Number(contract.contract.price),
      });
    }

    // 5.2 Tiền điện / nước nếu có đọc số
    if (utilityReading) {
      const eConsumption = utilityReading.eConsumption || 0;
      const wConsumption = utilityReading.wConsumption || 0;
      const ePrice = building.ePrice || 0;
      const wPrice = building.wPrice || 0;

      if (eConsumption > 0 && ePrice >= 0) {
        const quantity = eConsumption;
        const unitPrice = ePrice;
        const amount = Math.max(0, quantity * unitPrice);

        items.push({
          type: "electric",
          label: "Tiền điện",
          description: `Tiền điện tháng ${month}/${year}`,
          quantity,
          unitPrice,
          amount,
          utilityReadingId: utilityReading._id,
          meta: {
            previousIndex: utilityReading.ePreviousIndex,
            currentIndex: utilityReading.eCurrentIndex,
          },
        });
      }

      if (wConsumption > 0 && wPrice >= 0) {
        const quantity = wConsumption;
        const unitPrice = wPrice;
        const amount = Math.max(0, quantity * unitPrice);

        items.push({
          type: "water",
          label: "Tiền nước",
          description: `Tiền nước tháng ${month}/${year}`,
          quantity,
          unitPrice,
          amount,
          utilityReadingId: utilityReading._id,
          meta: {
            previousIndex: utilityReading.wPreviousIndex,
            currentIndex: utilityReading.wCurrentIndex,
          },
        });
      }
    }

    // 5.3 Dịch vụ tòa nhà
    const occupantCount = 1 + (contract.roommates?.length || 0);
    for (const sv of buildingServices) {
      let quantity = 1;
      if (sv.chargeType === "perPerson") {
        quantity = occupantCount;
      }

      const unitPrice = sv.fee || 0;
      const amount = Math.max(0, quantity * unitPrice);

      const label =
        sv.label ||
        (sv.name === "internet"
          ? "Internet"
          : sv.name === "parking"
          ? "Gửi xe"
          : sv.name === "cleaning"
          ? "Phí vệ sinh"
          : sv.name === "security"
          ? "Bảo vệ"
          : "Dịch vụ khác");

      items.push({
        type: "service",
        label,
        description:
          sv.description ||
          `Dịch vụ ${label.toLowerCase()} tháng ${month}/${year}`,
        quantity,
        unitPrice,
        amount,
        meta: {
          buildingServiceId: sv._id,
          chargeType: sv.chargeType,
        },
      });
    }

    // 5.4 Chi phí phát sinh extraItems
    if (Array.isArray(extraItems)) {
      for (const raw of extraItems) {
        if (!raw) continue;
        const label = String(raw.label || "").trim();
        if (!label) continue;

        const description = raw.description
          ? String(raw.description)
          : `Chi phí phát sinh tháng ${month}/${year}`;

        const quantity = Number.isFinite(Number(raw.quantity))
          ? Number(raw.quantity)
          : 1;
        const unitPrice = Number.isFinite(Number(raw.unitPrice))
          ? Number(raw.unitPrice)
          : 0;
        const amountRaw = Number(raw.amount);
        const amount =
          Number.isFinite(amountRaw) && amountRaw >= 0
            ? amountRaw
            : Math.max(0, quantity * unitPrice);

        if (amount <= 0 && unitPrice <= 0) continue;

        items.push({
          type: "other",
          label,
          description,
          quantity,
          unitPrice,
          amount,
        });
      }
    }

    if (!items.length) {
      return res.status(400).json({
        message:
          "Không có dữ liệu để tạo hoá đơn (không có tiền phòng, điện/nước, dịch vụ hay chi phí phát sinh)",
      });
    }

    // 6. Xử lý dueDate (nếu truyền thì dùng, không thì default ngày 10 tháng sau)
    let finalDueDate = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (Number.isNaN(d.getTime())) {
        return res
          .status(400)
          .json({ message: "dueDate không hợp lệ (không parse được)" });
      }
      finalDueDate = d;
    } else {
      const d = new Date(year, month - 1, 1);
      d.setMonth(d.getMonth() + 1);
      d.setDate(10);
      d.setHours(23, 59, 59, 999);
      finalDueDate = d;
    }

    // 7. Sinh invoiceNumber
    const invoiceNumber = await Invoice.generateInvoiceNumber({
      landlordId,
      periodMonth: month,
      periodYear: year,
    });

    const invoice = new Invoice({
      landlordId,
      tenantId: contract.tenantId,
      roomId,
      buildingId: room.buildingId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      invoiceNumber,
      issuedAt: new Date(),
      dueDate: finalDueDate,
      items,
      status: "draft",
      createdBy: landlordId,
    });

    invoice.recalculateTotals();
    await invoice.save();

    if (utilityReading) {
      await UtilityReading.updateOne(
        { _id: utilityReading._id },
        { $set: { invoiceId: invoice._id, status: "billed" } }
      );
    }

    return res.status(201).json({
      message:
        "Đã tạo hoá đơn kỳ này (tiền phòng, điện/nước, dịch vụ toà + chi phí phát sinh)",
      data: invoice,
    });
  } catch (e) {
    console.error("generateInvoice error:", e);
    return res.status(500).json({
      message: "Lỗi tạo hoá đơn",
      error: e.message,
    });
  }
};

// POST /landlords/invoices/generate-monthly-bulk
// body: { buildingId, periodMonth, periodYear, includeRent? }
exports.generateMonthlyInvoicesBulk = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      buildingId,
      periodMonth,
      periodYear,
      includeRent = true,
      extraItems = [],
    } = req.body || {};

    if (!buildingId || !periodMonth || !periodYear) {
      return res.status(400).json({
        message: "Thiếu buildingId hoặc periodMonth/periodYear",
      });
    }

    const month = Number(periodMonth);
    const year = Number(periodYear);
    if (
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      month < 1 ||
      month > 12 ||
      year < 2000
    ) {
      return res
        .status(400)
        .json({ message: "periodMonth/periodYear không hợp lệ" });
    }

    const building = await Building.findOne({
      _id: buildingId,
      landlordId,
      isDeleted: false,
    }).lean();

    if (!building) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tòa nhà hoặc không thuộc quyền" });
    }

    // 1) Lấy tất cả phòng "rented" thuộc building
    const rooms = await Room.find({
      buildingId,
      isDeleted: false,
      status: "rented",
    })
      .select("_id roomNumber")
      .lean();

    if (!rooms.length) {
      return res.status(400).json({
        message: "Không có phòng đang cho thuê để tạo hóa đơn",
      });
    }

    const summary = {
      success: 0,
      failed: 0,
      details: [],
    };

    // 3) Loop từng phòng và gọi lại generateMonthlyInvoice
    for (const room of rooms) {
      const fakeReq = {
        user: { _id: landlordId },
        body: {
          roomId: room._id,
          periodMonth: month,
          periodYear: year,
          includeRent,
          extraItems,
        },
      };

      const fakeRes = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          return this;
        },
      };

      try {
        await exports.generateMonthlyInvoice(fakeReq, fakeRes);

        // Nếu generateMonthlyInvoice trả 201 + có data._id → success
        if (
          fakeRes.statusCode === 201 &&
          fakeRes.payload &&
          fakeRes.payload.data &&
          fakeRes.payload.data._id
        ) {
          summary.success += 1;
          summary.details.push({
            roomId: room._id,
            roomNumber: room.roomNumber,
            invoiceId: fakeRes.payload.data._id,
            message: fakeRes.payload.message,
          });
        } else {
          summary.failed += 1;
          summary.details.push({
            roomId: room._id,
            roomNumber: room.roomNumber,
            error:
              fakeRes.payload?.message ||
              "Không rõ lỗi khi tạo hoá đơn cho phòng",
          });
        }
      } catch (err) {
        console.error(
          "generateMonthlyInvoicesBulk - error creating invoice for room",
          room._id,
          err
        );
        summary.failed += 1;
        summary.details.push({
          roomId: room._id,
          roomNumber: room.roomNumber,
          error: err.message || "Lỗi không xác định",
        });
      }
    }

    return res.json({
      message: "Đã xử lý tạo hóa đơn hàng loạt",
      ...summary,
    });
  } catch (e) {
    console.error("generateMonthlyInvoicesBulk error:", e);
    return res.status(500).json({
      message: "Lỗi tạo hoá đơn hàng loạt",
      error: e.message,
    });
  }
};

// GET /landlords/invoices/rooms
// Liệt kê phòng + hợp đồng phù hợp để tạo hóa đơn
exports.listRoomsForInvoice = async (req, res) => {
  try {
    const landlordId = req.user?._id;

    if (!landlordId) {
      return res.status(401).json({ message: "Không xác định được landlord" });
    }

    let {
      buildingId,
      roomId,
      periodMonth,
      periodYear,
      q,
      page = 1,
      limit = 20,
    } = req.query || {};

    const now = new Date();
    const month = Number.isFinite(Number(periodMonth))
      ? Number(periodMonth)
      : now.getMonth() + 1;
    const year = Number.isFinite(Number(periodYear))
      ? Number(periodYear)
      : now.getFullYear();

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res
        .status(400)
        .json({ message: "periodMonth không hợp lệ (1–12)" });
    }
    if (!Number.isInteger(year) || year < 2000) {
      return res.status(400).json({ message: "periodYear không hợp lệ" });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 20, 1);

    const { start, end } = getPeriodRange(month, year);

    // 1) Lọc contract completed, thuộc landlord, còn hiệu lực trong kỳ
    const filter = {
      landlordId,
      status: "completed",
      isDeleted: false,
      "contract.startDate": { $lte: end },
      $or: [
        { "contract.endDate": { $gte: start } },
        { "contract.endDate": null },
      ],
    };

    if (buildingId) {
      filter.buildingId = buildingId;
    }

    if (roomId) {
      filter.roomId = roomId;
    }

    let contractsQuery = Contract.find(filter)
      .populate("roomId", "roomNumber status isDeleted floorId")
      .populate("buildingId", "name address status isDeleted")
      .populate({
        path: "tenantId",
        select: "email role userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber dob gender address",
        },
      })
      .sort({ "contract.startDate": -1 });

    const allContracts = await contractsQuery.lean();

    // 2) Chỉ giữ contract có room hợp lệ
    let filtered = allContracts.filter((c) => {
      const r = c.roomId;
      const b = c.buildingId;
      if (!r || r.isDeleted) return false;
      if (r.status !== "rented") return false;
      if (!b || b.isDeleted || b.status !== "active") return false;
      return true;
    });

    // 3) Search theo roomNumber (q) nếu có
    if (q) {
      const keyword = String(q).trim().toLowerCase();
      filtered = filtered.filter((c) =>
        c.roomId?.roomNumber?.toLowerCase().includes(keyword)
      );
    }

    const total = filtered.length;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;

    const pageItems = filtered.slice(startIndex, endIndex).map((c) => {
      const room = c.roomId || {};
      const building = c.buildingId || {};
      const tenant = c.tenantId || {};
      const tenantInfo = tenant.userInfo || {};

      return {
        contractId: c._id,
        contractStatus: c.status,
        contract: {
          no: c.contract?.no || "",
          startDate: c.contract?.startDate || null,
          endDate: c.contract?.endDate || null,
          price: c.contract?.price || 0,
        },
        room: {
          _id: room._id,
          roomNumber: room.roomNumber,
          status: room.status,
          floorId: room.floorId,
        },
        building: {
          _id: building._id,
          name: building.name,
          address: building.address,
        },
        tenant: {
          _id: tenant._id,
          email: tenant.email,
          fullName: tenantInfo.fullName,
          phoneNumber: tenantInfo.phoneNumber,
        },
      };
    });

    return res.json({
      data: pageItems,
      total,
      page: pageNum,
      limit: limitNum,
      periodMonth: month,
      periodYear: year,
    });
  } catch (e) {
    console.error("listRoomsForInvoice error:", e);
    return res.status(500).json({
      message: e.message || "Server error",
      data: [],
      total: 0,
    });
  }
};
// POST /landlords/invoices/send-drafts
// body: { buildingId?, periodMonth?, periodYear? }
exports.sendAllDraftInvoices = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { buildingId, periodMonth, periodYear } = req.body || {};

    if (!landlordId) {
      return res.status(401).json({ message: "Không xác định landlord" });
    }

    const filter = {
      landlordId,
      isDeleted: false,
      status: "draft", // chỉ gửi các hóa đơn đang draft
    };

    if (buildingId) {
      filter.buildingId = buildingId;
    }
    if (periodMonth) {
      const m = Number(periodMonth);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        return res
          .status(400)
          .json({ message: "periodMonth không hợp lệ (1–12)" });
      }
      filter.periodMonth = m;
    }
    if (periodYear) {
      const y = Number(periodYear);
      if (!Number.isInteger(y) || y < 2000) {
        return res.status(400).json({ message: "periodYear không hợp lệ" });
      }
      filter.periodYear = y;
    }

    const invoices = await Invoice.find(filter)
      .select(
        "_id invoiceNumber roomId buildingId tenantId periodMonth periodYear status"
      )
      .lean();

    if (!invoices.length) {
      return res.status(200).json({
        message: "Không có hóa đơn ở trạng thái draft phù hợp để gửi",
        total: 0,
        successCount: 0,
        failCount: 0,
        data: [],
      });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const inv of invoices) {
      const row = {
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        success: false,
        skipped: false,
        reason: null,
        error: null,
        emailStatus: null,
      };

      try {
        const result = await sendInvoiceEmailCore(inv._id, landlordId);

        if (result.skipped) {
          // ví dụ: paid/cancelled (dù filter của mình không lấy, nhưng để phòng khi đổi logic sau này)
          row.skipped = true;
          row.reason = result.reason;
          failCount++;
          results.push(row);
          continue;
        }

        // Sau khi gửi email thành công, chuyển trạng thái hóa đơn sang "sent"
        await Invoice.updateOne({ _id: inv._id }, { $set: { status: "sent" } });

        row.success = true;
        row.emailStatus =
          result.update?.emailStatus || result.invoice?.emailStatus || "sent";
        successCount++;
        results.push(row);
      } catch (err) {
        console.error(
          "sendAllDraftInvoices - error sending invoice",
          inv._id,
          err
        );
        row.error = err.message || "Lỗi không xác định khi gửi hóa đơn";
        failCount++;
        results.push(row);
      }
    }

    const total = results.length;
    const message = `Đã xử lý gửi ${total} hóa đơn draft: thành công ${successCount}, lỗi/skipped ${failCount}`;

    return res.status(200).json({
      message,
      total,
      successCount,
      failCount,
      data: results,
    });
  } catch (e) {
    console.error("sendAllDraftInvoices error:", e);
    return res.status(500).json({
      message: e.message || "Server error",
    });
  }
};
