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
const Staff = require("../../models/Staff");
const Notification = require("../../models/Notification");
const os = require("os");
const FormData = require("form-data");
const { uploadIdentityToCloud } = require("../../configs/identityCloud");
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
          [
            "_id",
            "status",
            "createdAt",
            "updatedAt",
            "buildingId",
            "roomId",
            "contract.no",
            "contract.startDate",
            "contract.endDate",
            "terminationRequest",
          ].join(" ")
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
    if (!id) {
      return res.status(404).json({ message: "Thiếu id" });
    }
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
exports.uploadIdentityVerification = async (req, res) => {
  const files = req.files || {};

  try {
    const tenantId = req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne({ _id: id, tenantId });
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.identityVerification?.status === "verified") {
      return res.status(400).json({ message: "Danh tính đã được xác thực" });
    }

    if (contract.status !== "sent_to_tenant") {
      return res.status(400).json({
        message: "Chỉ xác thực khi hợp đồng đang chờ ký",
      });
    }

    const cccdFront = files.cccdFront?.[0];
    const cccdBack = files.cccdBack?.[0];
    const selfie = files.selfie?.[0];


    // ===== VALIDATE FILES =====
    if (!cccdFront) {
      return res.status(400).json({ message: "Thiếu ảnh CCCD mặt trước" });
    }
    if (!cccdBack) {
      return res.status(400).json({ message: "Thiếu ảnh CCCD mặt sau" });
    }
    if (!selfie) {
      return res.status(400).json({ message: "Thiếu ảnh selfie khuôn mặt" });
    }

    // === CALL FPT ===
    const fptResult = await verifyWithFPT(
      cccdFront.path,
      cccdBack?.path,
      selfie?.path
    );

    if (!fptResult.success) {
      return res.status(400).json({
        message: fptResult.error || "Xác thực eKYC thất bại",
      });
    }

    const { ocrData, faceMatchScore, rawResponse } = fptResult;
    // === SO KHỚP DỮ LIỆU ===
    const B = contract.B || {};

    const isNameMatch =
      normalizeName(B.name) === normalizeName(ocrData.name);

    const isCccdMatch =
      String(B.cccd || "").trim() === String(ocrData.cccd || "").trim();

    const isDobMatch =
      normalizeDate(B.dob) === normalizeDate(ocrData.dob);

    const isAddressMatch =
      normalizeAddress(ocrData.permanentAddress)
        ?.toLowerCase()
        .includes(
          normalizeAddress(B.permanentAddress)?.toLowerCase()
        );

    let isVerified =
      isNameMatch && isCccdMatch && isDobMatch && isAddressMatch;

    const FACE_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || 80);

    if (selfie && faceMatchScore !== null && faceMatchScore < FACE_THRESHOLD) {
      isVerified = false;
    }
    const cloudUrls = await uploadIdentityToCloud(
      files,
      contract._id,
      tenantId
    );
    const reasons = [];
    if (!isNameMatch) reasons.push("Tên không khớp");
    if (!isCccdMatch) reasons.push("Số CCCD không khớp");
    if (!isDobMatch) reasons.push("Ngày sinh không khớp");
    if (!isAddressMatch) reasons.push("Địa chỉ không khớp");
    if (
      selfie &&
      faceMatchScore !== null &&
      faceMatchScore < FACE_THRESHOLD
    ) {
      reasons.push("Khuôn mặt không khớp");
    }

    // === SAVE RESULT ===
    contract.identityVerification = {
      ...cloudUrls,

      ocrData,
      faceMatchScore,

      provider: "fpt",
      status: isVerified ? "verified" : "failed",
      verifiedAt: isVerified ? new Date() : null,
      rejectedReason: reasons.join(", "),
      rawProviderResponse: rawResponse,
    };

    await contract.save();

    return res.json({
      message: "Xác thực danh tính hoàn tất",
      identityVerification: contract.identityVerification,
    });
  } catch (err) {
    console.error("Lỗi", err.message);
    return res.status(500).json({
      message: err.message || "Lỗi server",
    });
  } finally {
    cleanupLocalFiles(files);
  }
};

