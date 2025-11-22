const Invoice = require("../../models/Invoice");
const UtilityReading = require("../../models/UtilityReading");
const Room = require("../../models/Room");
const Contract = require("../../models/Contract");
const Building = require("../../models/Building");
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
  const emailTo = invoice.emailToOverride || tenant?.email || null;

  if (!emailTo) {
    throw new Error("Không tìm thấy email người thuê để gửi hóa đơn");
  }

  const tenantName = tenant?.userInfo?.fullName || tenant?.email || "Anh/Chị";
  const periodStr = `${invoice.periodMonth}/${invoice.periodYear}`;
  const amountStr = new Intl.NumberFormat("vi-VN").format(
    invoice.totalAmount || 0
  );
  const currency = invoice.currency || "VND";
  const dueDateStr = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString("vi-VN")
    : "";

  const emailPayload = {
    tenantName,
    invoiceNumber: invoice.invoiceNumber || "",
    period: periodStr,
    roomNumber: invoice.roomId?.roomNumber || "",
    totalAmount: amountStr,
    currency,
    dueDate: dueDateStr,
    note: invoice.note || "",
    appUrl: process.env.APP_URL || "https://example.com",
  };

  const emailResult = await sendEmail(emailTo, emailPayload, "invoice");

  const now = new Date();
  const update = {};

  if (emailResult.success) {
    update.emailStatus = "sent";
    update.emailSentAt = now;
    update.emailLastError = null;

    // Nếu đang draft thì sau khi gửi mail chuyển sang sent
    if (invoice.status === "draft") {
      update.status = "sent";
      update.sentAt = now;
    }
  } else {
    update.emailStatus = "failed";
    update.emailLastError = emailResult.error || "Unknown error";
  }

  await Invoice.updateOne({ _id: invoiceId }, { $set: update });

  return { invoice, emailResult, update };
}

