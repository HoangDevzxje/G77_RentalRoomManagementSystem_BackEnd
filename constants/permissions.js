/**
 * Tất cả mã quyền trong hệ thống
 * Đồng bộ 1:1 với seed/permissions.js
 * Dùng trong: middleware, route, UI, seed, test...
 */
const PERMISSIONS = {

    // === PHÒNG ===
    ROOM_VIEW: "room:view",
    ROOM_CREATE: "room:create",
    ROOM_EDIT: "room:edit",
    ROOM_DELETE: "room:delete",

    // === TÒA NHÀ ===
    BUILDING_VIEW: "building:view",
    BUILDING_EDIT: "building:edit",

    // dịch vụ tòa nhà
    SERVICE_VIEW: "service:view",
    SERVICE_CREATE: "service:create",
    SERVICE_EDIT: "service:edit",
    SERVICE_DELETE: "service:delete",

    // booking
    BOOKING_VIEW: "booking:view",
    BOOKING_CREATE: "booking:create",
    BOOKING_EDIT: "booking:edit",
    BOOKING_DELETE: "booking:delete",

    // Building furnitare
    BUILDING_FURNITURE_VIEW: "building-furniture:view",
    BUILDING_FURNITURE_CREATE: "building-furniture:create",
    BUILDING_FURNITURE_EDIT: "building-furniture:edit",
    BUILDING_FURNITURE_DELETE: "building-furniture:delete",

    // contact
    CONTACT_VIEW: "contact:view",
    CONTACT_CREATE: "contact:create",
    CONTACT_EDIT: "contact:edit",
    CONTACT_DELETE: "contact:delete",
    // contract
    CONTRACT_VIEW: "contract:view",
    CONTRACT_CREATE: "contract:create",
    CONTRACT_EDIT: "contract:edit",
    CONTRACT_DELETE: "contract:delete",
    // floor
    FLOOR_VIEW: "floor:view",
    FLOOR_CREATE: "floor:create",
    FLOOR_EDIT: "floor:edit",
    FLOOR_DELETE: "floor:delete",
    // furniture
    FURNITURE_VIEW: "furniture:view",
    FURNITURE_CREATE: "furniture:create",
    FURNITURE_EDIT: "furniture:edit",
    FURNITURE_DELETE: "furniture:delete",
    // post
    POST_VIEW: "post:view",
    POST_CREATE: "post:create",
    POST_EDIT: "post:edit",
    POST_DELETE: "post:delete",
    //regulation
    REGULATION_VIEW: "regulation:view",
    REGULATION_CREATE: "regulation:create",
    REGULATION_EDIT: "regulation:edit",
    REGULATION_DELETE: "regulation:delete",

    //room-furniture
    ROOM_FURNITURE_VIEW: "room-furniture:view",
    ROOM_FURNITURE_CREATE: "room-furniture:create",
    ROOM_FURNITURE_EDIT: "room-furniture:edit",
    ROOM_FURNITURE_DELETE: "room-furniture:delete",
    //schedule
    SCHEDULE_VIEW: "schedule:view",
    SCHEDULE_CREATE: "schedule:create",
    SCHEDULE_EDIT: "schedule:edit",
    SCHEDULE_DELETE: "schedule:delete",

    //maintenance
    MAINTENANCE_VIEW: "maintenance:view",
    MAINTENANCE_CREATE: "maintenance:create",
    MAINTENANCE_EDIT: "maintenance:edit",
    MAINTENANCE_DELETE: "maintenance:delete",
    //revenue-expenditure
    REVENUE_EXPENDITURE_VIEW: "revenue-expenditure:view",
    REVENUE_EXPENDITURE_CREATE: "revenue-expenditure:create",
    REVENUE_EXPENDITURE_EDIT: "revenue-expenditure:edit",
    REVENUE_EXPENDITURE_DELETE: "revenue-expenditure:delete",
    //notification
    NOTIFICATION_VIEW: "notification:view",
    NOTIFICATION_CREATE: "notification:create",
    NOTIFICATION_EDIT: "notification:edit",
    NOTIFICATION_DELETE: "notification:delete",
    //rating
    RATING_VIEW: "rating:view",
    RATING_CREATE: "rating:create",
    RATING_EDIT: "rating:edit",
    RATING_DELETE: "rating:delete",
    //resident
    RESIDENT_VIEW: "resident:view",
    RESIDENT_CREATE: "resident:create",
    RESIDENT_EDIT: "resident:edit",
    RESIDENT_DELETE: "resident:delete",

    // === HÓA ĐƠN ===
    INVOICE_VIEW: "invoice:view",
    INVOICE_CREATE: "invoice:create",
    INVOICE_EDIT: "invoice:edit",

    // === ĐIỀU KHOẢN (TERM) ===
    TERM_CREATE: "term:create",
    TERM_VIEW: "term:view",
    TERM_EDIT: "term:edit",
    TERM_DELETE: "term:delete",
};

// === GỢI Ý: GOM NHÓM THEO GROUP (DỄ DÙNG TRONG UI) ===
const PERMISSION_GROUPS = {
    "Phòng": [
        PERMISSIONS.ROOM_VIEW,
        PERMISSIONS.ROOM_CREATE,
        PERMISSIONS.ROOM_EDIT,
        PERMISSIONS.ROOM_DELETE,
    ],
    "Tòa nhà": [
        PERMISSIONS.BUILDING_VIEW,
        PERMISSIONS.BUILDING_EDIT,
    ],
    "Thu chi": [
        PERMISSIONS.PAYMENT_VIEW,
        PERMISSIONS.PAYMENT_COLLECT,
        PERMISSIONS.PAYMENT_EDIT,
    ],
    "Báo cáo": [
        PERMISSIONS.REPORT_VIEW,
    ],
    "Nội thất": [
        PERMISSIONS.FURNITURE_VIEW,
        PERMISSIONS.FURNITURE_MANAGE,
    ],
    "Dịch vụ": [
        PERMISSIONS.SERVICE_VIEW,
        PERMISSIONS.SERVICE_MANAGE,
    ],
    "Hóa đơn": [
        PERMISSIONS.INVOICE_VIEW,
        PERMISSIONS.INVOICE_CREATE,
        PERMISSIONS.INVOICE_EDIT,
    ],
    "Cư dân": [
        PERMISSIONS.RESIDENT_VIEW,
        PERMISSIONS.RESIDENT_EDIT,
    ],
    "Hợp đồng": [
        PERMISSIONS.CONTRACT_VIEW,
        PERMISSIONS.CONTRACT_EDIT,
    ],
};

// === XUẤT RA ===
module.exports = {
    PERMISSIONS,
    PERMISSION_GROUPS,
};