const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const otpGenerator = require("otp-generator");
const sendEmail = require("../utils/sendMail");
const Account = require("../models/Account");
const UserInformation = require("../models/UserInformation");
const generateToken = require("../utils/generalToken");
const verifyEmail = require("../utils/verifyMail");
const validateUtils = require("../utils/validateInput");
// const { OAuth2Client } = require("google-auth-library");
dotenv.config();
let otpStore = {};
// const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const sendOtp = async (req, res) => {
  const { type, email } = req.body;
  try {
    const errMsg = validateUtils.validateEmail(email);
    if (errMsg !== null) {
      return res.status(400).json({ message: errMsg });
    }
    if (!["register", "reset-password"].includes(type)) {
      return res.status(400).json({ message: "Loại OTP không hợp lệ!" });
    }
    if (type === "register") {
      const userExists = await Account.findOne({ email });
      if (userExists)
        return res.status(400).json({ message: "Email đã tồn tại!" });
    } else if (type === "reset-password") {
      const user = await Account.findOne({ email });
      if (!user)
        return res.status(400).json({ message: "Email không tồn tại!" });
    }

    if (!(await verifyEmail(email))) {
      return res.status(400).json({ message: "Email không tồn tại!" });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
    const expiresAt = Date.now() + 5 * 60 * 1000;
    if (!otpStore[email]) otpStore[email] = {};
    otpStore[email][type] = { otp, isVerified: false, expiresAt };

    try {
      await sendEmail(email, otp, type);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Không thể gửi email. Vui lòng thử lại!" });
    }

    res.status(200).json({
      message: `OTP đã được gửi để ${
        type === "register" ? "đăng ký" : "đặt lại mật khẩu"
      }!`,
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
};
const verifyOtp = (req, res) => {
  const { type, email, otp } = req.body;

  if (!["register", "reset-password"].includes(type)) {
    return res.status(400).json({ message: "Loại OTP không hợp lệ!" });
  }
  if (!otpStore[email] || !otpStore[email][type])
    return res
      .status(400)
      .json({ message: "OTP không tồn tại hoặc đã hết hạn!" });
  const storedOtp = otpStore[email][type];

  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email][type];
    return res.status(400).json({ message: "OTP đã hết hạn!" });
  }

  if (storedOtp.otp !== otp) {
    return res.status(400).json({ message: "OTP không chính xác!" });
  }

  storedOtp.isVerified = true;
  res.status(200).json({ message: "OTP xác thực thành công!" });
};
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refresh_token;
    if (!token) {
      return res.status(404).json({
        status: "ERR",
        message: "Refresh token is required",
      });
    }
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.REFRESH_TOKEN, (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      });
    });
    const user = await Account.findById(decoded.id);
    if (!user || user.refreshToken !== token) {
      return res.status(403).json({
        status: "ERR",
        message: "Invalid refresh token or user",
      });
    }

    const access_token = await generateToken.genneralAccessToken({
      id: user.id,
      role: user.role,
    });

    user.accessToken = access_token;
    await user.save();

    return res.status(200).json({
      status: "OK",
      message: "Access Token được cập nhật thành công",
      access_token,
    });
  } catch (e) {
    console.log(e);
    return res.status(401).json({
      status: "ERR",
      message: "Invalid or expired token",
    });
  }
};
const register = async (req, res) => {
  const { fullName, email, password, confirmPassword, role } = req.body;
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

    // Tạo UserInformation
    const userInfo = new UserInformation({
      fullName,
      email,
      role: role || "resident",
    });
    await userInfo.save();

    // Tạo Account
    const account = new Account({
      fullName,
      email,
      password: hashedPassword,
      role: role || "resident",
      userInfo: userInfo._id,
    });
    await account.save();

    // delete otpStore[email]["register"];

    // res.status(201).json({ message: "Đăng ký thành công!" });
    // Generate OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
    const expiresAt = Date.now() + 5 * 60 * 1000;

    if (!otpStore[email]) otpStore[email] = {};
    otpStore[email]["register"] = { otp, isVerified: false, expiresAt };

    // Send OTP email
    try {
      await sendEmail(email, otp, "register");
    } catch (error) {
      // Rollback: Delete created account and user info
      await Account.deleteOne({ _id: account._id });
      await UserInformation.deleteOne({ _id: userInfo._id });

      return res.status(500).json({
        message: "Không thể gửi email xác thực. Vui lòng thử lại!",
      });
    }

    res.status(201).json({
      message:
        "Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.",
      data: {
        email,
      }
    });
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
};
const resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  const storedOtp = otpStore[email]?.["reset-password"];
  if (!storedOtp || !storedOtp.isVerified)
    return res.status(400).json({ message: "Chưa xác thực OTP!" });

  if (Date.now() > storedOtp.expiresAt) {
    delete otpStore[email]["reset-password"];
    return res.status(400).json({ message: "OTP đã hết hạn!" });
  }

  delete otpStore[email]["resetPassword"];

  const errMsg = validateUtils.validatePassword(newPassword);
  if (errMsg !== null) {
    return res.status(400).json({ message: errMsg });
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  try {
    await Account.updateOne({ email }, { password: hashedPassword });
    res.status(200).json({ message: "Mật khẩu đã được cập nhật thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
};
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Account.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ message: "Email không tồn tại!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Mật khẩu không đúng!" });

    if (user.isActivated === false)
      return res.status(400).json({ message: "Tài khoản bị khóa!" });

    const payload = { id: user._id, role: user.role };

    const accessToken = generateToken.genneralAccessToken(payload);
    const refreshToken = generateToken.genneralRefreshToken(payload);

    user.accessToken = accessToken;
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Đăng nhập thành công",
      accessToken,
      role: user.role,
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  try {
    const userFromDB = await Account.findById(req.user._id).select("+password");

    if (!userFromDB) {
      return res.status(404).json({ message: "Người dùng không tồn tại!" });
    }

    const isMatch = await bcrypt.compare(oldPassword, userFromDB.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu cũ không đúng!" });
    }

    const errMsg = validateUtils.validatePassword(newPassword);
    if (errMsg !== null) {
      return res.status(400).json({ message: errMsg });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userFromDB.password = hashedPassword;
    await userFromDB.save();

    res.status(200).json({ message: "Thay đổi mật khẩu thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
};

// const googleLogin = async (req, res) => {
//     try {
//         const { token } = req.body;
//         if (!token) {
//             return res.status(400).json({ message: "Thiếu token từ Google!" });
//         }

//         const ticket = await client.verifyIdToken({
//             idToken: token,
//             audience: process.env.GOOGLE_CLIENT_ID,
//         });

//         const payload = ticket.getPayload();
//         const { email, name, sub: googleId } = payload;

//         let user = await Account.findOne({ email });

//         if (!user) {
//             user = new Account({
//                 email,
//                 name,
//                 googleId,
//                 isActivated: true,
//                 role: "user",
//             });
//             await user.save();
//         } else if (!user.googleId) {
//             user.googleId = googleId;
//             await user.save();
//         }

//         if (user.isActivated === false) {
//             return res.status(400).json({ message: "Tài khoản bị khóa!" });
//         }
//         const tokenPayload = { id: user._id, role: user.role };

//         const accessToken = generateToken.genneralAccessToken(tokenPayload);
//         const refreshToken = generateToken.genneralRefreshToken(tokenPayload);

//         user.accessToken = accessToken;
//         user.refreshToken = refreshToken;
//         await user.save();

//         res.cookie("refresh_token", refreshToken, {
//             httpOnly: true,
//             secure: true,
//             sameSite: "none",
//             maxAge: 7 * 24 * 60 * 60 * 1000,
//         });

//         res.status(200).json({
//             message: "Đăng nhập Google thành công",
//             accessToken,
//             role: user.role,
//             email: user.email,
//         });
//     } catch (error) {
//         console.error("Lỗi googleLogin:", error);
//         res.status(500).json({ message: "Lỗi xác thực với Google." });
//     }
// };

// const facebookLogin = async (req, res) => {
//     try {
//         const { accessToken } = req.body;

//         const fbRes = await fetch(
//             `https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`
//         );
//         const fbData = await fbRes.json();

//         const { id: facebookId, email, name } = fbData;

//         if (!email) {
//             return res.status(400).json({
//                 message: "Không thể lấy email từ Facebook. Vui lòng cấp quyền email.",
//             });
//         }

//         let user = await User.findOne({ email });

//         if (user) {
//             if (!user.facebookId) {
//                 user.facebookId = facebookId;
//                 await user.save();
//             }
//         } else {
//             user = new User({
//                 name,
//                 email,
//                 facebookId,
//                 isActivated: true,
//                 role: "user",
//             });
//             await user.save();
//         }
//         if (user.isActivated === false) {
//             return res.status(400).json({ message: "Tài khoản bị khóa!" });
//         }
//         const tokenPayload = { id: user._id, role: user.role };

//         const accessTokenLogin = generateToken.genneralAccessToken(tokenPayload);
//         const refreshToken = generateToken.genneralRefreshToken(tokenPayload);

//         user.accessToken = accessToken;
//         user.refreshToken = refreshToken;
//         await user.save();

//         res.cookie("refresh_token", refreshToken, {
//             httpOnly: true,
//             secure: true,
//             sameSite: "none",
//             maxAge: 7 * 24 * 60 * 60 * 1000,
//         });

//         res.status(200).json({
//             message: "Đăng nhập Facebook thành công",
//             accessTokenLogin,
//             role: user.role,
//             email: user.email,
//         });
//     } catch (error) {
//         console.error("Facebook login error:", error);
//         res.status(500).json({ message: "Xác thực Facebook thất bại!" });
//     }
// };

const logoutUser = async (req, res) => {
  try {
    res.clearCookie("refresh_token");
    return res.status(200).json({
      status: "OK",
      message: "Log out success",
    });
  } catch (e) {
    return res.status(500).json({
      status: "ERR",
      message: e.message,
    });
  }
};
module.exports = {
  refreshToken,
  register,
  resetPassword,
  login,
  sendOtp,
  verifyOtp,
  changePassword,
  // googleLogin,
  // facebookLogin,
  logoutUser,
};
