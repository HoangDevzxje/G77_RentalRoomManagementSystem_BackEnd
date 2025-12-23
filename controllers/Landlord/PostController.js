const Post = require('../../models/Post');
const Room = require('../../models/Room');
const Building = require('../../models/Building');
const BuildingService = require('../../models/BuildingService');
const Regulation = require('../../models/Regulation');
const mongoose = require("mongoose");
const Contract = require('../../models/Contract');
function formatDateVN(date) {
    return new Date(date).toLocaleDateString("vi-VN");
}

const getBuildingInfo = async (req, res) => {
    try {
        const { buildingId } = req.params;
        if (!buildingId) {
            return res.status(400).json({ message: 'Thiếu buildingId' });
        }
        if (!mongoose.Types.ObjectId.isValid(buildingId)) {
            return res.status(400).json({ message: 'buildingId không hợp lệ' });
        }

        const b = await Building.findById(buildingId)
            .select('name address eIndexType ePrice wIndexType wPrice description status landlordId')
            .lean();

        if (!b) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else if (req.user.role === "landlord" && String(b.landlordId) !== String(req.user._id)) {
            return res.status(403).json({ message: "Không có quyền" });
        }

        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + 30);

        const soonAvailableRooms = await Room.aggregate([
            {
                $match: {
                    buildingId: new mongoose.Types.ObjectId(buildingId),
                    status: "rented",
                    isDeleted: false
                }
            },
            {
                $lookup: {
                    from: "contracts",
                    localField: "_id",
                    foreignField: "roomId",
                    as: "contract"
                }
            },
            { $unwind: "$contract" },
            {
                $match: {
                    "contract.status": "completed",
                    "contract.moveInConfirmedAt": { $exists: true },
                    "contract.contract.endDate": { $lte: thresholdDate }
                }
            },
            {
                $addFields: {
                    currentContractEndDate: "$contract.contract.endDate",
                    expectedAvailableDate: {
                        $dateAdd: {
                            startDate: "$contract.contract.endDate",
                            unit: "day",
                            amount: 1
                        }
                    }
                }
            },
            {
                $project: {
                    roomNumber: 1,
                    floorId: 1,
                    price: 1,
                    area: 1,
                    status: 1,
                    currentContractEndDate: 1,
                    expectedAvailableDate: 1,
                    _id: 1
                }
            }
        ]);

        const availableRooms = await Room.find({
            buildingId,
            status: "available",
            isDeleted: false
        }).select('roomNumber floorId price area status _id').lean();
        const rooms = [...availableRooms, ...soonAvailableRooms];
        const [services, regulations] = await Promise.all([
            BuildingService.find({ buildingId, isDeleted: false })
                .select('name label description chargeType fee currency').lean(),
            Regulation.find({ buildingId, status: 'active' })
                .select('title description type effectiveFrom').lean(),
        ]);

        res.json({
            success: true,
            data: {
                building: b,
                rooms,
                services,
                regulations
            },
        });
    } catch (err) {
        console.error('Lỗi getBuildingInfo:', err);
        res.status(500).json({ message: 'Lỗi khi lấy thông tin tòa nhà' });
    }
};