// POST /landlords/invoices/generate-monthly
// body: { roomId, periodMonth, periodYear, includeRent? }
exports.generateMonthlyInvoice = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const {
      roomId,
      periodMonth,
      periodYear,
      includeRent = true,
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

    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId")
      .lean();
    if (!building || String(building.landlordId) !== String(landlordId)) {
      return res.status(403).json({ message: "Bạn không quản lý phòng này" });
    }

    // Tìm contract active trong kỳ
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

    // Check đã có hóa đơn kỳ này chưa
    const existed = await Invoice.findOne({
      landlordId,
      tenantId: contract.tenantId,
      roomId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
      status: { $ne: "cancelled" },
    }).lean();

    if (existed) {
      return res.status(400).json({
        message: "Đã tồn tại hóa đơn cho phòng/hợp đồng/kỳ này",
        invoiceId: existed._id,
      });
    }

    // Lấy utility readings confirmed, chưa gắn invoice
    const utilityReadings = await UtilityReading.find({
      roomId,
      periodMonth: month,
      periodYear: year,
      status: "confirmed",
      isDeleted: false,
      invoiceId: null,
    }).lean();

    const items = [];

    // 1) Tiền phòng
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

    // 2) Line item điện/nước
    for (const r of utilityReadings) {
      const label =
        r.type === "electricity"
          ? "Tiền điện"
          : r.type === "water"
          ? "Tiền nước"
          : "Tiện ích khác";

      const itemType = r.type === "electricity" ? "electric" : r.type; // 🔧 D

      const quantity = r.consumption || 0;
      const unitPrice = r.unitPrice || 0;
      const amount =
        r.amount != null ? r.amount : Math.max(0, quantity * unitPrice);

      items.push({
        type: itemType,
        label,
        description: `${label} tháng ${r.periodMonth}/${r.periodYear}`,
        quantity,
        unitPrice,
        amount,
        utilityReadingId: r._id,
      });
    }

    if (!items.length) {
      return res.status(400).json({
        message:
          "Không có dữ liệu để tạo hóa đơn (không có tiền phòng hoặc utility readings)",
      });
    }

    // Tính dueDate mặc định = ngày 10 của tháng kế tiếp
    let dueDate;
    {
      // month ở đây đã là 1–12
      const d = new Date(year, month - 1, 1); // ngày 1 của kỳ hoá đơn
      d.setMonth(d.getMonth() + 1); // sang tháng kế tiếp
      d.setDate(10); // hạn ngày 10
      d.setHours(23, 59, 59, 999); // cuối ngày
      dueDate = d;
    }
    // Sinh số hóa đơn
    const invoiceNumber = await Invoice.generateInvoiceNumber({
      landlordId,
      periodMonth: month,
      periodYear: year,
    });

    const invoice = new Invoice({
      landlordId,
      tenantId: contract.tenantId,
      buildingId: room.buildingId,
      roomId,
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
    try {
      await sendInvoiceEmailCore(invoice._id, landlordId);
    } catch (err) {
      console.error(
        "Auto send invoice email error (generateMonthlyInvoice):",
        err.message
      );
    }
    // Gắn invoiceId vào utilityReadings + chuyển trạng thái sang 'billed'
    if (utilityReadings.length) {
      await UtilityReading.updateMany(
        { _id: { $in: utilityReadings.map((u) => u._id) } },
        {
          $set: {
            invoiceId: invoice._id,
            status: "billed",
          },
        }
      );
    }

    return res.status(201).json({
      message: "Đã tạo hóa đơn tháng (bao gồm tiền phòng + điện/nước)",
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
exports.listInvoices = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    let {
      status,
      buildingId,
      roomId,
      tenantId,
      periodMonth,
      periodYear,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      landlordId,
      isDeleted: false,
    };

    if (status) filter.status = status;
    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
    if (tenantId) filter.tenantId = tenantId;
    if (periodMonth) filter.periodMonth = Number(periodMonth);
    if (periodYear) filter.periodYear = Number(periodYear);

    if (search) {
      const keyword = String(search).trim();
      if (keyword) {
        filter.invoiceNumber = { $regex: keyword, $options: "i" };
      }
    }

    const pageNumber = Number(page) || 1;
    const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * pageSize;

    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .select(
          [
            "_id",
            "invoiceNumber",
            "status",
            "periodMonth",
            "periodYear",
            "issuedAt",
            "dueDate",
            "totalAmount",
            "paidAt",
            "buildingId",
            "roomId",
            "tenantId",
            "contractId",
            "createdAt",
            "updatedAt",
          ].join(" ")
        )
        .populate("buildingId", "name address")
        .populate("roomId", "roomNumber")
        .populate({
          path: "tenantId",
          select: "email userInfo",
          populate: { path: "userInfo", select: "fullName phoneNumber" },
        })
        .sort({ issuedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    console.error("listInvoices error:", e);
    res.status(500).json({ message: e.message });
  }
};

// GET /landlords/invoices/:id
exports.getInvoiceDetail = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      landlordId,
      isDeleted: false,
    })
      .populate("buildingId", "name address")
      .populate("roomId", "roomNumber")
      .populate({
        path: "tenantId",
        select: "email userInfo",
        populate: { path: "userInfo", select: "fullName phoneNumber address" },
      })
      .populate("contractId", "contract.no contract.startDate contract.endDate")
      .populate({
        path: "items.utilityReadingId",
        select:
          "type periodMonth periodYear previousIndex currentIndex consumption unitPrice amount status",
      })
      .lean();

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    res.json(invoice);
  } catch (e) {
    console.error("getInvoiceDetail error:", e);
    res.status(500).json({ message: e.message });
  }
};

// POST /landlords/invoices/:id/pay
// body: { paymentMethod, paidAt, note, paidAmount }
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

    if (!["draft", "sent", "overdue"].includes(invoice.status)) {
      return res.status(400).json({
        message: `Không thể thanh toán hóa đơn ở trạng thái hiện tại: ${invoice.status}`,
      });
    }

    invoice.status = "paid";
    invoice.paidAt = paidAt ? new Date(paidAt) : new Date();
    if (paymentMethod) invoice.paymentMethod = paymentMethod;

    const amountToSet =
      paidAmount != null ? Number(paidAmount) : invoice.totalAmount;

    invoice.paidAmount = amountToSet;

    if (note) {
      invoice.paymentNote = note;
    }

    await invoice.save();

    res.json({
      message: "Đã ghi nhận thanh toán hóa đơn",
      data: invoice,
    });
  } catch (e) {
    console.error("markInvoicePaid error:", e);
    res.status(500).json({ message: e.message });
  }
};

