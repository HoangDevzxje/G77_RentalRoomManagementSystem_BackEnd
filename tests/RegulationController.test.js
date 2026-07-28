const mongoose = require('mongoose');
const {
    getList,
    create,
    update,
    remove,
} = require('../controllers/Landlord/RegulationController');

const Regulation = require('../models/Regulation');
const Building = require('../models/Building');

const landlordId = '507f1f77bcf86cd799439011';
const staffId = '507f1f77bcf86cd799439012';
const tenantId = '507f1f77bcf86cd799439013';
const buildingId = '507f1f77bcf86cd799439014';
const regulationId = '507f1f77bcf86cd799439015';
const fakeValidId = '60d5ecb74f5e4b0012345678';

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn().mockReturnThis();
    return res;
};

const mockReq = (override = {}) => ({
    user: { _id: landlordId, role: 'landlord' },
    staff: { assignedBuildingIds: [buildingId] },
    query: {},
    params: {},
    body: {},
    ...override,
});

jest.mock('../models/Building', () => ({
    findOne: jest.fn(),
    findById: jest.fn(),
}));

jest.mock('../models/Regulation', () => {
    const sampleReg = {
        _id: regulationId,
        buildingId: { _id: buildingId, landlordId },
        title: 'Không được nuôi chó mèo',
        description: 'Vi phạm phạt 500k',
        status: 'active',
        createdBy: { email: 'landlord@gmail.com', userInfo: { fullName: 'Chủ nhà A' } },
        save: jest.fn().mockResolvedValue(this),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    return {
        find: jest.fn(() => ({
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockResolvedValue([sampleReg]),
        })),
        findById: jest.fn((id) => ({
            populate: jest.fn().mockResolvedValue(
                id === regulationId
                    ? { ...sampleReg, buildingId: { _id: buildingId, landlordId } }
                    : null
            ),
        })),
        create: jest.fn((data) => Promise.resolve({ ...sampleReg, ...data })),
    };
});

describe('Regulation Controller – Test Toàn Diện', () => {
    afterEach(() => jest.clearAllMocks());

    describe('getList', () => {
        it('tenant/landlord xem danh sách quy định → thành công', async () => {
            const req = mockReq({ query: { buildingId } });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ _id: buildingId });

            await getList(req, res);

            expect(Building.findOne).toHaveBeenCalledWith({
                _id: buildingId,
                isDeleted: false,
            });
            expect(Regulation.find).toHaveBeenCalledWith({
                buildingId,
                status: 'active',
            });
            expect(res.json).toHaveBeenCalledWith(expect.any(Array));
        });

        it('thiếu buildingId → 400', async () => {
            const req = mockReq({ query: {} });
            const res = mockRes();

            await getList(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Thiếu buildingId' });
        });

        it('tòa nhà không tồn tại → 404', async () => {
            const req = mockReq({ query: { buildingId: 'invalid' } });
            const res = mockRes();

            Building.findOne.mockResolvedValue(null);

            await getList(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('staff không quản lý tòa → 403', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: ['other-building'] },
                query: { buildingId },
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ _id: buildingId });

            await getList(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Bạn không được quản lý tòa nhà này',
            });
        });
    });

    describe('create', () => {
        it('landlord tạo quy định thành công', async () => {
            const req = mockReq({
                body: {
                    buildingId,
                    title: 'Cấm đốt pháo',
                    description: 'Phạt 1 triệu',
                },
            });
            const res = mockRes();

            Building.findById.mockResolvedValue({ _id: buildingId, landlordId });

            await create(req, res);

            expect(Regulation.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    buildingId,
                    title: 'Cấm đốt pháo',
                    createdBy: landlordId,
                })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({
                message: 'Tạo quy định thành công',
                data: expect.any(Object),
            });
        });

        it('thiếu thông tin bắt buộc → 400', async () => {
            const req = mockReq({ body: { buildingId } });
            const res = mockRes();

            await create(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('người khác (không phải chủ) cố tạo → 403', async () => {
            const req = mockReq({
                user: { _id: tenantId, role: 'resident' },
                body: { buildingId, title: 'Test', description: 'Test' },
            });
            const res = mockRes();

            Building.findById.mockResolvedValue({ _id: buildingId, landlordId: 'other' });

            await create(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('update', () => {
        it('landlord cập nhật quy định thành công', async () => {
            const req = mockReq({
                params: { id: regulationId },
                body: { title: 'Cấm hút thuốc (đã sửa)' },
            });
            const res = mockRes();

            await update(req, res);

            expect(res.json).toHaveBeenCalledWith({
                message: 'Cập nhật thành công',
                data: expect.objectContaining({ title: 'Cấm hút thuốc (đã sửa)' }),
            });
        });

        it('người khác cố sửa → 403', async () => {
            const req = mockReq({
                user: { _id: tenantId, role: 'resident' },
                params: { id: regulationId },
                body: { title: 'Hack' },
            });
            const res = mockRes();

            await update(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('không tìm thấy quy định → 404', async () => {
            const req = mockReq({ params: { id: fakeValidId } });
            const res = mockRes();

            await update(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('remove', () => {
        it('landlord xóa quy định thành công', async () => {
            const req = mockReq({ params: { id: regulationId } });
            const res = mockRes();

            await remove(req, res);

            expect(res.json).toHaveBeenCalledWith({ message: 'Đã xóa quy định' });
        });

        it('người khác cố xóa → 403', async () => {
            const req = mockReq({
                user: { _id: tenantId, role: 'resident' },
                params: { id: regulationId },
            });
            const res = mockRes();

            await remove(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('admin được xóa mọi quy định', async () => {
            const req = mockReq({
                user: { role: 'admin' },
                params: { id: regulationId },
            });
            const res = mockRes();

            await remove(req, res);

            expect(res.json).toHaveBeenCalledWith({ message: 'Đã xóa quy định' });
        });
    });
});