const createPost = async (req, res) => {
    try {
        const buildingId = req.query.buildingId || req.body.buildingId;
        if (!buildingId) {
            return res.status(400).json({
                message: "Thiếu buildingId!"
            });
        }
        const { title, description, address, roomIds } = req.body;
        let { isDraft } = req.body;

        if (!title || !description || !address || !buildingId) {
            return res.status(400).json({
                message: "Thiếu thông tin bài đăng!",
                tip: "Hãy truyền buildingId qua ?buildingId=... trong URL hoặc form-data",
                received: { title, description, address, buildingId }
            });
        }
        if (!roomIds) return res.status(400).json({ message: "Phải chọn ít nhất một phòng!" });
        if (!mongoose.Types.ObjectId.isValid(buildingId)) {
            return res.status(400).json({ message: "buildingId không hợp lệ!" });
        }

        const b = await Building.findById(buildingId).lean();
        if (!b) return res.status(404).json({ message: "Tòa nhà không tồn tại!" });
        const realLandlordId = b.landlordId;
        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds.includes(buildingId)) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        }
        else if (req.user.role === "landlord" && String(b.landlordId) !== String(req.user._id)) {
            return res.status(403).json({ message: "Không có quyền" });
        }

        let roomArray = Array.isArray(roomIds) ? roomIds : [roomIds];
        const validRoomIds = roomArray
            .flatMap(id => id.split(','))
            .map(id => id.trim())
            .filter(id => mongoose.Types.ObjectId.isValid(id));

        if (!validRoomIds.length) {
            return res.status(400).json({ message: "Danh sách roomIds không hợp lệ!" });
        }

        const roomObjectIds = validRoomIds.map(id => new mongoose.Types.ObjectId(id));
        isDraft = isDraft === "true" || isDraft === true || isDraft === "1";

        const rooms = await Room.find({
            _id: { $in: roomObjectIds },
            buildingId,
            isDeleted: false,
            $or: [
                { status: "available" },
                {
                    status: "rented",
                    _id: { $in: roomObjectIds },
                }
            ]
        });

        const now = new Date();
        const threshold = new Date();
        threshold.setDate(now.getDate() + 30);

        const validRooms = [];
        const warnings = [];

        for (const room of rooms) {
            if (room.status === "available") {
                validRooms.push(room);
                continue;
            }

            const activeContract = await Contract.findOne({
                roomId: room._id,
                status: "completed",
                moveInConfirmedAt: { $exists: true }
            });

            if (!activeContract) {
                continue;
            }

            if (activeContract.endDate > threshold) {
                continue;
            }

            validRooms.push(room);

            warnings.push({
                roomNumber: room.roomNumber,
                expectedAvailableDate: new Date(activeContract.endDate.getTime() + 24 * 60 * 60 * 1000),
                message: `Phòng sẽ trống từ ${formatDateVN(activeContract.endDate)}`
            });
        }

        if (validRooms.length === 0) {
            return res.status(400).json({
                message: "Không có phòng nào hợp lệ để đăng!",
                tip: "Chỉ được chọn phòng trống hoặc phòng có hợp đồng còn ≤ 30 ngày"
            });
        }

        const prices = rooms.map(r => r.price);
        const areas = rooms.map(r => r.area);

        const priceMin = Math.min(...prices);
        const priceMax = Math.max(...prices);
        const areaMin = Math.min(...areas);
        const areaMax = Math.max(...areas);

        const imageUrls = req.files?.map(file => file.path) || [];

        const post = new Post({
            landlordId: realLandlordId,
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
            createdBy: req.user._id,
        });

        await post.save();

        res.status(201).json({
            success: true,
            message: "Tạo bài đăng thành công!",
            data: post,
        });
    } catch (err) {
        console.error("Lỗi createPost:", err);
        res.status(500).json({
            message: "Lỗi khi tạo bài đăng",
            error: err.message
        });
    }
};
const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, address, buildingId, roomIds } = req.body;
        let { isDraft } = req.body;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const post = await Post.findById(id);
        if (!post || post.isDeleted) {
            return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        }

        if (req.user.role === "staff") {
            if (String(post.createdBy) !== String(req.user._id)) {
                return res.status(403).json({ message: "Bạn chỉ được sửa bài đăng do mình tạo!" });
            }
            if (!req.staff?.assignedBuildingIds.includes(String(post.buildingId))) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else if (req.user.role === "landlord") {
            if (String(post.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không có quyền" });
            }
        }

        if (title) post.title = title;
        if (description) post.description = description;
        if (address) post.address = address;

        if (buildingId && req.user.role === "landlord") {
            const newBuilding = await Building.findById(buildingId);
            if (!newBuilding || String(newBuilding.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không thể chuyển sang tòa nhà không thuộc quyền sở hữu!" });
            }
            post.buildingId = buildingId;
        }

        if (roomIds) {
            const roomArray = Array.isArray(roomIds) ? roomIds : [roomIds];
            const validRoomIds = roomArray
                .flatMap(id => id.split(','))
                .map(id => id.trim())
                .filter(id => mongoose.Types.ObjectId.isValid(id));

            if (!validRoomIds.length) {
                return res.status(400).json({ message: "Danh sách roomIds không hợp lệ!" });
            }

            const roomObjectIds = validRoomIds.map(id => new mongoose.Types.ObjectId(id));
            post.roomIds = roomObjectIds;

            const rooms = await Room.find({
                _id: { $in: roomObjectIds },
                buildingId: post.buildingId,
                status: "available",
                isDeleted: false,
            }).select('price area');

            if (rooms.length === 0) {
                return res.status(400).json({ message: "Không tìm thấy phòng hợp lệ!" });
            }

            const prices = rooms.map(r => r.price);
            const areas = rooms.map(r => r.area);
            post.priceMin = Math.min(...prices);
            post.priceMax = Math.max(...prices);
            post.areaMin = Math.min(...areas);
            post.areaMax = Math.max(...areas);
        }

        const newImageUrls = req.files?.map(file => file.path) || [];
        if (newImageUrls.length > 0) {
            post.images = [...post.images, ...newImageUrls];
        }

        if (isDraft !== undefined) {
            const draft = isDraft === 'true' || isDraft === true;
            post.isDraft = draft;
            post.status = draft ? 'hidden' : 'active';
        }

        await post.save();
        res.json({ success: true, message: 'Cập nhật bài đăng thành công!', data: post });
    } catch (err) {
        console.error('Lỗi updatePost:', err.message);
        res.status(500).json({ message: 'Lỗi hệ thống' });
    }
};

const generateDescription = async (req, res) => {
    try {
        const {
            title,
            address,
            priceMin,
            priceMax,
            areaMin,
            areaMax,
            buildingInfo,
        } = req.body;

        if (!title || !address) {
            return res.status(400).json({ message: "Thiếu thông tin cần thiết!" });
        }

        const buildingText = [];

        if (buildingInfo) {
            buildingText.push(
                `💡 **Giá điện**: ${buildingInfo.ePrice?.toLocaleString("vi-VN")}đ/${buildingInfo.eIndexType === "byNumber" ? "kWh" : "người"
                }`
            );
            buildingText.push(
                `🚿 **Giá nước**: ${buildingInfo.wPrice?.toLocaleString("vi-VN")}đ/${buildingInfo.wIndexType === "byPerson" ? "người" : "m³"
                }`
            );

            if (buildingInfo.services?.length) {
                const services = buildingInfo.services
                    .map((s) => `- ${s.label} (${s.fee?.toLocaleString("vi-VN")}đ)`)
                    .join("\n");
                buildingText.push(`🛠️ **Dịch vụ có sẵn**:\n${services}`);
            }

            if (buildingInfo.regulations?.length) {
                const rules = buildingInfo.regulations
                    .map((r) => `- ${r.title}: ${r.description}`)
                    .join("\n");
                buildingText.push(`📋 **Nội quy tòa nhà**:\n${rules}`);
            }
        }

        const priceText =
            priceMin && priceMax
                ? `${priceMin.toLocaleString("vi-VN")} - ${priceMax.toLocaleString(
                    "vi-VN"
                )} VND/tháng`
                : `${(priceMin || priceMax)?.toLocaleString("vi-VN")} VND/tháng`;

        const areaText =
            areaMin && areaMax
                ? `${areaMin} - ${areaMax} m²`
                : `${areaMin || areaMax} m²`;

        const prompt = `
Bạn là hệ thống tạo nội dung cho website cho thuê phòng trọ.

Hãy tạo NỘI DUNG MÔ TẢ cho bài đăng bên dưới.

⚠️ QUY ĐỊNH BẮT BUỘC:
- CHỈ trả về NỘI DUNG HTML
- KHÔNG lời mở đầu, KHÔNG giải thích, KHÔNG markdown
- KHÔNG dùng \`\`\`html
- Nội dung NGẮN GỌN, súc tích, dễ đọc
- Dùng <p>, <ul>, <li>, <b>
- Emoji nhẹ (tối đa 3 emoji)
- Không sinh script, link, hoặc text ngoài HTML

THÔNG TIN BÀI ĐĂNG:
🏢 Tòa nhà: ${title}
📍 Địa chỉ: ${address}
💰 Giá thuê: ${priceText}
📐 Diện tích: ${areaText}

${buildingText.length ? `TIỆN ÍCH & CHI PHÍ:\n${buildingText.join("\n")}` : ""}

CHỈ TRẢ VỀ HTML.
`;

        let aiDescription = "";

        try {
            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

            const result = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });

            aiDescription = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (err) {
            console.error("⚠️ Không thể gọi Gemini:", err.message);
            aiDescription =
                "<p>Không thể tạo mô tả tự động, vui lòng nhập mô tả thủ công.</p>";
        }

        res.json({ success: true, data: { aiDescription } });
    } catch (err) {
        console.error("❌ Lỗi generateDescription:", err);
        res.status(500).json({
            message: "Lỗi khi gọi AI",
            error: err.message,
        });
    }
};

