// routes/parametres.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Poulailler = require("../models/Poulailler");
const { protect, admin } = require("../middlewares/auth");

// ───────────────────────────────────────────────
// Récupérer les seuils par défaut (depuis DB)
// ───────────────────────────────────────────────
const { getParametres, updateParametres } = require("../controllers/parametresController");

router.get("/", protect, admin, getParametres);

// ───────────────────────────────────────────────
// Mettre à jour les seuils par défaut (depuis DB)
// ───────────────────────────────────────────────
router.put("/", protect, admin, updateParametres);


// ────────────────────────────────────────────────
// Mettre à jour les seuils d'un poulailler existant
// ────────────────────────────────────────────────
router.put("/:poulaillerId", protect, admin, async (req, res) => {
  try {
    const { poulaillerId } = req.params;
    const { thresholds } = req.body;

    console.log(`[PARAMETRES PUT] ID: ${poulaillerId}`);
    console.log(`[PARAMETRES PUT] Body reçu:`, req.body);

    if (!mongoose.Types.ObjectId.isValid(poulaillerId)) {
      return res.status(400).json({
        success: false,
        error: "ID du poulailler invalide (doit être un ObjectId valide)",
      });
    }

    const poulailler = await Poulailler.findById(poulaillerId);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    if (
      !thresholds ||
      typeof thresholds !== "object" ||
      Object.keys(thresholds).length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Aucun seuil valide fourni dans la requête",
      });
    }

    // Mise à jour sécurisée
    poulailler.thresholds = {
      ...poulailler.thresholds, // garde les valeurs existantes
      ...thresholds, // écrase avec les nouvelles
    };

    await poulailler.save();

    res.status(200).json({
      success: true,
      message: "Seuils mis à jour",
      updatedThresholds: poulailler.thresholds,
    });
  } catch (err) {
    console.error("[PARAMETRES PUT ERROR]", err.message, err.stack);
    res.status(500).json({
      success: false,
      error: "Erreur serveur interne",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Route de test
router.get("/test", protect, admin, (req, res) => {
  res.json({
    success: true,
    message: "Route /api/admin/parametres fonctionne",
  });
});

module.exports = router;
