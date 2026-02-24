const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getAlertes,
  getAlerteById,
  markAsRead,
  resolveAlerte,
  markMultipleAsRead,
  resolveMultiple,
  getAlertesStats,
  exportAlertes,
  deleteAlerte,
  deleteMultiple,
} = require("../controllers/alertesController");

// All routes require authentication and admin role
router.use(protect, admin);

// List all alerts with filters
router.get("/", getAlertes);

// Get alert statistics
router.get("/stats", getAlertesStats);

// Export alerts
router.get("/export", exportAlertes);

// Get single alert
router.get("/:id", getAlerteById);

// Mark alert as read
router.put("/:id/read", markAsRead);

// Resolve alert
router.put("/:id/resolve", resolveAlerte);

// Delete alert
router.delete("/:id", deleteAlerte);

// Mark multiple alerts as read
router.put("/mark-read", markMultipleAsRead);

// Resolve multiple alerts
router.put("/resolve-multiple", resolveMultiple);

// Delete multiple alerts
router.delete("/", deleteMultiple);

module.exports = router;
