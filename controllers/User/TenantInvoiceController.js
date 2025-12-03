const axios = require("axios");
const crypto = require("crypto");
const Invoice = require("../../models/Invoice");
const Account = require("../../models/Account");
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
      status: { $in: ["sent", "transfer_pending", "paid", "overdue"] },
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

    if (!tenantId) {
      return res
        .status(401)
        .json({ message: "Không xác định được người dùng" });
    }

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
        .json({ message: "Hóa đơn này đã được thanh toán trước đó" });
    }

    // Chỉ cho phép thanh toán khi hóa đơn đã gửi cho khách
    if (!["sent", "overdue"].includes(invoice.status)) {
      return res.status(400).json({
        message:
          "Chỉ thanh toán được hóa đơn ở trạng thái 'sent' hoặc 'overdue'",
      });
    }

    const amount = Number(invoice.totalAmount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Tổng tiền hóa đơn không hợp lệ",
      });
    }

    // Lấy tài khoản chủ trọ để map sang UserInformation
    const landlordAccount = await Account.findById(invoice.landlordId)
      .select("role userInfo")
      .lean();

    if (!landlordAccount) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản chủ trọ" });
    }

    if (landlordAccount.role !== "landlord") {
      return res.status(400).json({
        message: "Tài khoản gắn với hóa đơn không phải chủ trọ hợp lệ",
      });
    }

    if (!landlordAccount.userInfo) {
      return res.status(400).json({
        message:
          "Chủ trọ chưa cấu hình thông tin ngân hàng. Vui lòng liên hệ chủ trọ.",
      });
    }

    const userInfo = await UserInformation.findById(landlordAccount.userInfo)
      .select("bankInfo")
      .lean();

    const bankInfo = userInfo?.bankInfo || {};

    if (
      !bankInfo.accountNumber ||
      !bankInfo.accountName ||
      !bankInfo.bankName
    ) {
      return res.status(400).json({
        message:
          "Chủ trọ chưa cấu hình đầy đủ thông tin ngân hàng. Vui lòng liên hệ chủ trọ.",
      });
    }

    // Gợi ý nội dung chuyển khoản
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
      bankInfo: {
        bankName: bankInfo.bankName,
        accountNumber: bankInfo.accountNumber,
        accountName: bankInfo.accountName,
        qrImageUrl: bankInfo.qrImageUrl || "",
      },
      transferNote,
    });
  } catch (e) {
    console.error("payMyInvoice (bank transfer) error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
// POST /tenants/invoices/:id/request-transfer-confirmation
exports.requestBankTransferConfirmation = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { note, proofImageUrl } = req.body;

    if (!tenantId) {
      return res
        .status(401)
        .json({ message: "Không xác định được người dùng" });
    }

    const file = req.file;

    // Ưu tiên file upload, nếu không có thì dùng URL
    let imageUrl = null;

    if (file && file.path) {
      imageUrl = file.path; // đường dẫn Cloudinary do multer-storage-cloudinary trả về
    } else if (proofImageUrl && typeof proofImageUrl === "string") {
      const trimmed = proofImageUrl.trim();
      if (trimmed) {
        imageUrl = trimmed; // dùng URL do frontend gửi lên
      }
    }

    if (!imageUrl) {
      return res
        .status(400)
        .json({ message: "Thiếu ảnh chứng từ chuyển khoản (file hoặc URL)" });
    }

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
      isDeleted: false,
    })
      .populate("roomId", "roomNumber")
      .populate({
        path: "tenantId",
        select: "userInfo",
        populate: { path: "userInfo", select: "fullName" },
      });

    if (!invoice)
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });

    if (["paid", "cancelled"].includes(invoice.status)) {
      return res.status(400).json({ message: "Hóa đơn đã được xử lý" });
    }

    if (!["sent", "overdue", "transfer_pending"].includes(invoice.status)) {
      return res
        .status(400)
        .json({ message: "Trạng thái hóa đơn không hợp lệ" });
    }

    // Lưu lại ảnh chứng từ (file Cloudinary hoặc URL ngoài)
    invoice.transferProofImageUrl = imageUrl;
    invoice.transferRequestedAt = new Date();
    invoice.status = "transfer_pending";

    if (note) invoice.paymentNote = note;

    await invoice.save();

    return res.json({
      message:
        "Đã gửi yêu cầu xác nhận chuyển khoản. Vui lòng chờ chủ trọ kiểm tra.",
      data: {
        _id: invoice._id,
        status: invoice.status,
        transferProofImageUrl: invoice.transferProofImageUrl,
      },
    });
  } catch (e) {
    console.error("requestBankTransferConfirmation error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
