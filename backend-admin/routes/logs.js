const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const { getLogs, getLogsStats } = require("../controllers/logsController");

// All routes require authentication and admin role
router.use(protect, admin);

// List all logs
router.get("/", getLogs);

// Get log statistics
router.get("/stats", getLogsStats);

module.exports = router;
