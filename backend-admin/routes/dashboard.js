// routes/dashboard.js
const express = require("express");
const router = express.Router();

let protect, admin;
try {
  const auth = require("../middlewares/auth");
  protect = auth.protect;
  admin = auth.admin;
} catch (err) {
  console.error("[ERREUR] Middleware auth non chargé :", err.message);
}

// Import controllers
const {
  getDashboardStats,
  getAlertesChart,
  getModulesActivity,
  getAlertesRecentes,
  getPoulaillersCritiques,
  getActiviteRecente,
} = require("../controllers/dashboardController");

// Appliquer les middlewares seulement s'ils existent
if (protect && admin) {
  router.use(protect, admin);
} else {
  console.warn("[AVERTISSEMENT] Routes dashboard NON PROTÉGÉES");
}

// Routes
router.get("/stats", getDashboardStats);
router.get("/alertes-chart", getAlertesChart);
router.get("/modules-activity", getModulesActivity);
router.get("/alertes-recentes", getAlertesRecentes);
router.get("/poulaillers-critiques", getPoulaillersCritiques);
router.get("/activite-recente", getActiviteRecente);

// Test
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Dashboard route OK", user: req.user });
});

module.exports = router;
