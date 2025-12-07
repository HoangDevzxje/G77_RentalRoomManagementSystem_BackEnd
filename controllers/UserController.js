const Account = require("../models/Account");
const UserInformation = require("../models/UserInformation");
const validateUtils = require("../utils/validateInput")

const getMyProfile = async (req, res) => {
    try {
        const accountId = req.user._id;

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

const editMyProfile = async (req, res) => {
    try {
        const accountId = req.user._id;
        const { fullName, phoneNumber, dob, gender, address } = req.body;
        if (!fullName)
            return res.status(400).json({ message: "Vui lòng nhập đầy đủ tên!" });
        if (!phoneNumber)
            return res.status(400).json({ message: "Vui lòng nhập đày đủ sđt!" });

        const checkPhone = validateUtils.validatePhone(phoneNumber);
        if (checkPhone !== null) {
            return res.status(400).json({ message: checkPhone });
        }

        const account = await Account.findById(accountId).populate("userInfo");
        if (!account) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản!" });
        }

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
            message: "Lỗi hệ thống!",
            error: error.message,
        });
    }
};

const userController = {
    getMyProfile,
    editMyProfile,
};

module.exports = userController;
