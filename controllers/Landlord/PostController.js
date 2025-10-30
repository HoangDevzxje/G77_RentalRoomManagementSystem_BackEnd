const Post = require('../../models/Post');
const Room = require('../../models/Room');
const Building = require('../../models/Building');
const BuildingService = require('../../models/BuildingService');
const Regulation = require('../../models/Regulation');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mongoose = require("mongoose");

const getBuildingInfo = async (req, res) => {
    try {
        const { buildingId } = req.params;
        const landlordId = req.user._id;
        console.log(buildingId);
        const building = await Building.findOne({
            _id: buildingId,
            landlordId,
            isDeleted: false,
        })
            .select('name address eIndexType ePrice wIndexType wPrice description status')
            .lean();

        if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        const rooms = await Room.find({
            buildingId,
            status: 'available',
            isDeleted: false,
        }).select('id roomNumber floorId price area').lean();

        const services = await BuildingService.find({
            buildingId,
            landlordId,
            isDeleted: false,
        })
            .select('name label description chargeType fee currency')
            .lean();

        const regulations = await Regulation.find({
            buildingId,
            status: 'active',
        })
            .select('title description type effectiveFrom')
            .lean();

        res.json({
            success: true,
            data: { building, rooms, services, regulations },
        });
    } catch (err) {
        console.error('Lỗi getBuildingInfo:', err);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin tòa nhà' });
    }
};

const createPost = async (req, res) => {
    try {
        const { title, description, address, buildingId, roomIds } = req.body;
        let { isDraft } = req.body;

        if (!title || !description || !address || !buildingId || !roomIds) {
            return res.status(400).json({ message: "Thiếu thông tin bài đăng!" });
        }

        if (!mongoose.Types.ObjectId.isValid(buildingId)) {
            return res.status(400).json({ message: "buildingId không hợp lệ!" });
        }

        let roomArray = Array.isArray(roomIds) ? roomIds : [roomIds];

        const validRoomIds = roomArray
            .flatMap(id => id.split(',')) // tách "id1,id2,id3" → ["id1", "id2", "id3"]
            .map(id => id.trim())
            .filter(id => mongoose.Types.ObjectId.isValid(id));

        if (!validRoomIds.length) {
            return res.status(400).json({ message: "Danh sách roomIds không hợp lệ!" });
        }

        const roomObjectIds = validRoomIds.map(id => new mongoose.Types.ObjectId(id));
        isDraft = isDraft === "true" || isDraft === true;

        const rooms = await Room.find({
            _id: { $in: roomObjectIds },
            buildingId,
            status: "available",
            isDeleted: false,
        }).select("price area");

        if (!rooms.length) {
            return res.status(400).json({ message: "Không tìm thấy phòng hợp lệ!" });
        }

        const prices = rooms.map(r => r.price);
        const areas = rooms.map(r => r.area);

        const priceMin = Math.min(...prices);
        const priceMax = Math.max(...prices);
        const areaMin = Math.min(...areas);
        const areaMax = Math.max(...areas);

        const imageUrls = req.files?.map(file => file.path) || [];

        const post = new Post({
            landlordId: req.user._id,
            buildingId,
            roomIds: roomObjectIds,
            title,
            description,
            address,
            priceMin,
            priceMax,
            areaMin,
            areaMax,
            images: imageUrls,
            isDraft,
            status: isDraft ? "hidden" : "active",
        });

        await post.save();

        res.status(201).json({
            success: true,
            message: "Tạo bài đăng thành công!",
            data: post,
        });
    } catch (err) {
        console.error("Lỗi createPost:", err);
        res.status(500).json({ message: "Lỗi khi tạo bài đăng", error: err.message });
    }
};

const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, address, buildingId, roomIds } = req.body;
        let { isDraft } = req.body;

        const post = await Post.findOne({
            _id: id,
            landlordId: req.user._id,
            isDeleted: false,
        });

        if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });

        if (title) post.title = title;
        if (description) post.description = description;
        if (address) post.address = address;
        if (buildingId) post.buildingId = buildingId;
        if (roomIds) post.roomIds = Array.isArray(roomIds) ? roomIds : [roomIds];

        if (roomIds && roomIds.length > 0) {
            const rooms = await Room.find({
                _id: { $in: post.roomIds },
                buildingId: post.buildingId,
                isDeleted: false,
            }).select('price area');

            const prices = rooms.map(r => r.price);
            const areas = rooms.map(r => r.area);

            post.priceMin = Math.min(...prices);
            post.priceMax = Math.max(...prices);
            post.areaMin = Math.min(...areas);
            post.areaMax = Math.max(...areas);
        }

        const imageUrls = req.files?.map(file => file.path) || [];
        if (imageUrls.length > 0) {
            post.images = [...post.images, ...imageUrls];
        }

        if (isDraft !== undefined) {
            const draft = isDraft === 'true' || isDraft === true;
            post.isDraft = draft;
            post.status = draft ? 'hidden' : 'active';
        }

        await post.save();
        res.json({ success: true, message: 'Cập nhật bài đăng thành công!', data: post });
    } catch (err) {
        console.error('Lỗi updatePost:', err);
        res.status(500).json({ message: err.message });
    }
};

