// __tests__/LandlordController.test.js → COVERAGE >95%, 35+ TEST CASE
const mongoose = require('mongoose');

const {
    getBuildingInfo,
    createPost,
    updatePost,
    listByLandlord,
    getPostDetail,
    softDelete,
} = require('../controllers/Landlord/PostController');

const Building = require('../models/Building');
const Room = require('../models/Room');
const Contract = require('../models/Contract');
const Post = require('../models/Post');
const BuildingService = require('../models/BuildingService');
const Regulation = require('../models/Regulation');

const userId = '507f1f77bcf86cd799439011';
const buildingId = '507f1f77bcf86cd799439012';
const postId = '507f1f77bcf86cd799439013';
const room1Id = '507f1f77bcf86cd799439014';
const room2Id = '507f1f77bcf86cd799439015';
const invalidId = 'abc123';
const staffId = '507f1f77bcf86cd799439016';


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
jest.mock('../models/Room');
jest.mock('../models/Contract');
jest.mock('../models/Post');
jest.mock('../models/BuildingService');
jest.mock('../models/Regulation');

describe('Post Controller – Test', () => {
    afterEach(() => jest.clearAllMocks());

    // ==================== createPost ====================
    describe('createPost ', () => {
        const baseReq = {
            query: { buildingId },
            body: { title: 'ok', description: 'ok', address: 'ok' }
        };

        beforeEach(() => {
            Building.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ landlordId: userId })
            });
            Post.mockImplementation(() => ({ save: jest.fn().mockResolvedValue({}) }));
        });

        test('thành công - phòng available bình thường', async () => {
            const req = mockReq({ ...baseReq, body: { ...baseReq.body, roomIds: [room1Id] } });
            const res = mockRes();
            Room.find.mockResolvedValue([
                { _id: room1Id, status: 'available', price: 6000000, area: 30 }
            ]);
            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('thành công - phòng rented còn 25 ngày → được đăng + có warning', async () => {
            const req = mockReq({ ...baseReq, body: { ...baseReq.body, roomIds: [room1Id] } });
            const res = mockRes();

            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 25);

            Room.find.mockResolvedValue([
                {
                    _id: room1Id,
                    status: 'rented',
                    roomNumber: '101',
                    price: 5000000,
                    area: 30
                }
            ]);

            Contract.findOne.mockResolvedValue({
                roomId: room1Id,
                endDate,
                status: 'completed',
                moveInConfirmedAt: new Date()
            });

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(201);
            // expect(res.json.mock.calls[0][0].warnings).toBeDefined(); // nếu bạn trả warning ra response
        });

        test('xử lý roomIds dạng chuỗi có phẩy', async () => {
            const req = mockReq({
                ...baseReq,
                body: { ...baseReq.body, roomIds: `${room1Id}, ${room2Id} ,${room1Id}` }
            });
            const res = mockRes();
            Room.find.mockResolvedValue([
                { _id: room1Id, status: 'available', price: 5e6, area: 30 },
                { _id: room2Id, status: 'available', price: 7e6, area: 40 }
            ]);

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(201);
        });

        test('tính priceMin/priceMax, areaMin/areaMax đúng', async () => {
            const req = mockReq({
                ...baseReq,
                body: { ...baseReq.body, roomIds: [room1Id, room2Id] }
            });
            const res = mockRes();
            Room.find.mockResolvedValue([
                { _id: room1Id, status: 'available', price: 5000000, area: 25 },
                { _id: room2Id, status: 'available', price: 8000000, area: 45 }
            ]);

            let savedPost;
            Post.mockImplementation((data) => ({
                save: jest.fn().mockImplementation(async () => {
                    savedPost = data;
                    return data;
                })
            }));

            await createPost(req, res);

            expect(savedPost.priceMin).toBe(5000000);
            expect(savedPost.priceMax).toBe(8000000);
            expect(savedPost.areaMin).toBe(25);
            expect(savedPost.areaMax).toBe(45);
        });

        test('lỗi 400 - phòng rented còn 40 ngày → bị từ chối', async () => {
            const req = mockReq({ ...baseReq, body: { ...baseReq.body, roomIds: [room1Id] } });
            const res = mockRes();

            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 40);

            Room.find.mockResolvedValue([
                {
                    _id: room1Id,
                    status: 'rented',
                    price: 5000000,
                    area: 30
                }
            ]);

            Contract.findOne.mockResolvedValue({
                roomId: room1Id,
                endDate,
                status: 'completed',
                moveInConfirmedAt: new Date()
            });

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].message).toContain('Không có phòng nào hợp lệ');
        });
        test('lỗi 400 - thiếu buildingId', async () => {
            const req = mockReq({
                query: {},
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Thiếu buildingId!' });
        });
        test('lỗi 400 - buildingId không hợp lệ', async () => {
            const req = mockReq({
                query: { buildingId: '123' }, // không phải ObjectId
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'buildingId không hợp lệ!' });
        });
        test('lỗi 400 - thiếu thông tin bài đăng', async () => {
            const req = mockReq({
                query: { buildingId },
                body: { description: 'ok', address: 'ok', roomIds: [room1Id] } // thiếu title
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json.mock.calls[0][0].message).toBe('Thiếu thông tin bài đăng!');
        });
        test('lỗi 400 - phải chọn ít nhất 1 phòng', async () => {
            const req = mockReq({
                query: { buildingId },
                body: { title: 'ok', description: 'ok', address: 'ok' }
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Phải chọn ít nhất một phòng!' });
        });

        test('lỗi 404 - tòa nhà không tồn tại', async () => {
            const req = mockReq({
                query: { buildingId },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            Building.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue(null)
            });

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Tòa nhà không tồn tại!' });
        });

        test('lỗi 403 - staff không được quản lý tòa nhà', async () => {
            const req = mockReq({
                user: { role: 'staff', _id: staffId },
                staff: { assignedBuildingIds: [] }, // không có quyền
                query: { buildingId },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Bạn không được quản lý tòa nhà này' });
        });

        test('lỗi 403 - landlord không sở hữu tòa nhà', async () => {
            const req = mockReq({
                user: { role: 'landlord', _id: 'OTHER_USER' },
                query: { buildingId },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            Building.findById.mockReturnValue({
                lean: jest.fn().mockResolvedValue({ landlordId: userId }) // userId != OTHER_USER
            });

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Không có quyền' });
        });

        test('lỗi 400 - danh sách roomIds không hợp lệ', async () => {
            const req = mockReq({
                query: { buildingId },
                body: {
                    title: 'ok',
                    description: 'ok',
                    address: 'ok',
                    roomIds: "abc, xyz" // sai định dạng ObjectId
                }
            });
            const res = mockRes();

            await createPost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Danh sách roomIds không hợp lệ!' });
        });

        test('isDraft = "1" → status = hidden', async () => {
            const req = mockReq({
                ...baseReq,
                body: { ...baseReq.body, roomIds: [room1Id], isDraft: '1' }
            });
            const res = mockRes();
            Room.find.mockResolvedValue([{ _id: room1Id, status: 'available' }]);

            let savedPost;
            Post.mockImplementation((data) => ({
                save: jest.fn().mockImplementation(async () => {
                    savedPost = data;
                })
            }));

            await createPost(req, res);
            expect(savedPost.isDraft).toBe(true);
            expect(savedPost.status).toBe('hidden');
        });

        test('upload ảnh → lưu vào images', async () => {
            const req = mockReq({
                ...baseReq,
                body: { ...baseReq.body, roomIds: [room1Id] },
                files: [{ path: '/uploads/img1.jpg' }, { path: '/uploads/img2.jpg' }]
            });
            const res = mockRes();
            Room.find.mockResolvedValue([{ _id: room1Id, status: 'available' }]);

            let savedPost;
            Post.mockImplementation((data) => ({
                save: jest.fn().mockImplementation(async () => {
                    savedPost = data;
                })
            }));

            await createPost(req, res);
            expect(savedPost.images).toEqual(['/uploads/img1.jpg', '/uploads/img2.jpg']);
        });




    });

    // ==================== updatePost – NÂNG CAO ====================
    describe('updatePost', () => {
        const basePost = {
            _id: postId,
            landlordId: userId,
            buildingId,
            roomIds: [room1Id],
            images: [],
            save: jest.fn().mockResolvedValue({})
        };

        beforeEach(() => {
            Post.findById.mockResolvedValue({ ...basePost });
        });

        test('thành công - thêm ảnh mới', async () => {
            const req = mockReq({
                params: { id: postId },
                files: [{ path: '/new/img.jpg' }]
            });
            const res = mockRes();

            await updatePost(req, res);

            const updated = await Post.findById.mock.results[0].value;
            expect(updated.images).toContain('/new/img.jpg');
            expect(updated.save).toHaveBeenCalled();
        });


        test('thành công - landlord đổi buildingId', async () => {
            const newBuildingId = '507f1f77bcf86cd799439099';
            const req = mockReq({
                params: { id: postId },
                body: { buildingId: newBuildingId }
            });
            const res = mockRes();

            Building.findById.mockResolvedValue({ landlordId: userId });

            await updatePost(req, res);

            const updated = await Post.findById.mock.results[0].value;
            expect(updated.buildingId).toBe(newBuildingId);
        });
        test('lỗi 400 - thiếu postId', async () => {
            const req = mockReq({
                params: {},
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await updatePost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Thiếu id' });
        });
        test('lỗi 400 - postId không hợp lệ', async () => {
            const req = mockReq({
                params: { id: '123' },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await updatePost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'id không hợp lệ' });
        });

        test('lỗi 403 - staff sửa bài không phải của mình', async () => {
            const req = mockReq({
                user: { role: 'staff', _id: 'otherStaff' },
                params: { id: postId },
                body: { title: 'hack' }
            });
            const res = mockRes();

            Post.findById.mockResolvedValue({ ...basePost, createdBy: userId });

            await updatePost(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('lỗi 400 - danh sách roomIds không hợp lệ', async () => {
            const req = mockReq({
                params: { id: postId },
                body: {
                    title: 'ok',
                    description: 'ok',
                    address: 'ok',
                    roomIds: "abc, xyz"
                }
            });
            const res = mockRes();

            await updatePost(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Danh sách roomIds không hợp lệ!' });
        });

        test('lỗi 403 - staff không được quản lý tòa nhà', async () => {
            const req = mockReq({
                user: { role: 'staff', _id: staffId },
                staff: { assignedBuildingIds: [] },
                params: { id: postId },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await updatePost(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: 'Bạn chỉ được sửa bài đăng do mình tạo!' });
        });
    });

    // ==================== listByLandlord – phân trang ====================
    describe('listByLandlord', () => {
        test('phân trang đúng', async () => {
            const req = mockReq({ query: { page: '2', limit: '5' } });
            const res = mockRes();

            const chain = {
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue([{}, {}, {}, {}, {}])
            };
            Post.find.mockReturnValue(chain);
            Post.countDocuments.mockResolvedValue(12);

            await listByLandlord(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                pagination: expect.objectContaining({
                    total: 12,
                    page: 2,
                    limit: 5,
                    totalPages: 3
                })
            }));
        });
    });
    // ==================== getPostDetail ====================
    describe('getPostDetail', () => {
        test('thành công', async () => {
            const req = mockReq({ params: { id: postId } });
            const res = mockRes();

            Post.findById.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({
                    landlordId: userId,
                    buildingId: { _id: buildingId },
                    roomIds: []
                })
            });
            Room.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
            BuildingService.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
            Regulation.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

            await getPostDetail(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
        test('lỗi 400 - Thiếu postId', async () => {
            const req = mockReq({ params: {} });
            const res = mockRes();
            await getPostDetail(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });


        test('lỗi 400 - postId không hợp lệ', async () => {
            const req = mockReq({ params: { id: invalidId } });
            const res = mockRes();
            await getPostDetail(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'postId không hợp lệ' });
        });
    });
    // ==================== softDelete ====================
    describe('softDelete', () => {
        test('thành công', async () => {
            const req = mockReq({ params: { id: postId } });
            const res = mockRes();
            const mockPost = { landlordId: userId, isDeleted: false, status: 'active', save: jest.fn() };
            Post.findById.mockResolvedValue(mockPost);
            await softDelete(req, res);
            expect(mockPost.isDeleted).toBe(true);
            expect(mockPost.status).toBe('hidden');
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
        test('lỗi 400 - thiếu postId', async () => {
            const req = mockReq({
                params: {},
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await softDelete(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'Thiếu id' });
        });
        test('lỗi 400 - postId không hợp lệ', async () => {
            const req = mockReq({
                params: { id: '123' },
                body: { title: 'ok', description: 'ok', address: 'ok', roomIds: [room1Id] }
            });
            const res = mockRes();

            await softDelete(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'id không hợp lệ' });
        });
    });
    // ==================== getBuildingInfo ====================
    describe('getBuildingInfo', () => {
        test('thành công - landlord sở hữu', async () => {
            const req = mockReq({ params: { buildingId } });
            const res = mockRes();

            Building.findById.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ landlordId: userId, name: 'Tòa nhà A' })
            });

            Room.aggregate.mockResolvedValue([]);
            Room.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
            BuildingService.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
            Regulation.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });

            await getBuildingInfo(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        test('lỗi 400 - thiếu buildingId', async () => {
            const req = mockReq({ params: {} });
            const res = mockRes();
            await getBuildingInfo(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
        });

        test('lỗi 400 - buildingId không hợp lệ', async () => {
            const req = mockReq({ params: { buildingId: invalidId } });
            const res = mockRes();
            await getBuildingInfo(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ message: 'buildingId không hợp lệ' });
        });

        test('lỗi 404 - không tìm thấy', async () => {
            const req = mockReq({ params: { buildingId } });
            const res = mockRes();
            Building.findById.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(null)
            });
            await getBuildingInfo(req, res);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('lỗi 403 - landlord không sở hữu', async () => {
            const req = mockReq({ params: { buildingId } });
            const res = mockRes();
            Building.findById.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ landlordId: 'khac' })
            });
            await getBuildingInfo(req, res);
            expect(res.status).toHaveBeenCalledWith(403);
        });

        test('thành công - staff được assign', async () => {
            const req = mockReq({
                user: { _id: userId, role: 'staff' },
                staff: { assignedBuildingIds: [buildingId] },
                params: { buildingId }
            });
            const res = mockRes();
            Building.findById.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue({ landlordId: 'abc' })
            });
            await getBuildingInfo(req, res);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
    });

});