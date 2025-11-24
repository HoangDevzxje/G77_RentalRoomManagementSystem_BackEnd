const Contract = require("../../models/Contract");
const Account = require("../../models/Account");
const Room = require("../../models/Room");
const RoomFurniture = require("../../models/RoomFurniture");
const Furniture = require("../../models/Furniture");
const UserInformation = require("../../models/UserInformation");
const PDFDocument = require("pdfkit");
const contentDisposition = require("content-disposition");
const he = require("he");
const Building = require("../../models/Building");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const FONT_REGULAR =
  process.env.CONTRACT_FONT_PATH || "public/fonts/NotoSans-Regular.ttf";
const FONT_BOLD =
  process.env.CONTRACT_FONT_BOLD_PATH || "public/fonts/NotoSans-Bold.ttf";

// Helper: map Account + UserInformation -> personSchema
function mapAccountToPerson(acc) {
  if (!acc) return undefined;
  const ui = acc.userInfo || {};

  return {
    name: ui.fullName || "",
    dob: ui.dob || null,
    phone: ui.phoneNumber || "",
    permanentAddress: normalizeAddress(ui.address),
    email: acc.email || "",

    // Các field này chưa có trong UserInformation – để trống
    cccd: "",
    cccdIssuedDate: null,
    cccdIssuedPlace: "",
    bankAccount: "",
    bankName: "",
  };
}
function normalizeAddress(raw) {
  if (!raw) return "";

  // Trường hợp là array (lịch sử địa chỉ)
  if (Array.isArray(raw)) {
    if (!raw.length) return "";
    const last = raw[raw.length - 1]; // lấy địa chỉ gần nhất

    return [last.address, last.wardName, last.districtName, last.provinceName]
      .filter(Boolean)
      .join(", ");
  }

  // Trường hợp là object đơn lẻ
  if (typeof raw === "object") {
    return [raw.address, raw.wardName, raw.districtName, raw.provinceName]
      .filter(Boolean)
      .join(", ");
  }

  // Trường hợp đã là string
  return String(raw);
}

// GET /tenants/contracts
exports.listMyContracts = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { tenantId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id status createdAt updatedAt buildingId roomId contract.no contract.startDate contract.endDate"
        )
        .populate("buildingId", "name")
        .populate("roomId", "roomNumber")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Contract.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /tenants/contracts/:id
exports.getMyContract = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const doc = await Contract.findOne({ _id: id, tenantId })
      .populate("buildingId", "name address")
      .populate("roomId", "roomNumber price maxTenants")
      .populate({
        path: "landlordId",
        select: "email userInfo",
        populate: {
          path: "userInfo",
          select: "fullName phoneNumber address dob",
        },
      })
      .lean();

    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    // Lấy danh sách nội thất trong phòng
    const roomFurnitures = await RoomFurniture.find({
      roomId: doc.roomId,
    })
      .populate("furnitureId", "name category code")
      .lean();

    doc.furnitures = roomFurnitures.map((rf) => ({
      id: rf._id,
      name: rf.furnitureId?.name,
      code: rf.furnitureId?.code,
      category: rf.furnitureId?.category,
      quantity: rf.quantity,
      condition: rf.condition,
      damageCount: rf.damageCount,
      notes: rf.notes,
    }));

    res.json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// PATCH /tenants/contracts/:id
