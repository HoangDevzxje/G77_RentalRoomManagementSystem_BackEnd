const cron = require("node-cron");
const Room = require("../models/Room");
const Invoice = require("../models/Invoice");
const Contract = require("../models/Contract"); // Nhớ import Contract
const InvoiceController = require("../controllers/Landlord/InvoiceController");

module.exports = () => {
  cron.schedule("5 0 1 * *", async () => {
    console.log("🔄 [MONTHLY CRON] Running monthly invoice generator...");

    try {
      // Xác định tháng cần tạo hóa đơn (là tháng trước)
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodMonth = lastMonth.getMonth() + 1;
      const periodYear = lastMonth.getFullYear();

      // Lấy danh sách phòng đang thuê
      const rooms = await Room.find({
        status: "rented",
        isDeleted: false,
      })
        .select("_id buildingId roomNumber")
        .populate({ path: "buildingId", select: "landlordId" })
        .lean();

      let successCount = 0;
      let skippedCount = 0; // Đếm số lượng bỏ qua do đã có hóa đơn

      for (const room of rooms) {
        const landlordId = room.buildingId?.landlordId;
        if (!landlordId) continue;

        // --- ĐOẠN MỚI THÊM: KIỂM TRA TRÙNG LẶP ---
        // Kiểm tra xem phòng này đã được Job hàng ngày tạo hóa đơn trước đó chưa
        const existingInvoice = await Invoice.exists({
          roomId: room._id,
          periodMonth,
          periodYear,
          isDeleted: false,
        });

        if (existingInvoice) {
          // Nếu đã có hóa đơn (do Job hàng ngày tạo khi sắp hết hạn), thì bỏ qua
          skippedCount++;
          continue;
        }
        // ------------------------------------------

        const fakeReq = {
          user: { _id: landlordId },
          body: {
            roomId: room._id,
            periodMonth,
            periodYear,
            includeRent: true,
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
              console.log(
                `[MONTHLY CRON] Failed Room ${room.roomNumber}:`,
                payload?.message
              );
            }
          },
        };

        await InvoiceController.generateMonthlyInvoice(fakeReq, fakeRes);
      }

      console.log(
        `[MONTHLY CRON] Done. Created: ${successCount}, Skipped (Already created): ${skippedCount}`
      );
    } catch (err) {
      console.error("[MONTHLY CRON] Error:", err);
    }
  });

  cron.schedule("0 1 * * *", async () => {
    console.log("🔄 [DAILY CRON] Checking for contracts ending soon...");
    try {
      const today = new Date();

      // Tìm trong khoảng 1-2 ngày tới
      const startRange = new Date(today);
      startRange.setDate(today.getDate() + 1); 
      startRange.setHours(0, 0, 0, 0);

      const endRange = new Date(today);
      endRange.setDate(today.getDate() + 2); 
      endRange.setHours(23, 59, 59, 999);

      // Tìm các hợp đồng active/completed sắp hết hạn trong khoảng trên
      const expiringContracts = await Contract.find({
        status: { $in: ["active", "completed"] },
        "contract.endDate": { $gte: startRange, $lte: endRange },
        isDeleted: false,
      })
        .populate("roomId")
        .lean();

      if (!expiringContracts.length) return;

      console.log(
        `[DAILY CRON] Found ${expiringContracts.length} contracts ending soon.`
      );

      for (const contract of expiringContracts) {
        if (!contract.roomId) continue;

        // Xác định kỳ hóa đơn dựa trên ngày kết thúc hợp đồng
        const endDate = new Date(contract.contract.endDate);
        const periodMonth = endDate.getMonth() + 1;
        const periodYear = endDate.getFullYear();

        // Kiểm tra xem đã có hóa đơn chưa (để tránh tạo trùng nếu chạy lại)
        const existingInvoice = await Invoice.findOne({
          roomId: contract.roomId._id,
          periodMonth,
          periodYear,
          isDeleted: false,
        });

        if (existingInvoice) continue;

        console.log(
          `[DAILY CRON] Generating early invoice for Room ${contract.roomId.roomNumber}`
        );

        // Tạo hóa đơn sớm (chưa có điện nước, chỉ có tiền phòng)
        // Vì hợp đồng chưa hết hạn nên controller sẽ lấy được tenantId chính xác
        const fakeReq = {
          user: { _id: contract.landlordId },
          body: {
            roomId: contract.roomId._id,
            periodMonth,
            periodYear,
            includeRent: true,
          },
        };

        const fakeRes = {
          status: () => fakeRes,
          json: () => {}, // Silent success
        };

        await InvoiceController.generateMonthlyInvoice(fakeReq, fakeRes);
      }
    } catch (err) {
      console.error("[DAILY CRON] Error:", err);
    }
  });
};
