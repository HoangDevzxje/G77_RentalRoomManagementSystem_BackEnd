
const {
    listByBuilding,
    create,
    update,
    remove,
    restore,
} = require('../controllers/Landlord/BuildingServiceController');

const Building = require('../models/Building');
const BuildingService = require('../models/BuildingService');

const userId = '507f1f77bcf86cd799439011';
const buildingId = '507f1f77bcf86cd799439012';
const serviceId = '507f1f77bcf86cd799439013';
const invalidId = 'abc123';

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn().mockReturnThis();
    return res;
};

const mockReq = (override = {}) => ({
    user: { _id: userId, role: 'landlord' },
    staff: { assignedBuildingIds: [] },
    params: {},
    query: {},
    body: {},
    files: [],
    ...override,
});

jest.mock('../models/Building');
jest.mock('../models/BuildingService');

describe('BuildingService Controller – Test Toàn Diện', () => {
    afterEach(() => jest.clearAllMocks());

    describe('listByBuilding', () => {
        test('thành công - landlord', async () => {
            const req = mockReq({ params: { buildingId } });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ _id: buildingId });
            BuildingService.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue([{ name: 'Wifi' }])
            });

            await listByBuilding(req, res);
            expect(res.json).toHaveBeenCalledWith([{ name: 'Wifi' }]);
        });

        test('thành công - staff được assign', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: [buildingId] },
                params: { buildingId }
            });
            const res = mockRes();

            Building.findById.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue({}) });
            BuildingService.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue([])
            });

            await listByBuilding(req, res);
            expect(res.json).toHaveBeenCalled();
        });

        test('lỗi 400 - thiếu buildingId', async () => {
            const req = mockReq({ params: {} });
            const res = mockRes();
            await listByBuilding(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('lỗi 404 - landlord không sở hữu', async () => {
            const req = mockReq({ params: { buildingId } });
            const res = mockRes();
            Building.findOne.mockResolvedValue(null);
            await listByBuilding(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('lỗi 403 - staff không được assign', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: [] },
                params: { buildingId }
            });
            const res = mockRes();
            await listByBuilding(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('create', () => {
        test('thành công', async () => {
            const req = mockReq({
                params: { buildingId },
                body: { name: 'Điện nước', chargeType: 'fixed', fee: 100000 }
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.create.mockResolvedValue({ name: 'Điện nước', fee: 100000 });

            await create(req, res);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(BuildingService.create).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Điện nước',
                fee: 100000,
                chargeType: 'fixed'
            }));
        });

        test('tự động set fee = 0 nếu chargeType = included', async () => {
            const req = mockReq({
                params: { buildingId },
                body: { name: 'Wifi', chargeType: 'included', fee: 999999 }
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.create.mockResolvedValue({});

            await create(req, res);
            expect(BuildingService.create).toHaveBeenCalledWith(expect.objectContaining({
                fee: 0
            }));
        });

        test('lỗi 400 - thiếu tên dịch vụ', async () => {
            const req = mockReq({ params: { buildingId }, body: {} });
            const res = mockRes();
            Building.findOne.mockResolvedValue({ landlordId: userId });

            await create(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Thiếu tên dịch vụ' });
        });
    });

    describe('update', () => {
        test('thành công - cập nhật thông thường', async () => {
            const req = mockReq({
                params: { buildingId, id: serviceId },
                body: { name: 'Internet mới', fee: 200000 }
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.findOneAndUpdate.mockResolvedValue({ name: 'Internet mới' });

            await update(req, res);
            expect(res.json).toHaveBeenCalledWith({ name: 'Internet mới' });
        });

        test('tự động xóa buildingId/landlordId trong payload', async () => {
            const req = mockReq({
                params: { buildingId, id: serviceId },
                body: { buildingId: 'hack', landlordId: 'hack', name: 'ok' }
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.findOneAndUpdate.mockResolvedValue({});

            await update(req, res);
            expect(BuildingService.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: serviceId, buildingId, isDeleted: false },
                { $set: { name: 'ok' } },
                { new: true }
            );
        });

        test('lỗi 404 - không tìm thấy dịch vụ', async () => {
            const req = mockReq({ params: { buildingId, id: serviceId } });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.findOneAndUpdate.mockResolvedValue(null);

            await update(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('remove', () => {
        test('thành công - soft delete', async () => {
            const req = mockReq({ params: { buildingId, id: serviceId } });
            const res = mockRes();

            const mockService = {
                isDeleted: false,
                save: jest.fn().mockResolvedValue({})
            };
            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.findOne.mockResolvedValue(mockService);

            await remove(req, res);
            expect(mockService.isDeleted).toBe(true);
            expect(mockService.deletedAt).toBeDefined();
            expect(res.json).toHaveBeenCalledWith({ message: "Đã đánh dấu xóa dịch vụ" });
        });
    });

    describe('restore', () => {
        test('thành công - khôi phục dịch vụ đã xóa', async () => {
            const req = mockReq({ params: { buildingId, id: serviceId } });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ landlordId: userId });
            BuildingService.findOneAndUpdate.mockResolvedValue({ isDeleted: false });

            await restore(req, res);
            expect(BuildingService.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: serviceId, buildingId, isDeleted: true },
                { $set: { isDeleted: false, deletedAt: null } },
                { new: true }
            );
        });
    });
});