const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateDetails,
  updatePassword,
} = require("../controllers/authController");
const { protect } = require("../middlewares/auth");
// ✅ NEW: Rate limiting for auth
const { authLimiter, perUserLimiter } = require("../middlewares/rateLimiter");

// ✅ Strict auth limiter on login/register (5 attempts per 15 min)
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/me", protect, getMe);
router.put("/updatedetails", protect, updateDetails);
router.put("/updatepassword", protect, updatePassword);

module.exports = router;