// PATCH /landlords/invoices/:id
exports.updateInvoice = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const { id } = req.params;
    const {
      items,
      subtotal,
      discountAmount,
      lateFee,
      totalAmount,
      periodMonth,
      periodYear,
      roomId,
      tenantId,
      buildingId,
      contractId,
      status,
      note,
      internalNote,
      paymentRef,
    } = req.body || {};

    const invoice = await Invoice.findOne({ _id: id, landlordId });

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hoá đơn" });
    }

    const isPaid = invoice.status === "paid";

    if (isPaid) {
      if (
        items != null ||
        subtotal != null ||
        discountAmount != null ||
        lateFee != null ||
        totalAmount != null ||
        periodMonth != null ||
        periodYear != null ||
        roomId != null ||
        tenantId != null ||
        buildingId != null ||
        contractId != null
      ) {
        return res.status(400).json({
          message:
            "Hoá đơn đã thanh toán, không thể chỉnh sửa các trường số tiền/phòng/kỳ. Chỉ được cập nhật ghi chú hoặc tham chiếu thanh toán.",
        });
      }
    }

    if (!isPaid) {
      if (items) invoice.items = items;
      if (subtotal != null) invoice.subtotal = subtotal;
      if (discountAmount != null) invoice.discountAmount = discountAmount;
      if (lateFee != null) invoice.lateFee = lateFee;
      if (totalAmount != null) invoice.totalAmount = totalAmount;
      if (periodMonth != null) invoice.periodMonth = periodMonth;
      if (periodYear != null) invoice.periodYear = periodYear;
      if (roomId != null) invoice.roomId = roomId;
      if (tenantId != null) invoice.tenantId = tenantId;
      if (buildingId != null) invoice.buildingId = buildingId;
      if (contractId != null) invoice.contractId = contractId;

      if (status) {
        const allowed = ["draft", "sent", "cancelled", "overdue", "paid"];
        if (!allowed.includes(status)) {
          return res.status(400).json({ message: "Trạng thái không hợp lệ" });
        }
        invoice.status = status;
      }

      invoice.recalculateTotals();
    }

    if (note != null) invoice.note = note;
    if (internalNote != null) invoice.internalNote = internalNote;
    if (paymentRef != null) invoice.paymentRef = paymentRef;

    await invoice.save();

    return res.json({ message: "Cập nhật hoá đơn thành công", data: invoice });
  } catch (err) {
    console.error("updateInvoice error:", err);
    return res.status(500).json({ message: "Lỗi cập nhật hoá đơn" });
  }
};

