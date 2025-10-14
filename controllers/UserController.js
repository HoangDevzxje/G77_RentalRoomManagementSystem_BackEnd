const Account = require("../models/Account");
const UserInformation = require("../models/UserInformation");

// [GET] /api/profile
const getMyProfile = async (req, res) => {
    try {
        const accountId = req.user._id;

        const account = await Account.findById(accountId)
            .select("-password -accessToken -refreshToken")
            .populate("userInfo"); // lấy luôn thông tin UserInformation

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

// [PUT] /api/profile
const editMyProfile = async (req, res) => {
    try {
        const accountId = req.user._id;
        const { fullName, phoneNumber, dob, gender, address } = req.body;

        // Lấy tài khoản người dùng
        const account = await Account.findById(accountId).populate("userInfo");
        if (!account) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản!" });
        }

        // Nếu chưa có userInfo thì tạo mới
        let userInfo;
        if (account.userInfo) {
            userInfo = await UserInformation.findByIdAndUpdate(
                account.userInfo._id,
                { fullName, phoneNumber, dob, gender, address },
                { new: true, runValidators: true }
            );
        } else {
            userInfo = await UserInformation.create({
                fullName, phoneNumber, dob, gender, address
            });
            account.userInfo = userInfo._id;
            await account.save();
        }

        const updatedAccount = await Account.findById(accountId)
            .select("-password -accessToken -refreshToken")
            .populate("userInfo");

        res.status(200).json({
            message: "Cập nhật thông tin cá nhân thành công!",
            user: updatedAccount
        });
    } catch (error) {
        res.status(500).json({
            message: "Lỗi server!",
            error: error.message,
        });
    }
};

const userController = {
    getMyProfile,
    editMyProfile,
};

module.exports = userController;
