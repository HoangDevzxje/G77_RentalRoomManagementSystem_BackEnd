const cron = require("node-cron");
const Invoice = require("../models/Invoice");

// Chạy lúc 02:00 sáng mỗi ngày
cron.schedule("0 2 * * *", async () => {
  console.log("[CRON] Checking overdue invoices...");

  try {
    const now = new Date();

    const result = await Invoice.updateMany(
      {
        status: { $in: ["sent"] },
        dueDate: { $lt: now },
      },
      {
        $set: { status: "overdue" },
      }
    );

    console.log(
      `[CRON] Marked ${
        result.modifiedCount || result.nModified || 0
      } invoice(s) as overdue`
    );
  } catch (err) {
    console.error("[CRON] Error when marking overdue invoices:", err);
  }
});
