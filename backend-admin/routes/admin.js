// routes/admin.js
const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getDefaultThresholds,
  updateDefaultThresholds,
} = require("../controllers/adminController");

// ============================================================
// GESTION DES SEUILS PAR DÉFAUT (GLOBAUX)
// ============================================================

// GET /api/admin/default-thresholds → obtenir les seuils par défaut
router.get("/default-thresholds", protect, admin, getDefaultThresholds);

// PUT /api/admin/default-thresholds → mettre à jour les seuils par défaut
router.put("/default-thresholds", protect, admin, updateDefaultThresholds);

// ============================================================
// TEST
// ============================================================

// Test simple pour vérifier que /api/admin est monté
router.get("/test", protect, admin, (req, res) => {
  res.json({ success: true, message: "Route admin protégée OK" });
});

module.exports = router;