async function verifyWithFPT(frontPath, backPath = null, selfiePath = null) {
  let tempFacePath = null;

  try {
    // ===== OCR CCCD =====
    const formData = new FormData();
    formData.append("image", fs.createReadStream(frontPath));
    if (backPath) {
      formData.append("back_image", fs.createReadStream(backPath));
    }
    formData.append("face", "1");

    const ocrRes = await axios.post(
      "https://api.fpt.ai/vision/idr/vnm",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          api_key: process.env.FPT_API_KEY,
        },
      }
    );
    const ocrBody = ocrRes.data;

    if (ocrBody.errorCode !== 0) {
      console.error("❌ FPT OCR ERROR:", {
        errorCode: ocrBody.errorCode,
        errorMessage: ocrBody.errorMessage,
      });
      return {
        success: false,
        error: ocrBody.errorMessage || "OCR thất bại",
      };
    }

    const result = ocrBody.data?.[0] || {};

    const ocrData = {
      name: result.fullname || result.name || "",
      dob: result.dob || result.date_of_birth || "",
      cccd: result.id || result.number || "",
      permanentAddress:
        result.address ||
        result.permanent_address ||
        result.home_town ||
        "",
    };

    // ===== FACE MATCH =====
    let faceMatchScore = null;

    if (selfiePath) {
      const matchForm = new FormData();
      matchForm.append("file[]", fs.createReadStream(frontPath));
      matchForm.append("file[]", fs.createReadStream(selfiePath));

      const matchRes = await axios.post(
        "https://api.fpt.ai/dmp/checkface/v1",
        matchForm,
        {
          headers: {
            ...matchForm.getHeaders(),
            api_key: process.env.FPT_API_KEY,
          },
        }
      );

      const matchData = matchRes.data;

      if (matchData?.data?.similarity !== undefined) {
        faceMatchScore = Math.round(matchData.data.similarity);
      }
    }

    return {
      success: true,
      ocrData,
      faceMatchScore,
      rawResponse: ocrBody,
    };
  } catch (err) {
    if (err.response) {
      console.error("❌ FPT API ERROR RESPONSE:", {
        status: err.response.status,
        headers: err.response.headers,
        data: err.response.data,
      });

      return {
        success: false,
        error:
          err.response.data?.errorMessage ||
          err.response.data?.message ||
          "FPT từ chối ảnh (không nhận diện được CCCD)",
      };
    }
    console.error("🔥 FPT CALL ERROR:", err.message);
    return {
      success: false,
      error: err.message || "Lỗi gọi FPT API",
    };
  } finally {
    if (tempFacePath && fs.existsSync(tempFacePath)) {
      fs.unlinkSync(tempFacePath);
    }
  }
}
function cleanupLocalFiles(files) {
  if (!files) return;

  Object.values(files)
    .flat()
    .forEach((f) => {
      if (f?.path && fs.existsSync(f.path)) {
        try {
          fs.unlinkSync(f.path);
        } catch (e) {
          console.error("❌ Cleanup file error:", f.path, e.message);
        }
      }
    });
}

