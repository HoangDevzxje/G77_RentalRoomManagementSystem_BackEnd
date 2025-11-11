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

    // === TÒA NHÀ ===
    { code: 'building:view', name: 'Xem', group: 'Tòa nhà', action: 'view' },
    { code: 'building:edit', name: 'Sửa', group: 'Tòa nhà', action: 'edit' },

    //building service
    { code: 'service:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'service:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'service:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'service:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },

    //booking
    { code: 'booking:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'booking:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'booking:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'booking:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },

    //building furniture
    { code: 'building-furniture:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'building-furniture:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'building-furniture:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'building-furniture:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //contact
    { code: 'contact:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'contact:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'contact:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'contact:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //contract
    { code: 'contract:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'contract:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'contract:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'contract:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //floor
    { code: 'floor:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'floor:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'floor:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'floor:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //furniture
    { code: 'furniture:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'furniture:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'furniture:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'furniture:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //post
    { code: 'post:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'post:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'post:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'post:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //regulation
    { code: 'regulation:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'regulation:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'regulation:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'regulation:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //room-furniture
    { code: 'room-furniture:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'room-furniture:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'room-furniture:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'room-furniture:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //SCHEDULE
    { code: 'schedule:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'schedule:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'schedule:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'schedule:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //mainten
    { code: 'maintenance:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'maintenance:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'maintenance:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'maintenance:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },
    //revenue-expenditure
    { code: 'revenue-expenditure:view', name: 'Xem', group: 'Dịch vụ', action: 'view' },
    { code: 'revenue-expenditure:create', name: 'Thêm', group: 'Dịch vụ', action: 'create' },
    { code: 'revenue-expenditure:edit', name: 'Sửa', group: 'Dịch vụ', action: 'edit' },
    { code: 'revenue-expenditure:delete', name: 'Xóa', group: 'Dịch vụ', action: 'delete' },

    // === BÁO CÁO ===
    { code: 'report:view', name: 'Xem báo cáo', group: 'Báo cáo', action: 'view' },
    // === HÓA ĐƠN ===
    { code: 'invoice:view', name: 'Xem', group: 'Hóa đơn', action: 'view' },
    { code: 'invoice:create', name: 'Tạo', group: 'Hóa đơn', action: 'create' },
    { code: 'invoice:edit', name: 'Sửa', group: 'Hóa đơn', action: 'edit' },

    // === CƯ DÂN ===
    { code: 'resident:view', name: 'Xem', group: 'Cư dân', action: 'view' },
    { code: 'resident:edit', name: 'Sửa', group: 'Cư dân', action: 'edit' },
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