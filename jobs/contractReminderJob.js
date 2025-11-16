const cron = require("node-cron");
const Contract = require("../models/Contract");
const Account = require("../models/Account");

// TODO: thay thế bằng hệ thống gửi thông báo thực tế (email, push, in-app...)
async function sendReminderNotification({ contract, tenant, landlord }) {
  console.log(
    `[REMINDER] Contract ${contract._id} for tenant ${
      tenant?.email
    } will expire on ${contract.contract.endDate.toISOString()}`
  );

  // Ví dụ: nếu bạn có Notification model
  // await Notification.create({
  //   userId: tenant._id,
  //   type: "contract_upcoming_expire",
  //   title: "Hợp đồng sắp hết hạn",
  //   message: `Hợp đồng phòng ${contract.roomId} sẽ hết hạn vào ${new Date(
  //     contract.contract.endDate
  //   ).toLocaleDateString("vi-VN")}. Nếu bạn muốn tiếp tục ở, vui lòng gửi yêu cầu gia hạn.`,
  //   data: { contractId: contract._id },
  // });
}

// Chạy lúc 09:00 sáng mỗi ngày
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
