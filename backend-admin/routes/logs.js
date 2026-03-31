 const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getLogs,
  getLogsStats,
  exportLogs,
  cleanupLogs,
} = require("../controllers/logsController");

// All routes require authentication and admin role
router.use(protect, admin);

// List all logs
router.get("/", getLogs);

// Get log statistics
router.get("/stats", getLogsStats);

// Export logs
router.get("/export", exportLogs);

// Cleanup old logs
router.delete("/cleanup", cleanupLogs);

module.exports = router;
