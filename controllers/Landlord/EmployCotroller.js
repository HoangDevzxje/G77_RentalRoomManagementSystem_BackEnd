const bcrypt = require('bcryptjs');
const Account = require('../../models/Account');
const UserInformation = require('../../models/UserInformation');
const Employee = require('../../models/Employee');
const Building = require('../../models/Building');
const Permission = require('../../models/Permission');
const validateUtils = require("../../utils/validateInput");
const createStaff = async (req, res) => {
    const {
        email,
        password,
        confirmPassword,
        fullName,
        phoneNumber,
        dob,
        gender,
        address,
        assignedBuildings,
        permissions
    } = req.body;

    const landlordId = req.user._id;

    try {
        const checkEmail = validateUtils.validateEmail(email);
        if (checkEmail !== null) {
            return res.status(400).json({ message: checkEmail });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Mật khẩu không khớp!" });
        }

        const errMsg = validateUtils.validatePassword(password);
        if (errMsg !== null) {
            return res.status(400).json({ message: errMsg });
        }

        const existingAcc = await Account.findOne({ email });
        if (existingAcc) {
            return res.status(400).json({ message: "Email đã tồn tại!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userInfo = new UserInformation({
            fullName,
            phoneNumber,
            dob: dob ? new Date(dob) : null,
            gender,
            address
        });
        await userInfo.save();

        const account = new Account({
            email,
            password: hashedPassword,
            userInfo: userInfo._id,
            role: 'staff',
            isActivated: true
        });
        await account.save();

        if (assignedBuildings?.length > 0) {
            const count = await Building.countDocuments({
                _id: { $in: assignedBuildings },
                landlordId
            });
            if (count !== assignedBuildings.length) {
                return res.status(403).json({ message: 'Một số tòa nhà không thuộc quyền quản lý' });
            }
        }

        if (permissions?.length > 0) {
            const validPerms = await Permission.find({ code: { $in: permissions } });
            if (validPerms.length !== permissions.length) {
                return res.status(400).json({ message: 'Một số quyền không tồn tại' });
            }
        }

        const employee = new Employee({
            accountId: account._id,
            landlordId,
            assignedBuildings: assignedBuildings || [],
            permissions: permissions || [],
            isActive: true
        });
        await employee.save();

        return res.status(201).json({
            message: 'Tạo nhân viên thành công. Thông tin đăng nhập đã được gửi qua email.',
            staff: {
                email,
                fullName,
                assignedBuildings,
                permissions
            }
        });

    } catch (err) {
        console.error('Lỗi tạo nhân viên:', err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};

const getStaffList = async (req, res) => {
    const landlordId = req.user._id;

    try {
        const employees = await Employee.find({
            landlordId,
            isDeleted: false
        })
            .populate({
                path: "accountId",
                select: "email userInfo",
                populate: {
                    path: "userInfo",
                    model: "UserInformation",
                    select: "fullName phoneNumber",
                },
            })
            .populate('assignedBuildings', 'name')
            .select('permissions isActive createdAt');

        return res.json(employees);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};

const getPermissions = async (req, res) => {
    try {
        const permissions = await Permission.find({}).sort({ group: 1, name: 1 });
        return res.json(permissions);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};
const updateStaffStatus = async (req, res) => {
    const { staffId } = req.params;
    const { isActive } = req.body;
    const landlordId = req.user._id;

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive phải là true/false" });
    }

    try {
        const employee = await Employee.findOne({ _id: staffId, landlordId });
        if (!employee) {
            return res.status(404).json({ message: "Không tìm thấy nhân viên hoặc không thuộc quyền quản lý" });
        }

        await Account.updateOne(
            { _id: employee.accountId },
            { isActivated: isActive }
        );

        return res.json({
            message: isActive ? "Đã kích hoạt nhân viên thành công" : "Đã khóa nhân viên thành công",
            staffId,
            isActive
        });

    } catch (err) {
        console.error('Lỗi cập nhật trạng thái nhân viên:', err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};
const updateStaffInfo = async (req, res) => {
    const { staffId } = req.params;
    const landlordId = req.user._id;
    const {
        fullName,
        phoneNumber,
        dob,
        gender,
        address
    } = req.body;

    try {
        const employee = await Employee.findOne({ _id: staffId, landlordId });
        if (!employee) {
            return res.status(404).json({ message: "Không tìm thấy nhân viên" });
        }

        const account = await Account.findById(employee.accountId).populate("userInfo");
        if (!account || !account.userInfo) {
            return res.status(404).json({ message: "Không tìm thấy thông tin tài khoản" });
        }

        if (fullName !== undefined) account.userInfo.fullName = fullName;
        if (phoneNumber !== undefined) account.userInfo.phoneNumber = phoneNumber;
        if (dob !== undefined) account.userInfo.dob = dob ? new Date(dob) : null;
        if (gender !== undefined) account.userInfo.gender = gender;
        if (address !== undefined) account.userInfo.address = address;

        await account.userInfo.save();

        return res.json({
            message: "Cập nhật thông tin nhân viên thành công",
            staffId,
            updated: { fullName, phoneNumber, dob, gender, address }
        });

    } catch (err) {
        console.error('Lỗi cập nhật thông tin nhân viên:', err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};

const updateStaffPermissions = async (req, res) => {
    const { staffId } = req.params;
    const landlordId = req.user._id;
    const { permissions, assignedBuildings } = req.body;

    try {
        const employee = await Employee.findOne({ _id: staffId, landlordId });
        if (!employee) {
            return res.status(404).json({ message: "Không tìm thấy nhân viên" });
        }

        if (assignedBuildings && assignedBuildings.length > 0) {
            const count = await Building.countDocuments({
                _id: { $in: assignedBuildings },
                landlordId
            });
            if (count !== assignedBuildings.length) {
                return res.status(403).json({ message: 'Một số tòa nhà không thuộc quyền quản lý của bạn' });
            }
        }

        if (permissions && permissions.length > 0) {
            const validPerms = await Permission.find({ code: { $in: permissions } });
            console.log(validPerms);
            if (validPerms.length !== permissions.length) {
                return res.status(400).json({ message: 'Một số quyền không tồn tại' });
            }
        }

        if (assignedBuildings !== undefined) employee.assignedBuildings = assignedBuildings;
        if (permissions !== undefined) employee.permissions = permissions;

        await employee.save();

        return res.json({
            message: "Cập nhật quyền và tòa nhà thành công",
            staffId,
            assignedBuildings: employee.assignedBuildings,
            permissions: employee.permissions
        });

    } catch (err) {
        console.error('Lỗi cập nhật quyền nhân viên:', err);
        return res.status(500).json({ message: 'Lỗi server' });
    }
};
module.exports = {
    createStaff,
    getStaffList,
    getPermissions,
    updateStaffStatus,
    updateStaffInfo,
    updateStaffPermissions
};