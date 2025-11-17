const cron = require('node-cron');
const Subscription = require('../../models/Subscription');

let isRunning = false;

/**
 * Cron job tự động:
 * 1. Chuyển 'active' → 'expired' khi hết hạn
 * 2. Chuyển 'upcoming' → 'active' khi đến ngày bắt đầu
 * Chạy mỗi ngày lúc 0h00
 */
const startExpirationJob = () => {
    cron.schedule('0 0 * * *', async () => {
        if (isRunning) {
            console.log('Cron: Đang chạy, bỏ qua lần này...');
            return;
        }

        isRunning = true;
        console.log('Cron: Bắt đầu xử lý subscription...');

        try {
            const now = new Date();

            const expired = await Subscription.updateMany(
                {
                    status: 'active',
                    endDate: { $lt: now }
                },
                { $set: { status: 'expired' } }
            );

            const activated = await Subscription.updateMany(
                {
                    status: 'upcoming',
                    startDate: { $lte: now }
                },
                { $set: { status: 'active' } }
            );

            console.log(`Cron: Expired = ${expired.modifiedCount}, Activated upcoming = ${activated.modifiedCount}`);
        } catch (err) {
            console.error('Cron: Lỗi khi xử lý subscription:', err);
        } finally {
            isRunning = false;
        }
    });

    console.log('Cron: Job kiểm tra hết hạn & kích hoạt gói đã được lên lịch (0h hàng ngày)');
};

module.exports = { startExpirationJob };