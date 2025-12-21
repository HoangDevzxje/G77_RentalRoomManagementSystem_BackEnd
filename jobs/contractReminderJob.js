const cron = require("node-cron");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const Staff = require("../models/Staff");
const Room = require("../models/Room");

const getIo = () => global._io;

async function sendReminderNotification({ contract, tenant, landlord }) {
  const io = getIo();

  if (!tenant && !landlord) {
    console.log(`[CRON] Skip contract ${contract._id} - no tenant or landlord`);
    return;
  }

  const room = await Room.findById(contract.roomId).select("roomNumber").lean();
  const landlordId = landlord?._id?.toString();
  const tenantId = tenant?._id?.toString();
  const buildingId = contract.buildingId?._id?.toString();

  if (!landlordId) {
    console.log(`[CRON] Skip - missing landlordId for contract ${contract._id}`);
    return;
  }

  const endDateStr = new Date(contract.contract.endDate).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (tenantId) {
    const notiResident = await Notification.create({
      landlordId,
      createByRole: "system",
      title: "Hợp đồng sắp hết hạn",
      content: `Hợp đồng thuê phòng của bạn sẽ hết hạn vào ngày ${endDateStr}. Vui lòng liên hệ chủ trọ để gia hạn nếu muốn tiếp tục ở.`,
      type: "reminder",
      target: { residents: [tenantId] },
      createdAt: new Date(),
    });

    if (io) {
      io.to(`user:${tenantId}`).emit("new_notification", {
        _id: notiResident._id,
        title: notiResident.title,
        content: notiResident.content,
        type: notiResident.type,
        createdAt: notiResident.createdAt,
        createBy: { role: "system" },
      });

      io.to(`user:${tenantId}`).emit("unread_count_increment", { increment: 1 });
      console.log(`[CRON] Sent reminder to resident ${tenantId}`);
    }
  }

  const staffList = await Staff.find({
    assignedBuildings: { $in: [buildingId] },
    isDeleted: false,
  })
    .select("accountId")
    .lean();

  const staffIds = staffList.map((s) => s.accountId.toString()).filter(Boolean);
  const receivers = [...new Set([landlordId, ...staffIds])].filter(Boolean);

  if (receivers.length > 0) {
    const tenantName = tenant?.userInfo?.fullName || tenant?.B?.name || "khách thuê";

    const notiLandlord = await Notification.create({
      landlordId,
      createByRole: "system",
      title: "Hợp đồng sắp hết hạn",
      content: `Hợp đồng của ${tenantName} (phòng ${room?.roomNumber || "N/A"}) sẽ hết hạn vào ngày <strong>${endDateStr}</strong>.`,
      type: "reminder",
      target: { residents: receivers },
      link: "/landlord/contracts",
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

  console.log(`[CRON] Successfully processed reminder for contract ${contract._id}`);
}

// CRON: Chạy mỗi ngày lúc 9:00 sáng */10 * * * * *
cron.schedule("0 9 * * *", async () => {
  console.log("[CRON] Bắt đầu kiểm tra hợp đồng sắp hết hạn (trước 30 ngày)...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);
    in30Days.setHours(23, 59, 59, 999);

    const contracts = await Contract.find({
      status: "completed",
      "contract.endDate": {
        $gte: today,
        $lte: in30Days,
      },
    })
      .populate("tenantId", "userInfo fullName")
      .populate("landlordId")
      .populate("buildingId")
      .lean();

    console.log(`[CRON] Tìm thấy ${contracts.length} hợp đồng sẽ hết hạn trong 30 ngày tới`);

    if (contracts.length === 0) return;

    for (const contract of contracts) {
      await sendReminderNotification({
        contract,
        tenant: contract.tenantId,
        landlord: contract.landlordId,
      });
    }

    console.log(`[CRON] Hoàn tất gửi ${contracts.length} thông báo nhắc nhở hợp đồng`);
  } catch (error) {
    console.error("[CRON] Lỗi khi gửi thông báo nhắc nhở hợp đồng:", error);
  }
},

  {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
  });

console.log("[CRON] Đã khởi động job nhắc nhở hợp đồng sắp hết hạn (mỗi 9h sáng)");