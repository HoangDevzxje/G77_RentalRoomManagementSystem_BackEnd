const axios = require("axios");
const crypto = require("crypto");
const Invoice = require("../../models/Invoice");
const UserInformation = require("../../models/UserInformation");

exports.listMyInvoices = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    let {
      status,
      buildingId,
      roomId,
      periodMonth,
      periodYear,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {
      tenantId,
      isDeleted: false,
      status: { $in: ["sent", "paid", "overdue"] },
    };

    if (status) filter.status = status;
    if (buildingId) filter.buildingId = buildingId;
    if (roomId) filter.roomId = roomId;
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
            "contractId",
            "createdAt",
            "updatedAt",
          ].join(" ")
        )
        .populate("buildingId", "name address")
        .populate("roomId", "roomNumber")
        .sort({ issuedDate: -1, createdAt: -1 })
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
    console.error("listMyInvoices error:", e);
    res.status(400).json({ message: e.message });
  }
};

// GET /tenants/invoices/:id
exports.getMyInvoiceDetail = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
      isDeleted: false,
    })
      .populate("buildingId", "name address")
      .populate("roomId", "roomNumber")
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
    console.error("getMyInvoiceDetail error:", e);
    res.status(400).json({ message: e.message });
  }
};
// POST /tenants/invoices/:id/pay
exports.payMyInvoice = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
      isDeleted: false,
    }).lean();

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    if (invoice.status === "paid") {
      return res
        .status(400)
        .json({ message: "Hóa đơn đã thanh toán trước đó" });
    }

    const amount = Number(invoice.totalAmount || 0);
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Tổng tiền hóa đơn không hợp lệ" });
    }

    const landlord = await Account.findById(invoice.landlordId)
      .select("bankInfo")
      .lean();

    if (!landlord || !landlord.bankInfo || !landlord.bankInfo.accountNumber) {
      return res.status(400).json({
        message:
          "Chủ trọ chưa cấu hình thông tin ngân hàng. Vui lòng liên hệ chủ trọ.",
      });
    }

    const transferNote = invoice.invoiceNumber
      ? invoice.invoiceNumber
      : `INVOICE-${invoice._id.toString().slice(-6)}`;

    return res.json({
      message:
        "Vui lòng chuyển khoản theo thông tin bên dưới và chờ chủ trọ xác nhận hóa đơn đã thanh toán.",
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      periodMonth: invoice.periodMonth,
      periodYear: invoice.periodYear,
      amount,
      bankInfo: landlord.bankInfo,
      transferNote,
    });
  } catch (e) {
    console.error("payMyInvoice (bank) error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