// body: { B, bikes, roommates }
exports.updateMyData = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { B, bikes, roommates } = req.body || {};

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "sent_to_tenant") {
      return res.status(400).json({
        message:
          "Chỉ được chỉnh sửa thông tin khi hợp đồng đang được gửi cho bạn",
      });
    }

    // Cập nhật Bên B
    if (B) {
      const merged = {
        ...(contract.B?.toObject?.() || contract.B || {}),
        ...B,
      };

      // nếu B.permanentAddress FE gửi dạng object/array thì normalize
      if (merged.permanentAddress) {
        merged.permanentAddress = normalizeAddress(merged.permanentAddress);
      }

      contract.B = merged;
    }

    // Danh sách xe
    if (Array.isArray(bikes)) {
      contract.bikes = bikes
        .filter((b) => b && b.bikeNumber)
        .map((b) => ({
          _id: b._id,
          bikeNumber: String(b.bikeNumber || "").trim(),
          color: (b.color || "").trim(),
          brand: (b.brand || "").trim(),
        }));
    }

    //Roommates: nhập thủ công theo personSchema
    if (Array.isArray(roommates)) {
      const normalizedRoommates = roommates
        .filter((r) => r && r.name)
        .map((r) => ({
          name: r.name,
          dob: r.dob || null,
          cccd: r.cccd || "",
          cccdIssuedDate: r.cccdIssuedDate || null,
          cccdIssuedPlace: r.cccdIssuedPlace || "",
          permanentAddress: normalizeAddress(r.permanentAddress),
          phone: r.phone || "",
          email: r.email || "",
        }));

      contract.roommates = normalizedRoommates;
    }

    //Check maxTenants: 1 (B) + số roommates
    const room = await Room.findById(contract.roomId)
      .select("maxTenants")
      .lean();

    const roommateCount = (contract.roommates || []).length;
    const totalTenant = 1 + roommateCount; // 1 = B (tenant chính trong hợp đồng)

    if (room?.maxTenants && totalTenant > room.maxTenants) {
      return res.status(400).json({
        message: `Số người ở (${totalTenant}) vượt quá giới hạn cho phép (${room.maxTenants})`,
      });
    }

    //Build lại occupants = B + roommates
    const occupants = [];
    if (contract.B && contract.B.name) occupants.push(contract.B);
    if (Array.isArray(contract.roommates) && contract.roommates.length) {
      occupants.push(...contract.roommates);
    }
    contract.occupants = occupants;

    await contract.save();
    res.json(contract);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// POST /tenants/contracts/:id/sign
// body: { signatureUrl }

