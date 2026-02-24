const express = require("express");
const router = express.Router();
const {
  getAlerts,
  markAsRead,
  createAlert,
  deleteReadAlerts,
  getAlertStats,
} = require("../controllers/alertsController");
const { protect } = require("../middlewares/auth");

router.use(protect);

// Stats (avant les routes génériques)
router.get("/stats", getAlertStats);

// CRUD alertes
router.get("/", getAlerts); // GET /api/alerts?poulaillerId=...
router.get("/poulailler/:poulaillerId", getAlerts); // Legacy
router.post("/", createAlert); // Créer une alerte
router.post("/read", markAsRead); // Marquer comme lue(s)
router.delete("/", deleteReadAlerts); // Supprimer les lues

module.exports = router;
