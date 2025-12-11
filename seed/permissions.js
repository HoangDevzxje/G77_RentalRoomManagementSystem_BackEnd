const DB = require('../configs/db');
const Permission = require('../models/Permission');
require("dotenv").config();
const permissions = [
    // === PHÒNG ===
    { code: 'room:view', name: 'Xem', group: 'Phòng', action: 'view' },
    { code: 'room:create', name: 'Thêm', group: 'Phòng', action: 'create' },
    { code: 'room:edit', name: 'Sửa', group: 'Phòng', action: 'edit' },
    { code: 'room:delete', name: 'Xóa', group: 'Phòng', action: 'delete' },

    //term
    { code: 'term:view', name: 'Xem', group: 'Điều khoản', action: 'view' },
    { code: 'term:create', name: 'Thêm', group: 'Điều khoản', action: 'create' },
    { code: 'term:edit', name: 'Sửa', group: 'Điều khoản', action: 'edit' },
    { code: 'term:delete', name: 'Xóa', group: 'Điều khoản', action: 'delete' },

    //building service
    { code: 'service:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'service:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'service:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'service:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },

    //booking
    { code: 'booking:view', name: 'Xem', group: 'Lịch xem phòng', action: 'view' },
    { code: 'booking:create', name: 'Thêm', group: 'Lịch xem phòng', action: 'create' },
    { code: 'booking:edit', name: 'Sửa', group: 'Lịch xem phòng', action: 'edit' },
    { code: 'booking:delete', name: 'Xóa', group: 'Lịch xem phòng', action: 'delete' },

    //building furniture
    // { code: 'building-furniture:view', name: 'Xem', group: 'Nội thất tòa nhà', action: 'view' },
    // { code: 'building-furniture:create', name: 'Thêm', group: 'Nội thất tòa nhà', action: 'create' },
    // { code: 'building-furniture:edit', name: 'Sửa', group: 'Nội thất tòa nhà', action: 'edit' },
    // { code: 'building-furniture:delete', name: 'Xóa', group: 'Nội thất tòa nhà', action: 'delete' },
    //contact
    { code: 'contact:view', name: 'Xem', group: 'Yêu cầu tạo hợp đồng', action: 'view' },
    { code: 'contact:create', name: 'Thêm', group: 'Yêu cầu tạo hợp đồng', action: 'create' },
    { code: 'contact:edit', name: 'Sửa', group: 'Yêu cầu tạo hợp đồng', action: 'edit' },
    { code: 'contact:delete', name: 'Xóa', group: 'Yêu cầu tạo hợp đồng', action: 'delete' },
    //contract
    { code: 'contract:view', name: 'Xem', group: 'Hợp đồng', action: 'view' },
    { code: 'contract:create', name: 'Thêm', group: 'Hợp đồng', action: 'create' },
    { code: 'contract:edit', name: 'Sửa', group: 'Hợp đồng', action: 'edit' },
    { code: 'contract:delete', name: 'Xóa', group: 'Hợp đồng', action: 'delete' },
    //floor
    { code: 'floor:view', name: 'Xem', group: 'Tầng', action: 'view' },
    { code: 'floor:create', name: 'Thêm', group: 'Tầng', action: 'create' },
    { code: 'floor:edit', name: 'Sửa', group: 'Tầng', action: 'edit' },
    { code: 'floor:delete', name: 'Xóa', group: 'Tầng', action: 'delete' },
    //furniture
    { code: 'furniture:view', name: 'Xem', group: 'Nội thất', action: 'view' },
    { code: 'furniture:create', name: 'Thêm', group: 'Nội thất', action: 'create' },
    { code: 'furniture:edit', name: 'Sửa', group: 'Nội thất', action: 'edit' },
    { code: 'furniture:delete', name: 'Xóa', group: 'Nội thất', action: 'delete' },
    //post
    { code: 'post:view', name: 'Xem', group: 'Bài đăng', action: 'view' },
    { code: 'post:create', name: 'Thêm', group: 'Bài đăng', action: 'create' },
    { code: 'post:edit', name: 'Sửa', group: 'Bài đăng', action: 'edit' },
    { code: 'post:delete', name: 'Xóa', group: 'Bài đăng', action: 'delete' },
    //regulation
    { code: 'regulation:view', name: 'Xem', group: 'Nội quy', action: 'view' },
    { code: 'regulation:create', name: 'Thêm', group: 'Nội quy', action: 'create' },
    { code: 'regulation:edit', name: 'Sửa', group: 'Nội quy', action: 'edit' },
    { code: 'regulation:delete', name: 'Xóa', group: 'Nội quy', action: 'delete' },
    //room-furniture
    // { code: 'room-furniture:view', name: 'Xem', group: 'Nội thất phòng', action: 'view' },
    // { code: 'room-furniture:create', name: 'Thêm', group: 'Nội thất phòng', action: 'create' },
    // { code: 'room-furniture:edit', name: 'Sửa', group: 'Nội thất phòng', action: 'edit' },
    // { code: 'room-furniture:delete', name: 'Xóa', group: 'Nội thất phòng', action: 'delete' },
    //SCHEDULE
    { code: 'schedule:view', name: 'Xem', group: 'Quản lý lịch rảnh', action: 'view' },
    { code: 'schedule:create', name: 'Thêm', group: 'Quản lý lịch rảnh', action: 'create' },
    { code: 'schedule:edit', name: 'Sửa', group: 'Quản lý lịch rảnh', action: 'edit' },
    { code: 'schedule:delete', name: 'Xóa', group: 'Quản lý lịch rảnh', action: 'delete' },
    //mainten
    { code: 'maintenance:view', name: 'Xem', group: 'Bảo trì', action: 'view' },
    { code: 'maintenance:create', name: 'Thêm', group: 'Bảo trì', action: 'create' },
    { code: 'maintenance:edit', name: 'Sửa', group: 'Bảo trì', action: 'edit' },
    { code: 'maintenance:delete', name: 'Xóa', group: 'Bảo trì', action: 'delete' },
    //revenue-expenditure
    { code: 'revenue-expenditure:view', name: 'Xem', group: 'Thu chi', action: 'view' },
    { code: 'revenue-expenditure:create', name: 'Thêm', group: 'Thu chi', action: 'create' },
    { code: 'revenue-expenditure:edit', name: 'Sửa', group: 'Thu chi', action: 'edit' },
    { code: 'revenue-expenditure:delete', name: 'Xóa', group: 'Thu chi', action: 'delete' },

    { code: 'notification:view', name: 'Xem', group: 'Thông báo', action: 'view' },
    { code: 'notification:create', name: 'Thêm', group: 'Thông báo', action: 'create' },
    { code: 'notification:edit', name: 'Sửa', group: 'Thông báo', action: 'edit' },
    { code: 'notification:delete', name: 'Xóa', group: 'Thông báo', action: 'delete' },

    { code: 'rating:view', name: 'Xem', group: 'Đánh giá', action: 'view' },
    { code: 'rating:create', name: 'Thêm', group: 'Đánh giá', action: 'create' },
    { code: 'rating:edit', name: 'Sửa', group: 'Đánh giá', action: 'edit' },
    { code: 'rating:delete', name: 'Xóa', group: 'Đánh giá', action: 'delete' },

    { code: 'resident:view', name: 'Xem', group: 'Cư dân', action: 'view' },
    { code: 'resident:create', name: 'Thêm', group: 'Cư dân', action: 'create' },
    { code: 'resident:edit', name: 'Sửa', group: 'Cư dân', action: 'edit' },
    { code: 'resident:delete', name: 'Xóa', group: 'Cư dân', action: 'delete' },

    { code: 'utility:view', name: 'Xem', group: 'Điện nước', action: 'view' },
    { code: 'utility:create', name: 'Thêm', group: 'Điện nước', action: 'create' },
    { code: 'utility:edit', name: 'Sửa', group: 'Điện nước', action: 'edit' },
    { code: 'utility:delete', name: 'Xóa', group: 'Điện nước', action: 'delete' },

    // === HÓA ĐƠN ===
    { code: 'invoice:view', name: 'Xem', group: 'Hóa đơn', action: 'view' },
    { code: 'invoice:create', name: 'Tạo', group: 'Hóa đơn', action: 'create' },
    { code: 'invoice:edit', name: 'Sửa', group: 'Hóa đơn', action: 'edit' },
    { code: 'invoice:delete', name: 'Xóa', group: 'Hóa đơn', action: 'delete' },

];

const seedPermissions = async () => {
    try {
        await DB.connectDB();
        console.log('Kết nối DB thành công (seed)');

        const count = await Permission.countDocuments();
        if (count > 0) {
            console.log(`Đã có ${count} quyền → BỎ QUA SEED`);
            process.exit(0);
        }

        const result = await Permission.insertMany(permissions);
        console.log(`ĐÃ TẠO THÀNH CÔNG ${result.length} QUYỀN`);

        console.log('\nDanh sách quyền:');
        result.forEach(p => console.log(`   [${p.group}] ${p.name} → ${p.code}`));

        console.log('\nSEED HOÀN TẤT!');
        process.exit(0);
    } catch (error) {
        console.error('LỖI SEED:', error.message);
        process.exit(1);
    }
};

seedPermissions();