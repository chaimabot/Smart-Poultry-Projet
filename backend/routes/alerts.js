const express = require("express");
const router = express.Router();
const {
  getAlerts,
  markAsRead,
  markOneAsRead,
  markBulkAsRead,
  createAlert,
  deleteReadAlerts,
  deleteOneAlert,
  deleteBulkAlerts,
  getAlertStats,
} = require("../controllers/alertsController");
const { protect } = require("../middlewares/auth");

router.use(protect);

// ── GET ───────────────────────────────────────────────────────────────────────
router.get("/stats", getAlertStats);
router.get("/poulailler/:poulaillerId", getAlerts);
router.get("/", getAlerts);

// ── POST ──────────────────────────────────────────────────────────────────────
router.post("/read", markAsRead);
router.post("/", createAlert);

// ── PATCH ─────────────────────────────────────────────────────────────────────
// ⚠️ /bulk/read DOIT être avant /:id/read pour éviter que "bulk" soit interprété comme un ID
router.patch("/bulk/read", markBulkAsRead);
router.patch("/:id/read", markOneAsRead);

// ── DELETE ────────────────────────────────────────────────────────────────────
// ⚠️ /bulk DOIT être avant /:id pour la même raison
router.delete("/bulk", deleteBulkAlerts);
router.delete("/:id", deleteOneAlert);
router.delete("/", deleteReadAlerts);

module.exports = router;
