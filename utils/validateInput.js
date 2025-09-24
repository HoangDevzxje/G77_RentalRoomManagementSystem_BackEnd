const validateEmail = (email) => {
    if (!/[\w.-]+@[\w.-]+\.\w+/.test(email)) {
        return "Email không hợp lệ!";
    }
    return null;
};

const validatePassword = (password) => {
    if (password.length < 8) {
        return "Mật khẩu phải chứa ít nhất 8 ký tự!";
    }
    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return "Mật khẩu phải có ít nhất 1 chữ hoa, chữ thường, số và ký tự đặc biệt!";
    }
    return null;
};
const validatePhone = (phone) => {
    const phoneRegex = /^(0[3|5|7|8|9])+([0-9]{8})$/;
    if (!phoneRegex.test(phone)) {
        return "Số điện thoại không hợp lệ!";
    }
    return null;
};

const validateUtils = {
    validateEmail,
    validatePassword,
    validatePhone
};
module.exports = validateUtils;