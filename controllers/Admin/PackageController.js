const Package = require('../../models/Package');
const Subscription = require('../../models/Subscription');
const mongoose = require('mongoose');
const create = async (req, res) => {
    try {
        const { name, price, durationDays, roomLimit, description, type, isActive } = req.body;
        const validTypes = ["trial", "paid"];

        if (!name) return res.status(400).json({ message: "Tên gói không được để trống" });
        if (!durationDays) return res.status(400).json({ message: "Thiếu durationDays" });
        if (!roomLimit) return res.status(400).json({ message: "Thiếu roomLimit" });

        if (type && !validTypes.includes(type)) {
            return res.status(400).json({
                message: `Type không hợp lệ. Chỉ chấp nhận: ${validTypes.join(", ")}`
            });
        }

        if (type !== "trial") {
            if (price == null || price < 0) {
                return res.status(400).json({ message: "Giá không hợp lệ" });
            }
        }

        if (durationDays <= 0) {
            return res.status(400).json({ message: "durationDays phải lớn hơn 0" });
        }
        if (roomLimit <= 0) {
            return res.status(400).json({ message: "roomLimit phải lớn hơn 0" });
        }

        if (isActive !== undefined && typeof isActive !== "boolean") {
            return res.status(400).json({ message: "isActive phải là boolean" });
        }

        const finalPrice = type === 'trial' ? 0 : price;
        const pkg = new Package({
            name,
            price: finalPrice,
            durationDays,
            roomLimit,
            description,
            type: type || 'paid',
            isActive: isActive ?? true,
            createdBy: req.user._id,
        });

        await pkg.save();
        res.status(201).json({ success: true, data: pkg });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const list = async (req, res) => {
    try {
        const packages = await Package.find();
        res.json({ success: true, data: packages });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const getById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const pkg = await Package.findById(id);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
        res.json({ success: true, data: pkg });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};

const update = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const pkg = await Package.findById(id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Không tìm thấy gói dịch vụ' });

        if (req.user.role !== 'admin' && String(pkg.createdBy) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa' });
        }
        if (req.body.type === 'trial') req.body.price = 0;

        Object.assign(pkg, req.body);
        await pkg.save();

        res.json({ success: true, data: pkg });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const remove = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const pkg = await Package.findById(id);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
        if (req.user.role !== 'admin' && String(pkg.createdBy) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Không có quyền' });
        }
        const subCount = await Subscription.countDocuments({ packageId: pkg._id });
        if (subCount > 0) {
            return res.status(409).json({ message: 'Đang có người dùng gói này không thể xóa' });
        }
        await pkg.deleteOne();
        res.json({ success: true, message: 'Đã xóa gói dịch vụ' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
const updateIsActive = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const pkg = await Package.findById(id);

        if (!pkg) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói dịch vụ' });
        }
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin mới được thay đổi trạng thái' });
        }
        pkg.isActive = !pkg.isActive;
        await pkg.save();

        res.status(200).json({
            success: true,
            message: `Đã ${pkg.isActive ? 'kích hoạt' : 'vô hiệu hóa'} gói dịch vụ thành công`,
            data: pkg,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái gói dịch vụ', error: err.message });
    }
};
const changeType = async (req, res) => {
    try {
        const { type } = req.body;
        if (!['trial', 'paid'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Giá trị type không hợp lệ (chỉ trial hoặc paid)' });
        }
        const id = req.params.id;
        if (!id) {
            return res.status(400).json({ message: 'Thiếu id' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }
        const pkg = await Package.findById(id);
        if (!pkg) return res.status(404).json({ success: false, message: 'Không tìm thấy gói dịch vụ' });

        pkg.type = type;
        if (type === 'trial') pkg.price = 0; // gói dùng thử luôn miễn phí

        await pkg.save();

        res.json({ success: true, message: `Đã đổi loại gói sang ${type}`, data: pkg });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
module.exports = {
    create,
    list,
    getById,
    update,
    remove,
    updateIsActive,
    changeType
};