// POST /landlords/invoices/:id/send-email
exports.sendInvoiceEmail = async (req, res) => {
  try {
    const landlordId = req.user?._id;
    const { id } = req.params;

    const result = await sendInvoiceEmailCore(id, landlordId);

    if (result.skipped) {
      return res.status(400).json({ message: result.reason });
    }

    if (!result.emailResult.success) {
      return res.status(500).json({
        message: "Gửi email hóa đơn thất bại",
        error: result.emailResult.error,
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
// body: { roomId, periodMonth, periodYear, dueDate?, includeRent? }
exports.generateInvoice = async (req, res) => {
  try {
    const landlordId = req.user._id;
    const {
      roomId,
      periodMonth,
      periodYear,
      dueDate, // optional, ISO string
      includeRent = true,
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

    // 1. Kiểm tra phòng + tòa thuộc landlord
    const room = await Room.findById(roomId).lean();
    if (!room) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const building = await Building.findById(room.buildingId)
      .select("landlordId")
      .lean();
    if (!building || String(building.landlordId) !== String(landlordId)) {
      return res.status(403).json({ message: "Bạn không quản lý phòng này" });
    }

    // 2. Check trùng invoice cho cùng phòng + tháng/năm
    const existed = await Invoice.findOne({
      landlordId,
      buildingId: room.buildingId,
      roomId,
      periodMonth: month,
      periodYear: year,
      isDeleted: false,
      status: { $ne: "cancelled" },
    }).lean();

    if (existed) {
      return res.status(400).json({
        message: "Đã tồn tại hoá đơn cho phòng này và kỳ này",
        invoiceId: existed._id,
      });
    }

    // 3. Lấy hợp đồng completed hiện tại
    const contract = await Contract.findOne({
      _id: room.currentContractId,
      landlordId,
      status: "completed",
      isDeleted: false,
    }).lean();

    if (!contract) {
      return res.status(400).json({
        message: "Phòng chưa có hợp đồng hoàn tất để tạo hóa đơn",
      });
    }

    const tenantId = contract.tenantId;
    const rentPrice = Number(contract.contract?.price || 0);

    // 4. Lấy utility readings cho tháng/năm đó
    const readings = await UtilityReading.find({
      buildingId: room.buildingId,
      roomId,
      periodMonth: month,
      periodYear: year,
      status: "confirmed", // chỉ lấy bản đã confirm
      isDeleted: false,
      invoiceId: null, // chưa gắn hóa đơn
    }).lean();

    const items = [];

    // 4.1. Tiền phòng
    if (includeRent && rentPrice > 0) {
      items.push({
        type: "rent",
        label: "Tiền phòng",
        description: `Tiền phòng ${room.roomNumber} tháng ${month}/${year}`,
        quantity: 1,
        unitPrice: rentPrice,
        amount: rentPrice,
      });
    }

    // 4.2. Điện / nước
    for (const r of readings) {
      const label =
        r.type === "electricity"
          ? "Tiền điện"
          : r.type === "water"
          ? "Tiền nước"
          : "Tiện ích khác";

      const itemType = r.type === "electricity" ? "electric" : r.type; // 🔧 D – map type

      const quantity = r.consumption || 0;
      const unitPrice = r.unitPrice || 0;
      const amount =
        r.amount != null ? r.amount : Math.max(0, quantity * unitPrice);

      items.push({
        type: itemType,
        label,
        description: `${label} tháng ${r.periodMonth}/${r.periodYear}`,
        quantity,
        unitPrice,
        amount,
        utilityReadingId: r._id,
      });
    }

    if (!items.length) {
      return res.status(400).json({
        message:
          "Không có dữ liệu để tạo hoá đơn (không có tiền phòng hoặc utility readings)",
      });
    }

    // 5. Tổng tiền
    const discountAmount = 0;
    const lateFee = 0;

    // 6. Tính dueDate (nếu không truyền → mặc định ngày 10 tháng kế tiếp)
    let due = dueDate ? new Date(dueDate) : null;
    if (!due || Number.isNaN(due.getTime())) {
      const d = new Date(year, month - 1, 1); // ngày 1 của tháng hiện tại
      d.setMonth(d.getMonth() + 1); // chuyển sang tháng kế
      d.setDate(10);
      d.setHours(23, 59, 59, 999);
      due = d;
    }

    // 7. Sinh số hóa đơn
    const invoiceNumber = await Invoice.generateInvoiceNumber({
      landlordId,
      periodMonth: month,
      periodYear: year,
    });

    // 8. Tạo invoice
    const invoice = new Invoice({
      landlordId,
      tenantId,
      buildingId: room.buildingId,
      roomId,
      contractId: contract._id,
      periodMonth: month,
      periodYear: year,
      invoiceNumber,
      items,
      discountAmount,
      lateFee,
      paidAmount: 0,
      currency: "VND",
      issuedAt: new Date(),
      dueDate: due,
      status: "draft", // landlord có thể xem rồi /send để gửi email
      createdBy: landlordId,
    });

    invoice.recalculateTotals();
    await invoice.save();
    try {
      await sendInvoiceEmailCore(invoice._id, landlordId);
    } catch (err) {
      console.error(
        "Auto send invoice email error (generateInvoice):",
        err.message
      );
    }
    // 9. Cập nhật readings -> billed
    if (readings.length) {
      await UtilityReading.updateMany(
        {
          _id: { $in: readings.map((r) => r._id) },
        },
        { $set: { status: "billed", invoiceId: invoice._id } }
      );
    }

    return res.status(201).json({
      message: "Đã tạo hoá đơn (tiền phòng + điện/nước) cho phòng/kỳ này",
      data: invoice,
    });
  } catch (e) {
    console.error("generateInvoice error:", e);
    return res
      .status(500)
      .json({ message: "Lỗi tạo hoá đơn", error: e.message });
  }
};
router.post("/generate-monthly-bulk", async (req, res) => {
  try {
    const { periodMonth, periodYear } = req.body;
    const landlordId = req.user._id;

    if (!periodMonth || !periodYear) {
      return res.status(400).json({
        message: "Thiếu periodMonth / periodYear",
      });
    }

    const rooms = await Room.find({
      landlordId,
      status: "rented",
      isDeleted: false,
    }).lean();

    let success = [];
    let failed = [];

    for (const room of rooms) {
      const fakeReq = {
        user: { _id: landlordId },
        body: {
          roomId: room._id,
          periodMonth,
          periodYear,
        },
      };

      const fakeRes = {
        status: () => fakeRes,
        json: (data) => {
          if (data?.data) success.push(room._id);
          else
            failed.push({
              roomId: room._id,
              message: data?.message,
            });
        },
      };

      await InvoiceController.generateMonthlyInvoice(fakeReq, fakeRes);
    }

    return res.status(200).json({
      message: "Đã xử lý tạo hóa đơn hàng loạt",
      successCount: success.length,
      failedCount: failed.length,
      failed,
    });
  } catch (err) {
    console.error("generateMonthlyBulk error:", err);
    return res.status(500).json({
      message: "Lỗi hệ thống khi tạo hóa đơn hàng loạt",
      error: err.message,
    });
  }
});
