const cron = require("node-cron");
const Contract = require("../models/Contract");
const Invoice = require("../models/Invoice");
const {
  confirmMoveInCore,
} = require("../controllers/Landlord/ContractController");

// Chạy lúc 02:10 sáng mỗi ngày
cron.schedule("10 2 * * *", async () => {
  console.log("[CRON] Auto confirm move-in contracts...");

  try {
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    // Tìm hợp đồng bắt đầu trong ngày hôm nay
    const contracts = await Contract.find({
      status: "completed",
      moveInConfirmedAt: null,
      isDeleted: { $ne: true },
      "contract.startDate": { $gte: startOfDay, $lt: endOfDay },
    }).select("_id contract.startDate contract.deposit");

    console.log(
      `[CRON] Found ${contracts.length} contract(s) to auto-confirm.`
    );

    for (const c of contracts) {
      try {
        const depositAmount = Number(c?.contract?.deposit || 0);
        if (depositAmount > 0) {
          const paidDeposit = await Invoice.findOne({
            contractId: c._id,
            invoiceKind: "deposit",
            status: "paid",
            isDeleted: false,
          })
            .select("_id")
            .lean();

          if (!paidDeposit) {
            console.log(
              "[CRON] Skip auto-confirm (deposit unpaid) contract",
              c._id && c._id.toString()
            );
            continue;
          }
        }

        await confirmMoveInCore(c._id, { mode: "auto", reason: "start_date" });
        console.log(
          "[CRON] Auto-confirmed contract",
          c._id && c._id.toString()
        );
      } catch (err) {
        console.error(
          "[CRON] Error auto-confirming contract",
          c._id && c._id.toString(),
          err.message
        );
      }
    }

    console.log("[CRON] Auto confirm move-in job done.");
  } catch (err) {
    console.error("[CRON] Error in auto confirm move-in job:", err);
  }
});