exports.signByTenant = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { signatureUrl } = req.body || {};

    if (!signatureUrl) {
      return res.status(400).json({ message: "Thiếu signatureUrl" });
    }

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (!["sent_to_tenant", "signed_by_landlord"].includes(contract.status)) {
      return res.status(400).json({
        message: `Không thể ký hợp đồng ở trạng thái hiện tại: ${contract.status}`,
      });
    }

    contract.tenantSignatureUrl = signatureUrl;
    if (contract.landlordSignatureUrl) {
      // Landlord đã ký trước → ký xong là completed
      contract.status = "completed";
      contract.completedAt = new Date();
    } else {
      // Tenant ký trước → chờ landlord
      contract.status = "signed_by_tenant";
    }

    await contract.save();
    res.json({
      message: "Ký hợp đồng thành công",
      status: contract.status,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /tenants/accounts/search-by-email?email=...
exports.searchAccountByEmail = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { email } = req.query || {};

    if (!email) {
      return res.status(400).json({ message: "Thiếu email" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const acc = await Account.findOne({
      email: normalizedEmail,
      isActivated: true,
      role: "resident", // chỉ cho phép thêm tài khoản người thuê khác
    })
      .populate("userInfo")
      .lean();

    if (!acc) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài khoản với email này" });
    }

    // Không cho tự add chính mình làm roommate
    if (String(acc._id) === String(tenantId)) {
      return res.status(400).json({
        message: "Bạn không thể thêm chính mình làm người ở cùng",
      });
    }

    const ui = acc.userInfo || {};

    return res.json({
      id: acc._id,
      email: acc.email,
      fullName: ui.fullName || "",
      phoneNumber: ui.phoneNumber || "",
      dob: ui.dob || null,
      address: ui.address || "",
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
};
// PATCH /tenants/contracts/:id/request-extend
// body: { months, note }
exports.requestExtend = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { months, note } = req.body || {};

    if (!months || months <= 0) {
      return res
        .status(400)
        .json({ message: "Số tháng gia hạn phải lớn hơn 0" });
    }

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message:
          "Chỉ được gửi yêu cầu gia hạn khi hợp đồng đang ở trạng thái completed",
      });
    }

    if (!contract.contract?.endDate) {
      return res.status(400).json({
        message: "Hợp đồng chưa có ngày kết thúc để gia hạn",
      });
    }

    // Đã có yêu cầu pending rồi thì không cho tạo thêm
    if (
      contract.renewalRequest &&
      contract.renewalRequest.status === "pending"
    ) {
      return res.status(400).json({
        message: "Bạn đang có một yêu cầu gia hạn đang chờ xử lý",
      });
    }

    const now = new Date();
    const endDate = new Date(contract.contract.endDate);

    // Ví dụ rule: chỉ cho gửi yêu cầu trong vòng 60 ngày trước khi hết hợp đồng
    const diffMs = endDate - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 60) {
      return res.status(400).json({
        message:
          "Chưa đến thời gian gửi yêu cầu gia hạn (chỉ gửi khi còn tối đa 60 ngày trước khi hết hợp đồng)",
      });
    }
    if (diffDays < 0) {
      return res.status(400).json({
        message: "Hợp đồng đã hết hạn, không thể gửi yêu cầu gia hạn",
      });
    }

    // Tính requestedEndDate = endDate + months
    const requestedEndDate = new Date(endDate);
    requestedEndDate.setMonth(requestedEndDate.getMonth() + Number(months));

    contract.renewalRequest = {
      months: Number(months),
      requestedEndDate,
      note: note || "",
      status: "pending",
      requestedAt: now,
      requestedById: tenantId,
      requestedByRole: "resident",
    };

    await contract.save();

    res.json({
      message: "Đã gửi yêu cầu gia hạn hợp đồng",
      renewalRequest: contract.renewalRequest,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// GET /tenants/contracts/upcoming-expire?days=30
exports.listUpcomingExpire = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { days = 30, page = 1, limit = 20 } = req.query;

    const numDays = Math.max(Number(days) || 30, 1); // ít nhất 1 ngày

    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + numDays);

    const filter = {
      tenantId,
      status: "completed",
      "contract.endDate": { $gte: now, $lte: future },
    };

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Contract.find(filter)
        .select(
          "_id status buildingId roomId contract.no contract.startDate contract.endDate"
        )
        .populate("buildingId", "name address")
        .populate("roomId", "roomNumber")
        .sort({ "contract.endDate": 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Contract.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      days: numDays,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

// ============ Helpers chung ============

function sanitizeFileName(name) {
  return String(name || "contract.pdf")
    .replace(/[\r\n]/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/\s+/g, " ");
}

function formatDate(d) {
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function isHtml(s = "") {
  return /<\/?[a-z][\s\S]*>/i.test(String(s));
}

function inlineText(html = "") {
  const decoded = he.decode(String(html));
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n");
  return withBreaks.replace(/<\/?(strong|em|b|i|u|span|p)>/gi, "");
}

function extractListItems(html = "") {
  const decoded = he.decode(String(html));
  const listMatch = decoded.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
  if (!listMatch) return null;
  const isOrdered = /^<ol/i.test(listMatch[0]);
  const body = listMatch[2];

  const items = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(body))) {
    const text = inlineText(m[1]).trim();
    if (text) items.push(text);
  }
  return { isOrdered, items };
}
async function loadImageBuffer(signatureUrl) {
  if (!signatureUrl) return null;

  try {
    // Nếu là URL http/https (Cloudinary, S3, v.v.)
    if (/^https?:\/\//i.test(signatureUrl)) {
      const resp = await axios.get(signatureUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      return Buffer.from(resp.data);
    }

    const filePath = path.isAbsolute(signatureUrl)
      ? signatureUrl
      : path.join(process.cwd(), signatureUrl);

    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  } catch (e) {
    console.error("Không load được ảnh chữ ký:", e.message);
    return null;
  }
}
async function loadImageBuffer(signatureUrl) {
  if (!signatureUrl) return null;

  try {
    // Nếu là URL http/https (Cloudinary, S3, v.v.)
    if (/^https?:\/\//i.test(signatureUrl)) {
      const resp = await axios.get(signatureUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      return Buffer.from(resp.data);
    }

    // Nếu là path local, ví dụ: "/uploads/signatures/abc.png"
    // Tùy dự án của bạn, chỉnh lại root cho đúng
    const filePath = path.isAbsolute(signatureUrl)
      ? signatureUrl
      : path.join(process.cwd(), signatureUrl);

    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  } catch (e) {
    console.error("Không load được ảnh chữ ký:", e.message);
    return null;
  }
}

async function streamContractPdf(contract, res) {
  const {
    A,
    B,
    roommates = [],
    bikes = [],
    contract: meta = {},
    terms = [],
    regulations = [],
  } = contract;

  const building = contract.buildingId;
  const room = contract.roomId;

  const fileNameRaw = `HopDong_${meta.no || contract._id}.pdf`;
  const fileName = sanitizeFileName(fileNameRaw);
  const cd = contentDisposition(fileName, { type: "attachment" });

  res.setHeader("Content-Disposition", cd);
  res.setHeader("Content-Type", "application/pdf");

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 50, left: 50, right: 50, bottom: 50 },
  });

  pdf.on("error", (err) => {
    if (!res.headersSent) {
      res.status(500).json({ message: err.message || "PDF stream error" });
    } else {
      try {
        res.end();
      } catch {}
    }
  });

  pdf.pipe(res);

  // Font
  try {
    pdf.font(FONT_REGULAR);
  } catch {
    pdf.font("Times-Roman");
  }

  // ===== HEADER =====
  pdf
    .fontSize(12)
    .text("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center" })
    .moveDown(0.2)
    .text("ĐỘC LẬP – TỰ DO – HẠNH PHÚC", { align: "center" });

  pdf.moveDown(0.8);
  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf
    .fontSize(16)
    .text("HỢP ĐỒNG THUÊ PHÒNG", { align: "center", underline: true });

  try {
    pdf.font(FONT_REGULAR);
  } catch {}
  pdf.moveDown(0.5);
  pdf
    .fontSize(10)
    .fillColor("gray")
    .text(`Số: ${meta.no || "........"}`, { align: "center" })
    .fillColor("black");

  // Ngày ký & địa điểm
  pdf.moveDown(1);
  pdf
    .fontSize(12)
    .text(
      `Hôm nay, ngày ${formatDate(meta.signDate) || "....../....../......"}`
    );
  pdf.text(
    `Tại: ${
      meta.signPlace || (building && building.address) || "................"
    }`
  );

  pdf.moveDown(0.5);

  // ===== BÊN A =====
  pdf.moveDown(0.3);
  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf.text("BÊN CHO THUÊ (BÊN A):");
  try {
    pdf.font(FONT_REGULAR);
  } catch {}

  pdf
    .fontSize(11)
    .text(`Họ tên: ${A?.name || ""}`)
    .text(
      `CCCD: ${A?.cccd || ""}   Cấp ngày: ${
        formatDate(A?.cccdIssuedDate) || ""
      }   Nơi cấp: ${A?.cccdIssuedPlace || ""}`
    )
    .text(`Hộ khẩu thường trú: ${A?.permanentAddress || ""}`)
    .text(`Điện thoại: ${A?.phone || ""}`)
    .text(`Email: ${A?.email || ""}`);

  // ===== BÊN B =====
  pdf.moveDown(0.6);
  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf.text("BÊN THUÊ (BÊN B):");
  try {
    pdf.font(FONT_REGULAR);
  } catch {}

  pdf
    .fontSize(11)
    .text(`Họ tên: ${B?.name || ""}`)
    .text(
      `CCCD: ${B?.cccd || ""}   Cấp ngày: ${
        formatDate(B?.cccdIssuedDate) || ""
      }   Nơi cấp: ${B?.cccdIssuedPlace || ""}`
    )
    .text(`Hộ khẩu thường trú: ${B?.permanentAddress || ""}`)
    .text(`Điện thoại: ${B?.phone || ""}`)
    .text(`Email: ${B?.email || ""}`);

  // Roommates
  if (roommates.length) {
    pdf.moveDown(0.6);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.text("Người ở cùng (roommates):");
    try {
      pdf.font(FONT_REGULAR);
    } catch {}

    roommates.forEach((r, idx) => {
      pdf
        .fontSize(11)
        .text(
          `${idx + 1}. ${r.name || ""} – CCCD: ${r.cccd || ""} – Điện thoại: ${
            r.phone || ""
          }`
        );
    });
  }

  // ===== THÔNG TIN PHÒNG & GIÁ =====
  pdf.moveDown(0.8);
  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf.text("THÔNG TIN PHÒNG VÀ GIÁ THUÊ:");
  try {
    pdf.font(FONT_REGULAR);
  } catch {}

  const buildingName = building?.name || "";
  const roomNumber = room?.roomNumber || "";
  const area = room?.area;
  pdf
    .fontSize(11)
    .text(
      `Tòa nhà: ${buildingName} – Địa chỉ: ${
        building?.address || "................................"
      }`
    )
    .text(`Phòng: ${roomNumber}    Diện tích: ${area || ""} m²`)
    .text(`Giá thuê: ${meta.price?.toLocaleString("vi-VN") || ""} VND/tháng`)
    .text(
      `Tiền cọc: ${
        meta.deposit?.toLocaleString("vi-VN") || ""
      } VND (bằng chữ: ................................)`
    )
    .text(
      `Thời hạn thuê: từ ngày ${formatDate(
        meta.startDate
      )} đến ngày ${formatDate(meta.endDate)}`
    )
    .text(`Chu kỳ thanh toán: mỗi ${meta.paymentCycleMonths || 1} tháng/lần`);

  // Bikes
  if (bikes.length) {
    pdf.moveDown(0.5);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.text("Phương tiện gửi kèm:");
    try {
      pdf.font(FONT_REGULAR);
    } catch {}

    bikes.forEach((b, idx) => {
      pdf
        .fontSize(11)
        .text(
          `${idx + 1}. Biển số: ${b.bikeNumber || ""} – Màu: ${
            b.color || ""
          } – Hãng: ${b.brand || ""}`
        );
    });
  }

  // ===== ĐIỀU KHOẢN (terms snapshot) =====
  if (terms.length) {
    pdf.moveDown(1);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.fontSize(13).text("I. ĐIỀU KHOẢN HỢP ĐỒNG", { underline: true });
    try {
      pdf.font(FONT_REGULAR);
    } catch {}
    pdf.moveDown(0.5);

    const sortedTerms = [...terms].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    sortedTerms.forEach((t, idx) => {
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.fontSize(12).text(`${idx + 1}. ${t.name || "Điều khoản"}`);
      try {
        pdf.font(FONT_REGULAR);
      } catch {}

      const desc = t.description || "";
      if (!desc) {
        pdf.moveDown(0.3);
        return;
      }

      if (isHtml(desc)) {
        const list = extractListItems(desc);
        if (list && list.items.length) {
          pdf.moveDown(0.2);
          list.items.forEach((it, i) => {
            const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
            try {
              pdf.font(FONT_BOLD);
            } catch {}
            pdf.fontSize(11).text(prefix, { continued: true });
            try {
              pdf.font(FONT_REGULAR);
            } catch {}
            pdf.fontSize(11).text(it, {
              paragraphGap: 4,
              align: "justify",
            });
          });
        } else {
          pdf.moveDown(0.2);
          pdf
            .fontSize(11)
            .text(inlineText(desc), { paragraphGap: 6, align: "justify" });
        }
      } else {
        pdf.moveDown(0.2);
        pdf
          .fontSize(11)
          .text(String(desc), { paragraphGap: 6, align: "justify" });
      }

      pdf.moveDown(0.3);
    });
  }

  // ===== NỘI QUY (regulations snapshot) =====
  if (regulations.length) {
    pdf.moveDown(1);
    try {
      pdf.font(FONT_BOLD);
    } catch {}
    pdf.fontSize(13).text("II. NỘI QUY / QUY ĐỊNH", { underline: true });
    try {
      pdf.font(FONT_REGULAR);
    } catch {}
    pdf.moveDown(0.5);

    const sortedRegs = [...regulations].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    sortedRegs.forEach((r, idx) => {
      try {
        pdf.font(FONT_BOLD);
      } catch {}
      pdf.fontSize(12).text(`${idx + 1}. ${r.title || "Quy định"}`);
      try {
        pdf.font(FONT_REGULAR);
      } catch {}

      const desc = r.description || "";
      if (!desc) {
        pdf.moveDown(0.3);
        return;
      }

      if (isHtml(desc)) {
        const list = extractListItems(desc);
        if (list && list.items.length) {
          pdf.moveDown(0.2);
          list.items.forEach((it, i) => {
            const prefix = list.isOrdered ? `${i + 1}. ` : "• ";
            try {
              pdf.font(FONT_BOLD);
            } catch {}
            pdf.fontSize(11).text(prefix, { continued: true });
            try {
              pdf.font(FONT_REGULAR);
            } catch {}
            pdf.fontSize(11).text(it, {
              paragraphGap: 4,
              align: "justify",
            });
          });
        } else {
          pdf.moveDown(0.2);
          pdf
            .fontSize(11)
            .text(inlineText(desc), { paragraphGap: 6, align: "justify" });
        }
      } else {
        pdf.moveDown(0.2);
        pdf
          .fontSize(11)
          .text(String(desc), { paragraphGap: 6, align: "justify" });
      }
      pdf.moveDown(0.3);
    });
  }

  // ======= CHỮ KÝ =======
  pdf.moveDown(2);

  const pageWidth = pdf.page.width;
  const margins = pdf.page.margins;

  const columnWidth = (pageWidth - margins.left - margins.right) / 2;

  const leftX = margins.left;
  const rightX = margins.left + columnWidth;

  // Tên & chữ ký từ contract
  const AName = A?.name || "";
  const BName = B?.name || "";

  const landlordSigUrl = contract.landlordSignatureUrl;
  const tenantSigUrl = contract.tenantSignatureUrl;

  const landlordSigBuf = await loadImageBuffer(landlordSigUrl);
  const tenantSigBuf = await loadImageBuffer(tenantSigUrl);

  // ===== Tiêu đề =====
  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf
    .fontSize(12)
    .text("ĐẠI DIỆN BÊN A", leftX, pdf.y, {
      width: columnWidth,
      align: "center",
    })
    .text("ĐẠI DIỆN BÊN B", rightX, pdf.y - 16, {
      width: columnWidth,
      align: "center",
    });

  pdf.moveDown(1);

  // ===== Hướng dẫn ký =====
  try {
    pdf.font(FONT_REGULAR);
  } catch {}
  pdf
    .fontSize(11)
    .text("(Ký, ghi rõ họ tên)", leftX, pdf.y, {
      width: columnWidth,
      align: "center",
    })
    .text("(Ký, ghi rõ họ tên)", rightX, pdf.y - 14, {
      width: columnWidth,
      align: "center",
    });

  pdf.moveDown(1.5);

  // ===== Ảnh chữ ký =====
  const sigWidth = 120;
  const sigHeight = 70;

  const sigY = pdf.y;

  if (landlordSigBuf) {
    pdf.image(landlordSigBuf, leftX + columnWidth / 2 - sigWidth / 2, sigY, {
      fit: [sigWidth, sigHeight],
    });
  }

  if (tenantSigBuf) {
    pdf.image(tenantSigBuf, rightX + columnWidth / 2 - sigWidth / 2, sigY, {
      fit: [sigWidth, sigHeight],
    });
  }

  // ===== Tên người ký =====
  pdf.moveDown(5);

  try {
    pdf.font(FONT_BOLD);
  } catch {}
  pdf
    .fontSize(12)
    .text(AName, leftX, pdf.y, {
      width: columnWidth,
      align: "center",
    })
    .text(BName, rightX, pdf.y - 16, {
      width: columnWidth,
      align: "center",
    });

  pdf.moveDown(4);
  pdf.end();
}

exports.residentDownloadMyContractPdf = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;

    const contract = await Contract.findOne({
      _id: id,
      tenantId,
      isDeleted: { $ne: true },
    })
      .populate({ path: "buildingId", select: "_id name address" })
      .populate({ path: "roomId", select: "_id roomNumber floorId area price" })
      .lean();

    if (!contract) {
      return res.status(404).json({
        message:
          "Không tìm thấy hợp đồng của bạn hoặc bạn không có quyền truy cập",
      });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message: "Hợp đồng chưa hoàn tất, chưa thể tải PDF",
      });
    }

    await streamContractPdf(contract, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      return res.status(400).json({ message: e.message || "Bad request" });
    }
    try {
      res.end();
    } catch {}
  }
};
