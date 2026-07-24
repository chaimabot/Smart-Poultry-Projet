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
  deleteAlerte,
  deleteMultiple,
} = require("../controllers/alertesController");

// Load optional handlers (some controllers may not implement them yet)
const {
  getAlertesStats,
  exportAlertes,
} = require("../controllers/alertesController");

const importedHandlers = {
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
};

for (const [key, fn] of Object.entries(importedHandlers)) {
  if (typeof fn !== "function") {
    console.error(
      `[alertes routes] Missing/invalid handler: ${key}. typeof=${typeof fn}`,
    );
  }
}

// All routes require authentication and admin role

router.use(protect, admin);

// List all alerts with filters
router.get("/", getAlertes);

// Get alert statistics (optional)
if (typeof getAlertesStats === "function") {
  router.get("/stats", getAlertesStats);
}

// Export alerts (optional)
if (typeof exportAlertes === "function") {
  router.get("/export", exportAlertes);
}

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
