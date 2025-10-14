
const Account = require("../models/Account");
const jwt = require("jsonwebtoken");

const checkAuthorize =
  (roles = []) =>
    async (req, res, next) => {
      const authHeader = req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ message: "Không có token hoặc token không đúng định dạng!" });
      }
      const token = authHeader.replace("Bearer ", "");
      try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN); // hoặc JWT_SECRET nếu bạn dùng tên đó
        const user = await Account.findById(decoded.id);
        if (!user)
          return res.status(401).json({ message: "Người dùng không tồn tại!" });

        req.user = user; // có thể dùng req.user._id, req.user.role

        if (roles.length && !roles.includes(user.role)) {
          return res
            .status(403)
            .json({ message: "Bạn không có quyền thực hiện hành động này!" });
        }
        next();
      } catch (error) {
        console.error("Lỗi xác thực token:", error.message);
        return res
          .status(401)
          .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }
    };

module.exports = { checkAuthorize };
