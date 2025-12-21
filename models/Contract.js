const mongoose = require("mongoose");
const getIo = () => global._io;
const personSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Họ tên
    dob: { type: Date }, // Ngày sinh
    cccd: { type: String }, // CCCD / CMND
    cccdIssuedDate: { type: Date }, // Cấp ngày
    cccdIssuedPlace: { type: String }, // Nơi cấp
    permanentAddress: { type: String }, // Hộ khẩu thường trú
    phone: { type: String }, // Điện thoại
    email: { type: String }, // Email (tiện map với Account)
  },
  { _id: false }
);
const identityVerificationSchema = new mongoose.Schema(
  {
    cccdFrontUrl: String,
    cccdBackUrl: String,
    selfieUrl: String,

    ocrData: {
      name: String,
      dob: String,
      cccd: String,
      permanentAddress: String,
    },

    faceMatchScore: Number,

    status: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
      index: true,
    },

    verifiedAt: Date,
    rejectedReason: String,
    provider: {
      type: String,
      enum: ["manual", "vnpt", "fpt"],
      default: "manual",
    },
  },
  { _id: false }
);

const bikeSchema = new mongoose.Schema(
  {
    bikeNumber: { type: String, required: true }, // Biển số xe / mã xe
    color: { type: String },
    brand: { type: String },
  },
  { _id: true }
);

const termSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // tên điều khoản tại thời điểm ký
    description: { type: String, required: true }, // nội dung điều khoản
    order: { type: Number }, // thứ tự hiển thị
  },
  { _id: false }
);

const regulationSnapshotSchema = new mongoose.Schema(
  {
    title: { type: String, required: true }, // tiêu đề nội quy
    description: { type: String, required: true }, // nội dung chi tiết
    effectiveFrom: { type: Date }, // nếu muốn lưu luôn mốc hiệu lực
    order: { type: Number }, // thứ tự
  },
  { _id: false }
);
// Yêu cầu chấm dứt hợp đồng từ tenant
const terminationRequestSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true },
    note: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },

    requestedAt: { type: Date, default: Date.now },
    requestedById: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

    processedAt: { type: Date },
    processedById: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    processedByRole: {
      type: String,
      enum: ["landlord", "system"],
    },

    rejectedReason: { type: String },
  },
  { _id: false }
);

// Lịch sử gia hạn
const extensionSchema = new mongoose.Schema(
  {
    oldEndDate: { type: Date, required: true },
    newEndDate: { type: Date, required: true },
    note: { type: String },
    extendedAt: { type: Date, default: Date.now },
    extendedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    extendedByRole: {
      type: String,
      enum: ["landlord", "resident", "system"],
      default: "landlord",
    },
  },
  { _id: false }
);

// Yêu cầu gia hạn hiện tại
const renewalRequestSchema = new mongoose.Schema(
  {
    months: { type: Number, required: true }, // muốn gia hạn thêm bao nhiêu tháng
    requestedEndDate: { type: Date, required: true }, // ngày kết thúc mới dự kiến
    note: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },

    requestedAt: { type: Date, default: Date.now },
    requestedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    requestedByRole: {
      type: String,
      enum: ["resident"],
      default: "resident",
    },

    processedAt: { type: Date },
    processedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    processedByRole: {
      type: String,
      enum: ["landlord", "system"],
    },
    rejectedReason: { type: String },
  },
  { _id: false }
);