function normalizeName(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDate(dateInput) {
  if (!dateInput) return null;

  if (dateInput instanceof Date) {
    return dateInput.toISOString().split("T")[0];
  }
  const dateStr = String(dateInput).trim();

  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/");
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (dateStr.includes("-")) {
    return dateStr.split("T")[0];
  }

  return null;
}

exports.getIdentityStatus = async (req, res) => {
  try {
    const tenantId = req.user._id;
    const { id } = req.params;

    const contract = await Contract.findOne(
      { _id: id, tenantId },
      "identityVerification"
    );

    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    res.json(contract.identityVerification || {});
  } catch (err) {
    console.error("Lỗi", err.message);
    res.status(400).json({ message: err.message });
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

    const contract = await Contract.findOne({ _id: id, tenantId })
      .populate("buildingId", "name")
      .populate("roomId", "roomNumber");
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (!["sent_to_tenant", "signed_by_landlord"].includes(contract.status)) {
      return res.status(400).json({
        message: `Không thể ký hợp đồng ở trạng thái hiện tại: ${contract.status}`,
      });
    }
    if (
      !contract.identityVerification ||
      contract.identityVerification.status !== "verified"
    ) {
      return res.status(400).json({
        message: "Bạn cần xác thực danh tính trước khi ký hợp đồng",
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

    const buildingId = contract.buildingId?._id;
    const landlordId = contract.landlordId?._id;
    const tenantInfo = await UserInformation.findById(req.user.userInfo).lean();
    const tenantName = tenantInfo?.fullName || "Người thuê";

    const title = "Người thuê đã ký hợp đồng";
    const content = `${tenantName} đã ký hợp đồng thuê cho phòng ${contract?.roomId?.roomNumber} của tòa nhà ${contract?.buildingId?.name}`;

    const notification = await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title,
      content,
      // type: "contract_signed",
      target: { buildings: [buildingId] },
      link: `/landlord/contracts`,
    });

    //  REALTIME EMIT
    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: notification._id.toString(),
        title,
        content,
        type: notification.type,
        link: notification.link,
        createdAt: notification.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: tenantName,
          role: "resident",
        },
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false,
      })
        .select("accountId")
        .lean();

      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${landlordId}`).emit("unread_count_increment", {
        increment: 1,
      });
      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", {
          increment: 1,
        });
      });
    }
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

    const requestedStart = endDate; // ngày kết thúc cũ
    const requestedEnd = requestedEndDate;

    const roomId = contract.roomId;

    const otherContracts = await Contract.find({
      _id: { $ne: contract._id },
      roomId: roomId,
      status: {
        $in: [
          "draft",
          "sent_to_tenant",
          "signed_by_tenant",
          "signed_by_landlord",
          "completed",
        ],
      },
      "contract.startDate": { $exists: true },
      "contract.endDate": { $exists: true },
    }).lean();

    let conflictContract = null;

    for (const c of otherContracts) {
      const s2 = new Date(c.contract.startDate);
      const e2 = new Date(c.contract.endDate);

      // overlap nếu: start1 <= end2 AND start2 <= end1
      if (requestedStart <= e2 && s2 <= requestedEnd) {
        conflictContract = c;
        break;
      }
    }

    if (conflictContract) {
      // Format tháng/năm theo yêu cầu
      const formatMonth = (d) =>
        `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

      const startStr = formatMonth(
        new Date(conflictContract.contract.startDate)
      );
      const endStr = formatMonth(new Date(conflictContract.contract.endDate));

      return res.status(400).json({
        message: `Phòng đã được đặt trước từ ${startStr} đến ${endStr}. Vui lòng chọn thời gian gia hạn khác.`,
        conflictContractId: conflictContract._id,
      });
    }

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

    //      TẠO THÔNG BÁO
    const landlordId = contract.landlordId?._id;
    const buildingId = contract.buildingId?._id;
    const tenantInfo = await UserInformation.findById(req.user.userInfo).lean();
    const tenantName = tenantInfo?.fullName || "Người thuê";

    const content = `${tenantName} yêu cầu gia hạn hợp đồng thêm ${months} tháng.`;
    const noti = await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Yêu cầu gia hạn hợp đồng",
      content,
      target: { buildings: [buildingId] },
      link: `/landlord/contact-management`,
    });

    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: noti._id.toString(),
        title: noti.title,
        content,
        type: noti.type,
        link: noti.link,
        createdAt: noti.createdAt,
        createBy: {
          id: tenantId.toString(),
          name: tenantName,
          role: "resident",
        },
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false,
      })
        .select("accountId")
        .lean();

      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${landlordId}`).emit("unread_count_increment", {
        increment: 1,
      });
      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", {
          increment: 1,
        });
      });
    }
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

    const numDays = Math.max(Number(days) || 30, 1);

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
          [
            "_id",
            "status",
            "buildingId",
            "roomId",
            "contract.no",
            "contract.startDate",
            "contract.endDate",
            "terminationRequest",
          ].join(" ")
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
      } catch { }
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
  } catch { }
  pdf
    .fontSize(16)
    .text("HỢP ĐỒNG THUÊ PHÒNG", { align: "center", underline: true });

  try {
    pdf.font(FONT_REGULAR);
  } catch { }
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
    `Tại: ${meta.signPlace || (building && building.address) || "................"
    }`
  );

  pdf.moveDown(0.5);

  // ===== BÊN A =====
  pdf.moveDown(0.3);
  try {
    pdf.font(FONT_BOLD);
  } catch { }
  pdf.text("BÊN CHO THUÊ (BÊN A):");
  try {
    pdf.font(FONT_REGULAR);
  } catch { }

  pdf
    .fontSize(11)
    .text(`Họ tên: ${A?.name || ""}`)
    .text(
      `CCCD: ${A?.cccd || ""}   Cấp ngày: ${formatDate(A?.cccdIssuedDate) || ""
      }   Nơi cấp: ${A?.cccdIssuedPlace || ""}`
    )
    .text(`Hộ khẩu thường trú: ${A?.permanentAddress || ""}`)
    .text(`Điện thoại: ${A?.phone || ""}`)
    .text(`Email: ${A?.email || ""}`);

  // ===== BÊN B =====
  pdf.moveDown(0.6);
  try {
    pdf.font(FONT_BOLD);
  } catch { }
  pdf.text("BÊN THUÊ (BÊN B):");
  try {
    pdf.font(FONT_REGULAR);
  } catch { }

  pdf
    .fontSize(11)
    .text(`Họ tên: ${B?.name || ""}`)
    .text(
      `CCCD: ${B?.cccd || ""}   Cấp ngày: ${formatDate(B?.cccdIssuedDate) || ""
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
    } catch { }
    pdf.text("Người ở cùng (roommates):");
    try {
      pdf.font(FONT_REGULAR);
    } catch { }

    roommates.forEach((r, idx) => {
      pdf
        .fontSize(11)
        .text(
          `${idx + 1}. ${r.name || ""} – CCCD: ${r.cccd || ""} – Điện thoại: ${r.phone || ""
          }`
        );
    });
  }

  // ===== THÔNG TIN PHÒNG & GIÁ =====
  pdf.moveDown(0.8);
  try {
    pdf.font(FONT_BOLD);
  } catch { }
  pdf.text("THÔNG TIN PHÒNG VÀ GIÁ THUÊ:");
  try {
    pdf.font(FONT_REGULAR);
  } catch { }

  const buildingName = building?.name || "";
  const roomNumber = room?.roomNumber || "";
  const area = room?.area;
  pdf
    .fontSize(11)
    .text(
      `Tòa nhà: ${buildingName} – Địa chỉ: ${building?.address || "................................"
      }`
    )
    .text(`Phòng: ${roomNumber}    Diện tích: ${area || ""} m²`)
    .text(`Giá thuê: ${meta.price?.toLocaleString("vi-VN") || ""} VND/tháng`)
    .text(
      `Tiền cọc: ${meta.deposit?.toLocaleString("vi-VN") || ""
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
    } catch { }
    pdf.text("Phương tiện gửi kèm:");
    try {
      pdf.font(FONT_REGULAR);
    } catch { }

    bikes.forEach((b, idx) => {
      pdf
        .fontSize(11)
        .text(
          `${idx + 1}. Biển số: ${b.bikeNumber || ""} – Màu: ${b.color || ""
          } – Hãng: ${b.brand || ""}`
        );
    });
  }

  // ===== ĐIỀU KHOẢN (terms snapshot) =====
  if (terms.length) {
    pdf.moveDown(1);
    try {
      pdf.font(FONT_BOLD);
    } catch { }
    pdf.fontSize(13).text("I. ĐIỀU KHOẢN HỢP ĐỒNG", { underline: true });
    try {
      pdf.font(FONT_REGULAR);
    } catch { }
    pdf.moveDown(0.5);

    const sortedTerms = [...terms].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    sortedTerms.forEach((t, idx) => {
      try {
        pdf.font(FONT_BOLD);
      } catch { }
      pdf.fontSize(12).text(`${idx + 1}. ${t.name || "Điều khoản"}`);
      try {
        pdf.font(FONT_REGULAR);
      } catch { }

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
            } catch { }
            pdf.fontSize(11).text(prefix, { continued: true });
            try {
              pdf.font(FONT_REGULAR);
            } catch { }
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
    } catch { }
    pdf.fontSize(13).text("II. NỘI QUY / QUY ĐỊNH", { underline: true });
    try {
      pdf.font(FONT_REGULAR);
    } catch { }
    pdf.moveDown(0.5);

    const sortedRegs = [...regulations].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    sortedRegs.forEach((r, idx) => {
      try {
        pdf.font(FONT_BOLD);
      } catch { }
      pdf.fontSize(12).text(`${idx + 1}. ${r.title || "Quy định"}`);
      try {
        pdf.font(FONT_REGULAR);
      } catch { }

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
            } catch { }
            pdf.fontSize(11).text(prefix, { continued: true });
            try {
              pdf.font(FONT_REGULAR);
            } catch { }
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
  } catch { }
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
  } catch { }
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
  } catch { }
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
    if (!id) {
      return res.status(400).json({ message: "Thiếu id" });
    }
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
    } catch { }
  }
};
// PATCH /tenants/contracts/:id/request-terminate
exports.requestTerminate = async (req, res) => {
  try {
    const tenantId = req.user?._id;
    const { id } = req.params;
    const { reason, note } = req.body || {};
    if (!id) {
      return res.status(404).json({ message: "Thiếu id" });
    }
    if (!reason || String(reason).trim() === "") {
      return res
        .status(400)
        .json({ message: "Lý do huỷ hợp đồng là bắt buộc" });
    }

    const contract = await Contract.findOne({ _id: id, tenantId })
      .populate("buildingId", "name")
      .populate("roomId", "roomNumber");
    if (!contract) {
      return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    }

    if (contract.status !== "completed") {
      return res.status(400).json({
        message:
          "Chỉ được gửi yêu cầu chấm dứt khi hợp đồng đang hiệu lực (completed)",
      });
    }

    // Nếu đã có request pending
    if (
      contract.terminationRequest &&
      contract.terminationRequest.status === "pending"
    ) {
      return res.status(400).json({
        message: "Bạn đang có yêu cầu chấm dứt hợp đồng đang chờ xử lý",
      });
    }

    // Tạo yêu cầu mới
    contract.terminationRequest = {
      reason,
      note: note || "",
      status: "pending",
      requestedAt: new Date(),
      requestedById: tenantId,
    };

    await contract.save();

    // Thông báo landlord
    const buildingId = contract.buildingId;
    const landlordId = contract.landlordId?._id || contract.landlordId;

    const noti = await Notification.create({
      landlordId,
      createBy: tenantId,
      createByRole: "resident",
      title: "Yêu cầu chấm dứt hợp đồng",
      content: `Người thuê yêu cầu chấm dứt hợp đồng phòng ${contract?.roomId?.roomNumber} của tòa nhà ${contract?.buildingId?.name}`,
      target: { buildings: [buildingId] },
      link: `/landlord/contact-management`,
    });
    const io = req.app.get("io");
    if (io) {
      const payload = {
        id: noti._id.toString(),
        title: noti.title,
        content: noti.content,
        type: noti.type,
        link: noti.link,
        createdAt: noti.createdAt,
        createBy: {
          id: tenantId.toString(),
          role: "resident",
        },
      };

      io.to(`user:${landlordId}`).emit("new_notification", payload);

      const staffList = await Staff.find({
        assignedBuildings: buildingId,
        isDeleted: false,
      })
        .select("accountId")
        .lean();

      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("new_notification", payload);
      });

      io.to(`user:${landlordId}`).emit("unread_count_increment", {
        increment: 1,
      });
      staffList.forEach((staff) => {
        io.to(`user:${staff.accountId}`).emit("unread_count_increment", {
          increment: 1,
        });
      });
    }
    res.json({
      message: "Đã gửi yêu cầu chấm dứt hợp đồng",
      terminationRequest: contract.terminationRequest,
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};
