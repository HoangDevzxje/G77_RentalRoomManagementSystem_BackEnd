const Account = require("../../models/Account");

const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search ? req.query.search.trim() : "";

        const query = search
            ? { email: { $regex: search, $options: "i" } } // tìm kiếm không phân biệt hoa thường
            : {};

        const totalUsers = await Account.countDocuments(query);

        const users = await Account.find(query)
            .select("-password -accessToken -refreshToken")
            .skip((page - 1) * limit)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean();

        const totalPages = Math.ceil(totalUsers / limit);

        res.status(200).json({
            page,
            limit,
            totalUsers,
            totalPages,
            users,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Lỗi lấy danh sách người dùng" });
    }
};

const getAccountInfo = async (req, res) => {
    try {
        const accountId = req.params.id;

        const account = await Account.findById(accountId)
            .select("-password -accessToken -refreshToken")
            .populate("userInfo"); 

        if (!account) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản!" });
        }

        res.status(200).json({
            message: "Lấy thông tin cá nhân thành công!",
            user: account
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server!", error: error.message });
    }
};


const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const updateUserRole = await Account.findByIdAndUpdate(
            id,
            { role },
            { new: true }
        ).select('-password -accessToken -refreshToken');

        if (!updateUserRole) return res.status(404).json({ message: 'Không tìm thấy người dụng' });
        res.status(200).json({
            message: `Cập nhật quyền thành công: ${updateUserRole.name} → ${updateUserRole.role}`,
            user: updateUserRole
        })
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Lỗi cập nhaajpp role người dùng" });
    }
};

const channgStatusUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await Account.findById(userId).select("isActivated");
        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng" });
        }
        user.isActivated = !user.isActivated;
        await user.save();
        res.status(200).json({ message: "Thay đổi trạng thái thành công", data: user });
    } catch (err) {
        res.status(500).json({ message: "Lối cập nhật trạng thái người dùng" });
    }
}

module.exports = {
    getAllUsers,
    updateRole,
    channgStatusUser,
    getAccountInfo
};