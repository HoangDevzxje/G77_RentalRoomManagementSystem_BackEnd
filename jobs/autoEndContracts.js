const cron = require("node-cron");
const Contract = require("../models/Contract");
const Room = require("../models/Room");

// Số ngày gia hạn "âm thầm" sau endDate trước khi auto-kết thúc
// Có thể chỉnh qua env: CONTRACT_GRACE_DAYS, mặc định = 3
const GRACE_DAYS =
  Number.parseInt(process.env.CONTRACT_GRACE_DAYS || "3", 10) || 3;

async function endContractOnTimeInternal(contractId, options = {}) {
  const { note, forceEvenIfBeforeEndDate = false } = options;

  const contract = await Contract.findById(contractId);
  if (!contract) throw new Error("Không tìm thấy hợp đồng");

  if (contract.status !== "completed") {
    throw new Error(
      "Chỉ kết thúc hợp đồng đúng hạn khi trạng thái là 'completed'"
    );
  }

  if (!contract.contract?.endDate) {
    throw new Error("Hợp đồng chưa có ngày kết thúc (endDate)");
  }

  const now = new Date();
  const endDate = new Date(contract.contract.endDate);

  // Vẫn giữ tuỳ chọn forceEvenIfBeforeEndDate cho các luồng manual
  if (!forceEvenIfBeforeEndDate && now < endDate) {
    throw new Error("Chưa đến ngày kết thúc hợp đồng (endDate)");
  }

  const room = await Room.findById(contract.roomId);
  if (!room) throw new Error("Không tìm thấy phòng");

  // Nếu phòng hiện đang gắn với hợp đồng này → reset
  if (String(room.currentContractId) === String(contract._id)) {
    room.currentContractId = null;
    room.currentTenantIds = [];
    room.status = "available";
    await room.save();
  }

  contract.status = "terminated";
  contract.terminationType = "normal_expiry";
  contract.terminatedAt = now;
  if (note) contract.terminationNote = note;

  await contract.save();

  return { contract, room };
}

// Hàm thực thi chính – giờ là "auto end after GRACE_DAYS"
async function autoEndContractsOnTime() {
  const now = new Date();

  // Cắt về 00:00 hôm nay cho an toàn so sánh theo ngày
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // thresholdDate = hôm nay - GRACE_DAYS
  const thresholdDate = new Date(today);
  thresholdDate.setDate(thresholdDate.getDate() - GRACE_DAYS);

  console.log(
    "[CRON] autoEndContractsOnTime start at",
    now.toISOString(),
    "with GRACE_DAYS =",
    GRACE_DAYS,
    "→ thresholdDate =",
    thresholdDate.toISOString()
  );

  // Tìm tất cả hợp đồng completed mà endDate <= thresholdDate
  // → đã hết hạn ít nhất GRACE_DAYS ngày
  const contracts = await Contract.find({
    status: "completed",
    "contract.endDate": { $lte: thresholdDate },
  })
    .select("_id contract.endDate roomId")
    .lean();

  if (!contracts.length) {
    console.log(
      "[CRON] Không có hợp đồng nào cần auto kết thúc sau thời gian gia hạn."
    );
    return;
  }

  console.log("[CRON] Số hợp đồng cần kết thúc:", contracts.length);

  for (const c of contracts) {
    try {
      await endContractOnTimeInternal(c._id, {
        note: `Cron auto end-on-time after ${GRACE_DAYS} days`,
      });
      console.log(
        `[CRON] Đã kết thúc HĐ ${c._id} (endDate=${c.contract.endDate}) sau thời gian gia hạn ${GRACE_DAYS} ngày`
      );
    } catch (err) {
      console.error(`[CRON] Lỗi khi kết thúc HĐ ${c._id}:`, err.message || err);
    }
  }
}

// Schedule: chạy mỗi ngày lúc 01:00 sáng
function registerAutoEndContractsCron() {
  cron.schedule("0 1 * * *", () => {
    autoEndContractsOnTime().catch((err) => {
      console.error("[CRON] autoEndContractsOnTime global error:", err);
    });
  });

  console.log(
    "[CRON] Đã đăng ký job autoEndContractsOnTime (0 1 * * *), GRACE_DAYS =",
    GRACE_DAYS
  );
}

module.exports = {
  registerAutoEndContractsCron,
  autoEndContractsOnTime,
  endContractOnTimeInternal,
};