const generateDescription = async (req, res) => {
    try {
        const {
            title,
            address,
            minPrice,
            maxPrice,
            minArea,
            maxArea,
            buildingInfo
        } = req.body;

        if (!title || !address) {
            return res.status(400).json({ message: 'Thiếu thông tin cần thiết!' });
        }

        const buildingText = [];

        if (buildingInfo) {
            buildingText.push(`💡 **Giá điện**: ${buildingInfo.ePrice?.toLocaleString('vi-VN')}đ/${buildingInfo.eIndexType === 'byNumber' ? 'kWh' : 'người'}`);
            buildingText.push(`🚿 **Giá nước**: ${buildingInfo.wPrice?.toLocaleString('vi-VN')}đ/${buildingInfo.wIndexType === 'byPerson' ? 'người' : 'm³'}`);

            if (buildingInfo.services?.length) {
                const services = buildingInfo.services.map(s => `- ${s.label} (${s.fee?.toLocaleString('vi-VN')}đ)`).join('\n');
                buildingText.push(`🛠️ **Dịch vụ có sẵn**:\n${services}`);
            }

            if (buildingInfo.regulations?.length) {
                const rules = buildingInfo.regulations.map(r => `- ${r.title}: ${r.description}`).join('\n');
                buildingText.push(`📋 **Nội quy tòa nhà**:\n${rules}`);
            }
        }

        const priceText = minPrice && maxPrice
            ? `${minPrice.toLocaleString('vi-VN')} - ${maxPrice.toLocaleString('vi-VN')} VND/tháng`
            : `${(minPrice || maxPrice)?.toLocaleString('vi-VN')} VND/tháng`;

        const areaText = minArea && maxArea
            ? `${minArea} - ${maxArea} m²`
            : `${minArea || maxArea} m²`;

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
      Viết mô tả hấp dẫn cho bài đăng cho thuê phòng trọ:

      🏢 Tòa nhà: ${title}
      📍 Địa chỉ: ${address}
      💰 Giá thuê: ${priceText}
      📐 Diện tích: ${areaText}

      Thông tin thêm:
      ${buildingText.join('\n')}

      Yêu cầu:
      - Viết mô tả thân thiện, dễ đọc, giúp người thuê dễ hình dung.
      - Trả về kết quả **ở dạng HTML** để hiển thị trong trình soạn thảo (dùng <p>, <ul>, <li>, <b>, <i>...).
      - Có thể dùng emoji nhẹ nhàng.
      - Không sinh script hoặc link độc hại.
    `;

        const result = await model.generateContent(prompt);
        const aiDescription = result.response.text();

        res.json({ success: true, data: { aiDescription } });
    } catch (err) {
        console.error('Lỗi generateDescription:', err);
        res.status(500).json({ message: 'Lỗi khi gọi AI', error: err.message });
    }
};

const listByLandlord = async (req, res) => {
    try {
        const landlordId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;

        const [posts, total] = await Promise.all([
            Post.find({ landlordId, isDeleted: false })
                .populate('buildingId', 'name address')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Post.countDocuments({ landlordId, isDeleted: false }),
        ]);

        res.json({
            success: true,
            data: posts,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
const getPostDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const landlordId = req.user._id;
        console.log(id);
        const post = await Post.findById({
            _id: id,
            landlordId,
            isDeleted: false,
        })
            .populate('buildingId', 'name address eIndexType ePrice wIndexType wPrice description status')
            .lean();

        if (!post) {
            return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        }

        const rooms = await Room.find({
            _id: { $in: post.roomIds },
            isDeleted: false,
        }).select('id roomNumber floorId price area images status').lean();

        const [services, regulations] = await Promise.all([
            BuildingService.find({
                buildingId: post.buildingId._id,
                landlordId,
                isDeleted: false,
            })
                .select('name label description chargeType fee currency')
                .lean(),
            Regulation.find({
                buildingId: post.buildingId._id,
                status: 'active',
            })
                .select('title description type effectiveFrom')
                .lean(),
        ]);

        res.json({
            success: true,
            data: {
                post,
                building: post.buildingId,
                rooms,
                services,
                regulations,
            },
        });
    } catch (err) {
        console.error('Lỗi getPostDetail:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết bài đăng' });
    }
};

const softDelete = async (req, res) => {
    try {
        const post = await Post.findOneAndUpdate(
            { _id: req.params.id, landlordId: req.user._id },
            { isDeleted: true, status: 'hidden' },
            { new: true }
        );
        if (!post) return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        res.json({ success: true, message: 'Đã xóa bài đăng (mềm)!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = {
    getBuildingInfo,
    generateDescription,
    listByLandlord,
    createPost,
    updatePost,
    softDelete,
    getPostDetail
};