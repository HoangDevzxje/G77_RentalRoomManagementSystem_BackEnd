const axios = require("axios");
const crypto = require("crypto");
const Invoice = require("../../models/Invoice");
const {
  MOMO_ENDPOINT,
  MOMO_PARTNER_CODE,
  MOMO_ACCESS_KEY,
  MOMO_SECRET_KEY,
  MOMO_REDIRECT_URL,
  MOMO_IPN_URL,
} = require("../../configs/momo");

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
exports.payMyInvoice = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
      isDeleted: false,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Không tìm thấy hóa đơn" });
    }

    if (!["sent", "overdue", "draft"].includes(invoice.status)) {
      return res.status(400).json({
        message: "Hóa đơn không ở trạng thái có thể thanh toán",
      });
    }

    if (!invoice.totalAmount || invoice.totalAmount <= 0) {
      return res.status(400).json({
        message: "Số tiền hóa đơn không hợp lệ",
      });
    }

    const amount = Math.round(invoice.totalAmount);
    const orderId = `${MOMO_PARTNER_CODE}_${invoice._id}_${Date.now()}`;
    const requestId = orderId;
    const orderInfo = `Thanh toán hóa đơn ${
      invoice.invoiceNumber || invoice._id
    }`;
    const requestType = "captureWallet";

    const extraDataObj = { invoiceId: invoice._id.toString() };
    const extraData = Buffer.from(JSON.stringify(extraDataObj)).toString(
      "base64"
    );

    const rawSignature =
      "accessKey=" +
      MOMO_ACCESS_KEY +
      "&amount=" +
      amount +
      "&extraData=" +
      extraData +
      "&ipnUrl=" +
      MOMO_IPN_URL +
      "&orderId=" +
      orderId +
      "&orderInfo=" +
      orderInfo +
      "&partnerCode=" +
      MOMO_PARTNER_CODE +
      "&redirectUrl=" +
      MOMO_REDIRECT_URL +
      "&requestId=" +
      requestId +
      "&requestType=" +
      requestType;

    const signature = crypto
      .createHmac("sha256", MOMO_SECRET_KEY)
      .update(rawSignature)
      .digest("hex");

    const body = {
      partnerCode: MOMO_PARTNER_CODE,
      accessKey: MOMO_ACCESS_KEY,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl: MOMO_REDIRECT_URL,
      ipnUrl: MOMO_IPN_URL,
      requestType,
      extraData,
      signature,
      lang: "vi",
    };

    const momoRes = await axios.post(MOMO_ENDPOINT, body, {
      headers: { "Content-Type": "application/json" },
    });

    if (momoRes.data?.resultCode !== 0) {
      return res.status(400).json({
        message: "Tạo yêu cầu thanh toán MoMo thất bại",
        momo: momoRes.data,
      });
    }

    return res.json({
      message: "Tạo link thanh toán MoMo thành công",
      payUrl: momoRes.data.payUrl,
      momo: momoRes.data,
    });
  } catch (e) {
    console.error("payMyInvoice MoMo error:", e);
    return res.status(500).json({ message: e.message || "Server error" });
  }
};
