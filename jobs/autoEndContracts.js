const cron = require("node-cron");
const Contract = require("../models/Contract");
const Contract = require("../models/Contract");
const Room = require("../models/Room");

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

  if (!forceEvenIfBeforeEndDate && now < endDate) {
    throw new Error("Chưa đến ngày kết thúc hợp đồng (endDate)");
  }

  const room = await Room.findById(contract.roomId);
  if (!room) throw new Error("Không tìm thấy phòng");

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

// Hàm thực thi chính
async function autoEndContractsOnTime() {
  const now = new Date();

  // Cắt về 00:00 cho an toàn so sánh ngày
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  console.log("[CRON] autoEndContractsOnTime start at", now.toISOString());

  // Tìm tất cả hợp đồng completed mà endDate < hôm nay
  const contracts = await Contract.find({
    status: "completed",
    "contract.endDate": { $lt: today },
  })
    .select("_id contract.endDate roomId")
    .lean();

  if (!contracts.length) {
    console.log("[CRON] Không có hợp đồng nào cần kết thúc đúng hạn.");
    return;
  }

  console.log("[CRON] Số hợp đồng cần kết thúc:", contracts.length);

  for (const c of contracts) {
    try {
      await endContractOnTimeInternal(c._id, {
        note: "Cron auto end-on-time",
      });
      console.log(
        `[CRON] Đã kết thúc HĐ ${c._id} (endDate=${c.contract.endDate})`
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

  console.log("[CRON] Đã đăng ký job autoEndContractsOnTime (0 1 * * *)");
}

module.exports = {
  registerAutoEndContractsCron,
  autoEndContractsOnTime, // export thêm nếu muốn trigger 手动
};
