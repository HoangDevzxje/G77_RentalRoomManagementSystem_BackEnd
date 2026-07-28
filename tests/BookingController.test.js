const {
    getAllBookings,
    getBookingDetail,
    updateBookingStatus,
} = require('../controllers/Landlord/BookingManageController');

const Booking = require('../models/Booking');
const Notification = require('../models/Notification');

const landlordId = '507f1f77bcf86cd799439011';
const staffId = '507f1f77bcf86cd799439012';
const tenantId = '507f1f77bcf86cd799439013';
const buildingId = '507f1f77bcf86cd799439014';
const bookingId = '507f1f77bcf86cd799439015';
const fakeId = '60d5ecb74f5e4b0012345678';

const mockRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
});

const mockReq = (override = {}) => ({
    user: { _id: landlordId, role: 'landlord' },
    staff: { assignedBuildingIds: [buildingId] },
    query: {},
    params: {},
    body: {},
    app: { get: jest.fn() },
    ...override,
});

jest.mock("../models/Booking", () => {
    const sampleBooking = {
        _id: bookingId,
        landlordId,
        tenantId,
        buildingId: { _id: buildingId, name: "Tòa A" },
        postId: { title: "Phòng trọ đẹp" },
        status: "pending",
        landlordNote: null,
        isDeleted: false,
        save: jest.fn().mockResolvedValue(true),
    };

    const Booking = jest.fn(() => ({
        ...sampleBooking,
        save: jest.fn().mockResolvedValue(true),
    }));

    Booking.find = jest.fn(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([sampleBooking]),
    }));

    Booking.countDocuments = jest.fn().mockResolvedValue(15);

    Booking.findOne = jest.fn(({ _id }) => ({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(
            _id === bookingId
                ? {
                    ...sampleBooking,
                    save: jest.fn().mockResolvedValue(true),
                }
                : null
        ),
    }));

    return Booking;
});


jest.mock("../models/Notification", () => ({
    create: jest.fn().mockResolvedValue(true)
}));

global.io = {
    to: jest.fn(() => ({
        emit: jest.fn()
    }))
};


describe('Booking Controller – Test', () => {
    afterEach(() => jest.clearAllMocks());

    describe('getAllBookings', () => {
        it('landlord lấy danh sách → thành công', async () => {
            const req = mockReq({ query: { page: '1', limit: '10' } });
            const res = mockRes();

            await getAllBookings(req, res);

            expect(Booking.find).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    pagination: expect.any(Object),
                    data: expect.any(Array),
                })
            );
        });

        it('staff không có building → trả rỗng', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: [] },
            });
            const res = mockRes();

            await getAllBookings(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: [],
                    pagination: expect.objectContaining({ total: 0 })
                })
            );

        });

        it('staff chỉ xem building được quản lý', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                query: { buildingId },
            });
            const res = mockRes();

            await getAllBookings(req, res);

            expect(Booking.find).toHaveBeenCalled();
        });

        it('staff xem building không quản lý → 403', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: ['other'] },
                query: { buildingId },
            });
            const res = mockRes();

            await getAllBookings(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('getBookingDetail', () => {
        it('landlord xem chi tiết → thành công', async () => {
            const req = mockReq({ params: { id: bookingId } });
            const res = mockRes();

            await getBookingDetail(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('staff xem chi tiết (được quản lý)', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { id: bookingId },
            });
            const res = mockRes();

            await getBookingDetail(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true })
            );
        });

        it('landlord xem không phải lịch mình → 403', async () => {
            const req = mockReq({
                user: { _id: 'other', role: 'landlord' },
                params: { id: bookingId },
            });
            const res = mockRes();

            await getBookingDetail(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('id không hợp lệ → 400', async () => {
            const req = mockReq({ params: { id: 'invalid' } });
            const res = mockRes();

            await getBookingDetail(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('không tìm thấy → 404', async () => {
            const req = mockReq({ params: { id: fakeId } });
            const res = mockRes();

            await getBookingDetail(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('updateBookingStatus', () => {
        it('landlord accept → thành công + gửi noti realtime', async () => {
            const io = {
                to: jest.fn().mockReturnThis(),
                emit: jest.fn(),
            };

            const req = mockReq({
                params: { id: bookingId },
                body: { action: 'accept' },
                app: { get: jest.fn().mockReturnValue(io) },
            });
            const res = mockRes();

            await updateBookingStatus(req, res);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ "message": "Không có quyền" })
            );
        });

        it('staff reject → thành công', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { id: bookingId },
                body: { action: 'reject', landlordNote: 'Không phù hợp' },
            });
            const res = mockRes();

            await updateBookingStatus(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ "message": "Lỗi khi cập nhật trạng thái đặt lịch!" })
            );
        });

        it('hành động không hợp lệ → 400', async () => {
            const req = mockReq({
                params: { id: bookingId },
                body: { action: 'hack' },
            });
            const res = mockRes();

            await updateBookingStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('accept lịch đã accepted → 400', async () => {
            Booking.findOne.mockReturnValueOnce({
                populate: jest.fn().mockResolvedValue({
                    _id: bookingId,
                    landlordId,
                    tenantId,
                    buildingId: { _id: buildingId, name: "Tòa A" },
                    status: "accepted",
                    save: jest.fn(),
                }),
            });

            const req = mockReq({
                params: { id: bookingId },
                body: { action: 'accept' },
            });
            const res = mockRes();

            await updateBookingStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('không có quyền → 403', async () => {
            const req = mockReq({
                user: { _id: 'other', role: 'landlord' },
                params: { id: bookingId },
                body: { action: 'accept' },
            });
            const res = mockRes();

            await updateBookingStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });
});
