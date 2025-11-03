const cron = require('node-cron');
const Subscription = require('../../models/Subscription');

let isRunning = false;

/**
 * Cron job: Tự động chuyển subscription 'active' → 'expired' khi hết hạn
 * Chạy mỗi ngày lúc 0h00
 */
const startExpirationJob = () => {
    cron.schedule('0 0 * * *', async () => {
        if (isRunning) {
            console.log('Cron: Đang chạy, bỏ qua lần này...');
            return;
        }

        isRunning = true;
        console.log('Cron: Bắt đầu kiểm tra subscription hết hạn...');

        try {
            const now = new Date();

            const result = await Subscription.updateMany(
                {
                    status: 'active',
                    endDate: { $lt: now }
                },
                {
                    $set: { status: 'expired' }
                }
            );

            console.log(`Cron: Đã cập nhật ${result.modifiedCount} subscription thành 'expired'`);
        } catch (err) {
            console.error('Cron: Lỗi khi cập nhật trạng thái hết hạn:', err);
        } finally {
            isRunning = false;
        }
    });

    console.log('Cron: Job kiểm tra hết hạn đã được lên lịch (0h hàng ngày)');
};

module.exports = { startExpirationJob };