const listByLandlord = async (req, res) => {
    try {
        const filter = { isDeleted: false };

        if (req.user.role === "staff") {
            if (!req.staff?.assignedBuildingIds?.length) {
                return res.json({
                    success: true,
                    data: [],
                    pagination: { total: 0, page: 1, limit: 10, totalPages: 0 }
                });
            }

            filter.buildingId = { $in: req.staff.assignedBuildingIds };
        } else if (req.user.role === "landlord") {
            filter.landlordId = req.user._id;
        } else {
            return res.status(403).json({ message: "Không có quyền truy cập" });
        }

        const { isDraft, page = 1, limit = 10 } = req.query;
        if (isDraft !== undefined) {
            filter.isDraft = isDraft === "true";
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [posts, total] = await Promise.all([
            Post.find(filter)
                .populate('buildingId', 'name address')
                .populate({
                    path: "createdBy",
                    select: "email userInfo",
                    populate: {
                        path: "userInfo",
                        model: "UserInformation",
                        select: "fullName phoneNumber",
                    },
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),

            Post.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: posts,
            pagination: {
                total,
                page: +page,
                limit: +limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("Error in listByLandlord:", err);
        res.status(500).json({ message: "Lỗi hệ thống khi lấy danh sách bài đăng!" });
    }
};
const getPostDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu postId' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'postId không hợp lệ' });
        }
        const post = await Post.findById(id)
            .populate('buildingId', 'name address eIndexType ePrice wIndexType wPrice description status landlordId')
            .populate({
                path: "createdBy",
                select: "email userInfo",
                populate: {
                    path: "userInfo",
                    model: "UserInformation",
                    select: "fullName phoneNumber",
                },
            })
            .lean();

        if (!post || post.isDeleted) {
            return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        }

        if (req.user.role === "staff") {
            if (String(post.createdBy?._id || post.createdBy) !== String(req.user._id)) {
                return res.status(403).json({ message: "Bạn chỉ được xem bài đăng do mình tạo!" });
            }
            if (!req.staff?.assignedBuildingIds.includes(String(post.buildingId._id))) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else if (req.user.role === "landlord") {
            if (String(post.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không có quyền" });
            }
        }

        const [rooms, services, regulations] = await Promise.all([
            Room.find({ _id: { $in: post.roomIds }, isDeleted: false })
                .select('id roomNumber floorId price area images status').lean(),
            BuildingService.find({ buildingId: post.buildingId._id, isDeleted: false })
                .select('name label description chargeType fee currency').lean(),
            Regulation.find({ buildingId: post.buildingId._id, status: 'active' })
                .select('title description type effectiveFrom').lean(),
        ]);

        res.json({
            success: true,
            data: { post, building: post.buildingId, rooms, services, regulations },
        });
    } catch (err) {
        console.error('Lỗi getPostDetail:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết bài đăng' });
    }
};

const softDelete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const post = await Post.findById(id);
        if (!post || post.isDeleted) {
            return res.status(404).json({ message: 'Không tìm thấy bài đăng!' });
        }

        if (req.user.role === "staff") {
            if (String(post.createdBy) !== String(req.user._id)) {
                return res.status(403).json({ message: "Bạn chỉ được xóa bài đăng do mình tạo!" });
            }
            if (!req.staff?.assignedBuildingIds.includes(String(post.buildingId))) {
                return res.status(403).json({ message: "Bạn không được quản lý tòa nhà này" });
            }
        } else if (req.user.role === "landlord") {
            if (String(post.landlordId) !== String(req.user._id)) {
                return res.status(403).json({ message: "Không có quyền" });
            }
        }

        post.isDeleted = true;
        post.status = 'hidden';
        await post.save();

        res.json({ success: true, message: 'Đã xóa bài đăng (mềm)!' });
    } catch (err) {
        console.error('Lỗi softDelete:', err.message);
        res.status(500).json({ message: "Lỗi hệ thống khi xóa bài đăng" });
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