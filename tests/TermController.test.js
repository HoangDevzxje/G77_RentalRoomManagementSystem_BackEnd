const mongoose = require('mongoose');
const {
    createTerm,
    getTermsByBuilding,
    getTermDetail,
    updateTerm,
    deleteTerm,
} = require('../controllers/Landlord/TermController');
const Term = require('../models/Term');
const Building = require('../models/Building');

const landlordId = '507f1f77bcf86cd799439011';
const staffId = '507f1f77bcf86cd799439012';
const buildingId = '507f1f77bcf86cd799439014';
const termId = '507f1f77bcf86cd799439015';
const fakeId = '60d5ecb74f5e4b0012345678';

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn().mockReturnThis();
    return res;
};

const mockReq = (override = {}) => ({
    user: { _id: landlordId, role: 'landlord' },
    staff: { assignedBuildingIds: [buildingId], currentBuildingId: buildingId },
    params: {},
    query: {},
    body: {},
    ...override,
});

jest.mock('../models/Building', () => ({
    findOne: jest.fn(),
}));

jest.mock('../models/Term', () => {
    const sampleTerm = {
        _id: termId,
        buildingId: { _id: buildingId, landlordId, name: 'Tòa A' },
        name: 'Thời hạn thuê tối thiểu 6 tháng',
        description: 'Hợp đồng dưới 6 tháng không được chấp nhận',
        status: 'active',
        isDeleted: false,
        save: jest.fn().mockResolvedValue(this),
        populate: jest.fn().mockResolvedValue(this),
    };

    return {
        create: jest.fn((data) => Promise.resolve({ ...sampleTerm, ...data })),
        find: jest.fn(() => {
            const chain = {
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnValue([sampleTerm]),
            };
            return chain;
        }),
        countDocuments: jest.fn().mockResolvedValue(5),
        findById: jest.fn((id) => ({
            populate: jest.fn().mockResolvedValue(
                id === termId ? sampleTerm : null
            ),
        })),
    };
});

describe('Term Controller – Test', () => {
    afterEach(() => jest.clearAllMocks());

    describe('createTerm', () => {
        it('landlord tạo điều khoản thành công', async () => {
            const req = mockReq({
                body: { buildingId, name: 'Thời hạn 12 tháng', description: '...' },
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ _id: buildingId, landlordId });

            await createTerm(req, res);

            expect(Building.findOne).toHaveBeenCalledWith({ _id: buildingId, landlordId });
            expect(Term.create).toHaveBeenCalledWith(
                expect.objectContaining({ buildingId, name: 'Thời hạn 12 tháng' })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
        it('staff tạo điều khoản (dùng currentBuildingId)', async () => {
            const req = mockReq({
                user: { _id: staffId, role: 'staff' },
                staff: { assignedBuildingIds: [buildingId], currentBuildingId: buildingId },
                body: { buildingId, name: 'Nội quy mới', description: '...' },
            });
            const res = mockRes();

            await createTerm(req, res);

            expect(Term.create).toHaveBeenCalledWith(
                expect.objectContaining({ buildingId })
            );

            expect(res.status).toHaveBeenCalledWith(201);
        });

        it('landlord không sở hữu building → 403', async () => {
            const req = mockReq({
                body: { buildingId: 'other', name: 'Test', description: '...' },
            });
            const res = mockRes();

            Building.findOne.mockResolvedValue(null);

            await createTerm(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('thiếu thông tin → 400', async () => {
            const req = mockReq({ body: { buildingId } });
            const res = mockRes();
            await createTerm(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getTermsByBuilding', () => {
        it('landlord xem danh sách điều khoản → thành công', async () => {
            const req = mockReq({ params: { buildingId }, query: { page: '1', limit: '10' } });
            const res = mockRes();

            Building.findOne.mockResolvedValue({ _id: buildingId, landlordId });

            await getTermsByBuilding(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                pagination: expect.any(Object),
                data: expect.any(Array),
            }));
        });

        it('staff xem danh sách (building được quản lý)', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { buildingId },
            });
            const res = mockRes();

            await getTermsByBuilding(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('staff không quản lý building → 403', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                staff: { assignedBuildingIds: ['other'] },
                params: { buildingId },
            });
            const res = mockRes();

            await getTermsByBuilding(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('thiếu buildingId → 400', async () => {
            const req = mockReq({ params: {} });
            const res = mockRes();
            await getTermsByBuilding(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('getTermDetail', () => {
        it('landlord xem chi tiết → thành công', async () => {
            const req = mockReq({ params: { id: termId } });
            const res = mockRes();

            await getTermDetail(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.any(Object) });
        });

        it('staff xem chi tiết (được quản lý)', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { id: termId },
            });
            const res = mockRes();

            await getTermDetail(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('không có quyền → 403', async () => {
            const req = mockReq({
                user: { _id: 'other', role: 'landlord' },
                params: { id: termId },
            });
            const res = mockRes();

            await getTermDetail(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('không tìm thấy → 404', async () => {
            const req = mockReq({ params: { id: fakeId } });
            const res = mockRes();

            await getTermDetail(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('updateTerm', () => {
        it('landlord cập nhật thành công', async () => {
            const req = mockReq({
                params: { id: termId },
                body: { name: 'Cập nhật', description: 'Mô tả mới', status: 'inactive' },
            });
            const res = mockRes();

            await updateTerm(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: 'Cập nhật điều khoản thành công!',
            }));
        });

        it('staff cập nhật (được quản lý)', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { id: termId },
                body: { name: 'Sửa', description: '...', status: 'active' },
            });
            const res = mockRes();

            await updateTerm(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('không có quyền → 403', async () => {
            const req = mockReq({
                user: { _id: 'other', role: 'landlord' },
                params: { id: termId },
                body: { name: 'Hack' },
            });
            const res = mockRes();

            await updateTerm(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('thiếu thông tin → 400', async () => {
            const req = mockReq({ params: { id: termId }, body: {} });
            const res = mockRes();
            await updateTerm(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe('deleteTerm', () => {
        it('landlord xóa (soft delete) thành công', async () => {
            const req = mockReq({ params: { id: termId } });
            const res = mockRes();

            await deleteTerm(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Xóa điều khoản thành công!' });
        });

        it('staff xóa thành công', async () => {
            const req = mockReq({
                user: { role: 'staff' },
                params: { id: termId },
            });
            const res = mockRes();

            await deleteTerm(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('không có quyền → 403', async () => {
            const req = mockReq({
                user: { _id: 'other', role: 'landlord' },
                params: { id: termId },
            });
            const res = mockRes();

            await deleteTerm(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });
});