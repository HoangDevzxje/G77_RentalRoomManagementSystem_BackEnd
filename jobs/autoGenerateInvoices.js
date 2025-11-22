const cron = require("node-cron");
const Room = require("../models/Room");
const Invoice = require("../models/Invoice");
const UtilityReading = require("../models/UtilityReading");
const Building = require("../models/Building");
const Contract = require("../models/Contract");
const InvoiceController = require("../controllers/Landlord/InvoiceController");

module.exports = () => {
  // 00:05 sáng ngày 1 hàng tháng
  cron.schedule("5 0 1 * *", async () => {
    console.log("🔄 [CRON] Running monthly invoice generator...");

    try {
      //TÍNH THÁNG TRƯỚC
      const now = new Date();
      // ngày 1 của tháng hiện tại, sau đó lùi 1 tháng
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const periodMonth = lastMonth.getMonth() + 1; // 1–12
      const periodYear = lastMonth.getFullYear();

      // Lấy danh sách phòng đang thuê
      const rooms = await Room.find({
        status: "rented",
        isDeleted: false,
      })
        .select("_id buildingId")
        .populate({ path: "buildingId", select: "landlordId" })
        .lean();

      let successCount = 0;
      let failCount = 0;

      for (const room of rooms) {
        const landlordId = room.buildingId?.landlordId;
        if (!landlordId) {
          console.warn(
            `[CRON] Bỏ qua phòng ${room._id} vì không xác định được landlord`
          );
          continue;
        }

        const fakeReq = {
          user: { _id: landlordId },
          body: {
            roomId: room._id,
            periodMonth,
            periodYear,
            includeRent: true, // tuỳ business, thường là true
          },
        };

        const fakeRes = {
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(payload) {
            if (this.statusCode >= 200 && this.statusCode < 300) {
              successCount++;
            } else {
              failCount++;
              console.log(
                `[CRON] Tạo hoá đơn FAILED cho phòng ${room._id}:`,
                payload?.message || payload
              );
            }
          },
        };

        await InvoiceController.generateMonthlyInvoice(fakeReq, fakeRes);
      }

      console.log(
        `[CRON] Kết thúc tạo hóa đơn tháng ${periodMonth}/${periodYear}. Thành công: ${successCount}, Thất bại: ${failCount}`
      );
    } catch (err) {
      console.error("[CRON ERROR] autoGenerateInvoices:", err);
    }
  });
};
