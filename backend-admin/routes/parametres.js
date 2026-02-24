// routes/parametres.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Poulailler = require("../models/Poulailler");
const { protect, admin } = require("../middlewares/auth");

// ───────────────────────────────────────────────
// Récupérer les seuils par défaut (codés en dur)
// ───────────────────────────────────────────────
router.get("/", protect, admin, (req, res) => {
  const defaultThresholds = {
    temperatureMin: 18,
    temperatureMax: 28,
    humidityMin: 40,
    humidityMax: 70,
    co2Max: 1500,
    nh3Max: 25,
    dustMax: 150,
    waterLevelMin: 20,
  };

  res.status(200).json({
    success: true,
    defaults: defaultThresholds,
    message:
      "Ces valeurs sont appliquées aux nouveaux poulaillers (codées dans le modèle Poulailler)",
  });
});

// ───────────────────────────────────────────────
// Mettre à jour les seuils par défaut (globaux)
// ───────────────────────────────────────────────
router.put("/", protect, admin, async (req, res) => {
  try {
    const { thresholds } = req.body;

    console.log("[PARAMETRES PUT] Body reçu:", req.body);

    if (!thresholds || typeof thresholds !== "object") {
      return res.status(400).json({
        success: false,
        error: "Aucun seuil valide fourni",
      });
    }

    // Ici, vous pouvez sauvegarder dans un modèle Settings si vous en avez un
    // Pour l'instant, on retourne juste les seuilsmis à jour
    const updatedThresholds = {
      temperatureMin: thresholds.temperatureMin ?? 18,
      temperatureMax: thresholds.temperatureMax ?? 28,
      humidityMin: thresholds.humidityMin ?? 40,
      humidityMax: thresholds.humidityMax ?? 70,
      co2Warning: thresholds.co2Warning ?? 2500,
      co2Critical: thresholds.co2Critical ?? 3000,
      nh3Max: thresholds.nh3Max ?? 25,
      dustMax: thresholds.dustMax ?? 150,
      waterLevelMin: thresholds.waterLevelMin ?? 20,
    };

    res.status(200).json({
      success: true,
      message: "Seuils globaux mis à jour",
      defaults: updatedThresholds,
    });
  } catch (err) {
    console.error("[PARAMETRES PUT ERROR]", err.message, err.stack);
    res.status(500).json({
      success: false,
      error: "Erreur serveur interne",
    });
  }
});

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
