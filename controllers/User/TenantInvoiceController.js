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

    if (!tenantId) {
      return res
        .status(401)
        .json({ message: "Không xác định được người dùng" });
    }

    // Ảnh đã upload lên Cloudinary nhờ middleware uploadTransferProof
    const file = req.file;
    if (!file || !file.path) {
      return res
        .status(400)
        .json({ message: "Thiếu ảnh chứng từ chuyển khoản" });
    }

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
      isDeleted: false,
    }).populate("roomId", "roomNumber")
      .populate({
        path: "tenantId",
        select: "userInfo",
        populate: {
          path: "userInfo",
          select: "fullName",
        }
      });

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    // Không cho gửi nếu hóa đơn đã thanh toán / hủy
    if (["paid", "cancelled"].includes(invoice.status)) {
      return res.status(400).json({
        message: "Hóa đơn đã được xử lý, không thể gửi yêu cầu xác nhận",
      });
    }

    // Chỉ cho gửi khi hóa đơn đã được gửi cho tenant (hoặc quá hạn)
    if (!["sent", "overdue"].includes(invoice.status)) {
      return res.status(400).json({
        message:
          "Chỉ gửi yêu cầu xác nhận cho hóa đơn ở trạng thái 'sent' hoặc 'overdue'",
      });
    }

    // Nếu đã từng chuyển sang transfer_pending rồi thì tùy bạn:
    // Cho phép gửi lại (ghi đè) hay chặn? Ở đây chặn luôn:
    if (invoice.status === "transfer_pending") {
      return res.status(400).json({
        message:
          "Bạn đã gửi yêu cầu xác nhận chuyển khoản cho hóa đơn này, vui lòng chờ chủ trọ kiểm tra.",
      });
    }

    // Ghi nhận URL Cloudinary & thời điểm
    invoice.transferProofImageUrl = file.path; // Cloudinary secure_url
    invoice.transferRequestedAt = new Date();

    // Chuyển trạng thái sang chờ xác nhận
    invoice.status = "transfer_pending";

    await invoice.save();
    const landlordId = invoice.landlordId;
    const buildingId = invoice.buildingId;

    const notification = await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Yêu cầu xác nhận thanh toán",
      content: `Người thuê ${invoice?.tenantId?.userInfo?.fullName}, phòng ${invoice?.roomId?.roomNumber} đã gửi yêu cầu xác nhận chuyển khoản cho hóa đơn #${invoice._id}.`,
      type: "reminder",
      target: { buildings: [buildingId] },
      link: `/landlord/invoices`,
    });

    const io = req.app.get("io");

    if (io) {
      const payload = {
        id: notification._id.toString(),
        title: notification.title,
        content: notification.content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: invoice?.tenantId?.userInfo?.fullName,
          role: "resident",
        },
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false,
      }).select("accountId").lean();

      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${landlordId}`).emit("unread_count_increment", { increment: 1 });
      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", { increment: 1 });
      });
    }
    return res.json({
      message:
        "Đã gửi yêu cầu xác nhận chuyển khoản. Vui lòng chờ chủ trọ kiểm tra và xác nhận.",
      data: {
        _id: invoice._id,
        status: invoice.status,
        transferProofImageUrl: invoice.transferProofImageUrl,
        transferRequestedAt: invoice.transferRequestedAt,
      },
    });
  } catch (e) {
    console.error("requestBankTransferConfirmation error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