const contractSchema = new mongoose.Schema(
  {
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true, // người thuê chính
    },

    buildingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
    },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContractTemplate",
    },

    // Thông tin hai bên
    A: personSchema, // Bên A – chủ nhà
    B: personSchema, // Bên B – người thuê chính

    roommates: {
      type: [personSchema],
      default: [],
    },

    // Danh sách xe
    bikes: {
      type: [bikeSchema],
      default: [],
    },

    // Thông tin hợp đồng chung
    contract: {
      no: { type: String }, // Số HĐ
      price: { type: Number }, // Tiền thuê / tháng
      deposit: { type: Number }, // Tiền cọc
      signDate: { type: Date }, // Ngày ký
      startDate: { type: Date }, // Ngày bắt đầu thuê
      endDate: { type: Date }, // Ngày kết thúc
      signPlace: { type: String }, // Địa điểm ký
      paymentCycleMonths: {
        type: Number,
        default: 1, // 1 tháng / lần
        min: 1,
      },

      // Mặc định = paymentCycleMonths.
      depositRentMonths: {
        type: Number,
        default: null,
        min: 1,
      },
    },

    // Term/Regulation snapshot
    terms: {
      type: [termSnapshotSchema],
      default: [],
    },

    regulations: {
      type: [regulationSnapshotSchema],
      default: [],
    },

    // Lịch sử gia hạn
    extensions: {
      type: [extensionSchema],
      default: [],
    },

    // Yêu cầu gia hạn hiện tại (tối đa 1)
    renewalRequest: renewalRequestSchema,

    // Chữ ký
    landlordSignatureUrl: { type: String },
    tenantSignatureUrl: { type: String },

    status: {
      type: String,
      enum: [
        "draft",
        "sent_to_tenant",
        "signed_by_tenant",
        "signed_by_landlord",
        "completed",
        "voided", // Hợp đồng bị vô hiệu (nhập sai / không sử dụng)
        "terminated", // Hợp đồng kết thúc sớm
      ],
      default: "draft",
      index: true,
    },
    sentToTenantAt: { type: Date },
    completedAt: { type: Date },

    // Đánh dấu đã confirm move in (để không cho void nữa)
    moveInConfirmedAt: { type: Date },

    // Lưu thông tin huỷ / chấm dứt
    voidReason: { type: String },
    voidedAt: { type: Date },
    terminationType: {
      type: String,
      enum: ["normal_expiry", "early_termination", null],
      default: null,
    },
    terminatedAt: { type: Date },
    terminationNote: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    clonedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      default: null,
    },
    terminationRequest: terminationRequestSchema,
    identityVerification: identityVerificationSchema,
  },
  { timestamps: true }
);

// === AUTO CREATE DEPOSIT INVOICE ON CONTRACT COMPLETED (BUT NOT MOVE-IN YET) ===
// Ngay khi hợp đồng chuyển sang "completed" (chưa vào ở) -> tự tạo hóa đơn tiền cọc.
contractSchema.pre("save", function (next) {
  try {
    this.$locals = this.$locals || {};
    this.$locals._becameCompletedNow =
      this.isModified("status") && this.status === "completed";
    return next();
  } catch (e) {
    return next();
  }
});

