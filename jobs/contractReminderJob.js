const cron = require("node-cron");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const Staff = require("../models/Staff");
const Room = require("../models/Room");
async function sendReminderNotification({ contract, tenant, landlord }) {
  const io = global._io;

  const room = await Room.findOne({ _id: contract.roomId }).select("roomNumber");
  const landlordId = contract.landlordId?._id?.toString();
  const tenantId = tenant?._id?.toString();

  const buildingId = contract.buildingId?._id?.toString();
  const endDateStr = new Date(contract.contract.endDate)
    .toLocaleDateString("vi-VN");

  // ==============================
  // 1) GỬI THÔNG BÁO CHO RESIDENT
  // ==============================
  const notiResident = await Notification.create({
    landlordId,
    createByRole: "system",
    title: "Hợp đồng sắp hết hạn",
    content: `Hợp đồng phòng của bạn sẽ hết hạn vào ngày ${endDateStr}. Nếu bạn muốn tiếp tục ở, vui lòng gửi yêu cầu gia hạn.`,
    type: "reminder",
    target: { residents: [tenantId] },
  });

  if (io) {
    io.to(`user:${tenantId}`).emit("new_notification", {
      id: notiResident._id,
      title: notiResident.title,
      content: notiResident.content,
      type: notiResident.type,
      createdAt: notiResident.createdAt,
      createBy: { role: "system" }
    });

    io.to(`user:${tenantId}`).emit("unread_count_increment", { increment: 1 });
  }

  // ==============================
  // 2) GỬI THÔNG BÁO CHO LANDLORD + STAFF
  // ==============================
  const staffList = await Staff.find({
    assignedBuildings: buildingId,
    isDeleted: false
  }).select("accountId");

  const staffIds = staffList.map(s => s.accountId.toString());
  const receivers = [landlordId, ...staffIds];
  const notiLandlord = await Notification.create({
    landlordId,
    createByRole: "system",
    title: "Hợp đồng sắp hết hạn",
    content: `Hợp đồng của ${contract.B?.name} (phòng ${room?.roomNumber}) sẽ hết hạn vào ngày ${endDateStr}.`,
    type: "reminder",
    target: { residents: receivers },
    link: "/landlords/contracts",
  });

  if (io) {
    receivers.forEach(uid => {
      io.to(`user:${uid}`).emit("new_notification", {
        id: notiLandlord._id,
        title: notiLandlord.title,
        content: notiLandlord.content,
        type: notiLandlord.type,
        link: notiLandlord.link,
        createdAt: notiLandlord.createdAt,
        createBy: { role: "system" }
      });

      io.to(`user:${uid}`).emit("unread_count_increment", { increment: 1 });
    });
  }

  console.log(
    `[CRON] Sent reminders for contract ${contract._id}`
  );
}

// Chạy lúc 09:00 */5 * * * * * sáng mỗi ngày
cron.schedule("0 9 * * *", async () => {
  console.log("[CRON] Check upcoming expired contracts (30 days before)");

  const today = new Date();

  // targetDate = hôm nay + 30 ngày
  const target = new Date();
  target.setDate(target.getDate() + 30);

  const startOfDay = new Date(target);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(target);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    // const today = new Date();
    // const in30Days = new Date();
    // in30Days.setDate(today.getDate() + 30);
    // const contracts = await Contract.find({
    //   status: "completed",
    //   "contract.endDate": { $gte: today, $lte: in30Days },
    // })
    const contracts = await Contract.find({
      status: "completed",
      "contract.endDate": { $gte: startOfDay, $lte: endOfDay },
    })
      .populate("tenantId", "email userInfo")
      .populate("landlordId", "email userInfo")
      .lean();

    console.log(
      `[CRON] Found ${contracts.length} contracts expiring in 30 days`
    );

    for (const c of contracts) {
      const tenant = c.tenantId;
      const landlord = c.landlordId;

      await sendReminderNotification({ contract: c, tenant, landlord });
    }
  } catch (err) {
    console.error(
      "[CRON] Error when checking upcoming expired contracts:",
      err
    );
  }
});
