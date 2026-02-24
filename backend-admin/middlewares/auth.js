// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  const token =
    req.header("x-auth-token") ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: "Aucun token fourni" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: "Token invalide" });
  }
};

const admin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, error: "Accès réservé aux administrateurs" });
  }
  next();
};

module.exports = { protect, admin };