contractSchema.post("save", async function (doc) {
  try {
    // Chỉ chạy đúng lúc vừa chuyển sang completed
    if (!doc?.$locals?._becameCompletedNow) return;
    // Nếu đã confirm vào ở thì thôi
    if (doc.moveInConfirmedAt) return;

    const depositAmount = Number(doc?.contract?.deposit || 0);
    if (!depositAmount || depositAmount <= 0) return;

    // Lazy load models để tránh circular deps
    // eslint-disable-next-line global-require
    const Invoice = mongoose.models.Invoice || require("./Invoice");

    // Nếu đã có hóa đơn cọc thì không tạo lại
    const existed = await Invoice.findOne({
      contractId: doc._id,
      invoiceKind: "deposit",
      isDeleted: false,
    })
      .select("_id status")
      .lean();
    if (existed) return;

    const startDate = doc?.contract?.startDate
      ? new Date(doc.contract.startDate)
      : new Date();
    const periodMonth = startDate.getMonth() + 1;
    const periodYear = startDate.getFullYear();

    const invoiceNumber = await Invoice.generateInvoiceNumber({
      landlordId: doc.landlordId,
      periodMonth,
      periodYear,
    });

    const items = [
      {
        type: "other",
        label: "Tiền cọc",
        description: "Tiền cọc hợp đồng",
        quantity: 1,
        unitPrice: depositAmount,
        amount: depositAmount,
        meta: { kind: "deposit" },
      },
    ];

    const monthlyPrice = Number(doc?.contract?.price || 0);
    if (monthlyPrice > 0) {
      const cycleMonths = Math.max(
        1,
        Number(
          doc?.contract?.depositRentMonths ||
          doc?.contract?.paymentCycleMonths ||
          1
        )
      );

      // Nếu hợp đồng có endDate thì chỉ thu tối đa tới tháng kết thúc
      let billedMonths = cycleMonths;
      const endDate = doc?.contract?.endDate
        ? new Date(doc.contract.endDate)
        : null;

      const monthDiff = ({ fromMonth, fromYear, toMonth, toYear }) =>
        (toYear - fromYear) * 12 + (toMonth - fromMonth);

      const addMonthsToYearMonth = ({ month, year }, addMonths) => {
        const idx = year * 12 + (month - 1) + addMonths;
        const newYear = Math.floor(idx / 12);
        const newMonth = (idx % 12) + 1;
        return { month: newMonth, year: newYear };
      };

      if (endDate && !Number.isNaN(endDate.getTime())) {
        const endMonth = endDate.getMonth() + 1;
        const endYear = endDate.getFullYear();
        const remainingInclusive =
          monthDiff({
            fromMonth: periodMonth,
            fromYear: periodYear,
            toMonth: endMonth,
            toYear: endYear,
          }) + 1;

        billedMonths = Math.min(billedMonths, Math.max(0, remainingInclusive));
      }

      if (billedMonths > 0) {
        const endPeriod = addMonthsToYearMonth(
          { month: periodMonth, year: periodYear },
          billedMonths - 1
        );

        const desc =
          billedMonths === 1
            ? `Tiền phòng tháng ${periodMonth}/${periodYear}`
            : `Tiền phòng từ ${periodMonth}/${periodYear} đến ${endPeriod.month}/${endPeriod.year} (chu kỳ ${billedMonths} tháng)`;

        items.push({
          type: "rent",
          label: "Tiền phòng",
          description: desc,
          quantity: billedMonths,
          unitPrice: monthlyPrice,
          amount: Math.max(0, billedMonths * monthlyPrice),
          meta: {
            paymentCycleMonths: cycleMonths,
            billedMonths,
            from: { month: periodMonth, year: periodYear },
            to: { month: endPeriod.month, year: endPeriod.year },
            source: "deposit_invoice",
          },
        });
      }
    }

    const invoice = new Invoice({
      landlordId: doc.landlordId,
      tenantId: doc.tenantId,
      buildingId: doc.buildingId,
      roomId: doc.roomId,
      contractId: doc._id,
      invoiceKind: "deposit",
      periodMonth,
      periodYear,
      invoiceNumber,
      issuedAt: new Date(),
      dueDate: startDate,
      items,
      // Tạo xong là "sent" để người thuê thấy và có thể thanh toán.
      status: "sent",
      createdBy: doc.createBy || doc.landlordId,
    });

    invoice.recalculateTotals();
    await invoice.save();

    // Thông báo cho chủ trọ khi hệ thống tạo hóa đơn cọc
    try {
      // eslint-disable-next-line global-require
      const io = getIo();
      const Notification =
        mongoose.models.Notification || require("./Notification");
      const roomNumber = doc?.roomId?.roomNumber || "";
      const buildingName = doc?.buildingId?.name || "";
      const Staff =
        mongoose.models.Staff || require("./Staff");
      const staffList = await Staff.find({
        assignedBuildings: { $in: [doc?.buildingId] },
        isDeleted: false,
      })
        .select("accountId")
        .lean();

      const staffIds = staffList.map((s) => s.accountId.toString()).filter(Boolean);
      const receivers = [...new Set([doc.landlordId, ...staffIds])].filter(Boolean);
      console.log(receivers);
      if (receivers.length > 0) {
        const notiLandlord = await Notification.create({
          landlordId: doc.landlordId,
          createByRole: "system",
          title: "Hệ thống đã tạo hóa đơn tiền cọc",
          content:
            `Đã tạo hóa đơn tiền cọc cho hợp đồng${roomNumber ? ` phòng ${roomNumber}` : ""
            }${buildingName ? ` – ${buildingName}` : ""}.\n` +
            `Số tiền: ${depositAmount.toLocaleString("vi-VN")} ₫`,
          type: "reminder",
          target: { residents: receivers },
          link: "/landlord/invoices",
          createdAt: new Date(),
        });

        if (io) {
          receivers.forEach((uid) => {
            io.to(`user:${uid}`).emit("new_notification", {
              _id: notiLandlord._id,
              title: notiLandlord.title,
              content: notiLandlord.content,
              type: notiLandlord.type,
              link: notiLandlord.link,
              createdAt: notiLandlord.createdAt,
              createBy: { role: "system" },
            });

            io.to(`user:${uid}`).emit("unread_count_increment", { increment: 1 });
          });
          console.log(`[CRON] Sent reminder to landlord + staff (${receivers.length} người)`);
        }
      }
    } catch (notiErr) {
      // Không fail hook nếu không tạo được notification
      // eslint-disable-next-line no-console
      console.error("[DEPOSIT] create notification failed:", notiErr);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[DEPOSIT] auto create deposit invoice failed:", err);
  }
});

module.exports = mongoose.model("Contract", contractSchema);
