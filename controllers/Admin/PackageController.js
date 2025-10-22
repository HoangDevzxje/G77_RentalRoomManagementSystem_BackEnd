const Package = require('../../models/Package');
const Subscription = require('../../models/Subscription');

const create = async (req, res) => {
    try {
        const { name, price, durationDays, roomLimit, description } = req.body;
        const pkg = new Package({ name, price, durationDays, roomLimit, description, createdBy: req.user._id });
        await pkg.save();
        res.status(201).json({ success: true, data: pkg });
    } catch (err) {
        res.status(400).json({ message: err.message });
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
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
        res.json({ success: true, data: pkg });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const update = async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
        if (req.user.role !== 'admin' && String(pkg.createdBy) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Không có quyền' });
        }
        Object.assign(pkg, req.body);
        await pkg.save();
        res.json({ success: true, data: pkg });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

const remove = async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) return res.status(404).json({ message: 'Không tìm thấy gói dịch vụ' });
        if (req.user.role !== 'admin' && String(pkg.createdBy) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Không có quyền' });
        }
        const subCount = await Subscription.countDocuments({ packageId: pkg._id });
        if (subCount > 0) {
            return res.status(409).json({ message: 'Hãy xóa các subscription liên quan trước' });
        }
        await pkg.deleteOne();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports = { create, list, getById, update, remove };