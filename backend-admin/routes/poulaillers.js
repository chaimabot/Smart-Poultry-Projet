// routes/poulaillers.js
const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth");
const Poulailler = require("../models/Poulailler");
const SystemConfig = require("../models/SystemConfig");

// ============================================================
// GESTION DES SEUILS PAR POULAILLER (ÉLEVEUR)
// ============================================================

// @desc    Obtenir les seuils d'un poulailler spécifique
// @route   GET /api/poulaillers/:id/seuils
// @access  Private (propriétaire du poulailler)
router.get("/:id/seuils", protect, async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    // Vérifier que l'utilisateur est le propriétaire
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé - vous n'êtes pas propriétaire de ce poulailler",
      });
    }

    res.status(200).json({
      success: true,
      data: poulailler.seuils,
    });
  } catch (err) {
    console.error("[GET SEUILS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des seuils",
    });
  }
});

// @desc    Mettre à jour les seuils d'un poulailler spécifique
// @route   PUT /api/poulaillers/:id/seuils
// @access  Private (propriétaire du poulailler)
router.put("/:id/seuils", protect, async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    // Vérifier que l'utilisateur est le propriétaire
    if (poulailler.owner.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "Accès refusé - vous n'êtes pas propriétaire de ce poulailler",
      });
    }

    const {
      temperatureMin,
      temperatureMax,
      humidityMin,
      humidityMax,
      co2Max,
      nh3Max,
      dustMax,
      waterLevelMin,
    } = req.body;

    // Préparer l'objet de mise à jour
    const seuilsToUpdate = {};

    if (temperatureMin !== undefined)
      seuilsToUpdate.temperatureMin = temperatureMin;
    if (temperatureMax !== undefined)
      seuilsToUpdate.temperatureMax = temperatureMax;
    if (humidityMin !== undefined) seuilsToUpdate.humidityMin = humidityMin;
    if (humidityMax !== undefined) seuilsToUpdate.humidityMax = humidityMax;
    if (co2Max !== undefined) seuilsToUpdate.co2Max = co2Max;
    if (nh3Max !== undefined) seuilsToUpdate.nh3Max = nh3Max;
    if (dustMax !== undefined) seuilsToUpdate.dustMax = dustMax;
    if (waterLevelMin !== undefined)
      seuilsToUpdate.waterLevelMin = waterLevelMin;

    // Vérifier qu'au moins un seuil est fourni
    if (Object.keys(seuilsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun seuil à mettre à jour",
      });
    }

    // Mettre à jour seulement le champ seuils
    poulailler.seuils = {
      ...poulailler.seuils,
      ...seuilsToUpdate,
    };

    await poulailler.save();

    console.log(
      "[SEUILS UPDATED] Poulailler:",
      poulailler._id,
      "Seuils:",
      poulailler.seuils,
    );

    res.status(200).json({
      success: true,
      message: "Seuils personnalisés mis à jour avec succès",
      data: poulailler.seuils,
    });
  } catch (err) {
    console.error("[UPDATE SEUILS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour des seuils",
    });
  }
});

// ============================================================
// CRÉATION D'UN NOUVEAU POULAILLER (AVEC COPIE DES SEUILS)
// ============================================================

// Cette route est un exemple de comment copier les seuils par défaut
// lors de la création d'un nouveau poulailler
// À intégrer dans votre contrôleur de création de poulailler existant

/*
  // Dans votre contrôleur de création de poulailler :
  
  // 1. Récupérer les seuils par défaut depuis SystemConfig
  const defaultThresholds = await SystemConfig.getDefaultThresholds();

  // 2. Créer le poulailler avec les seuils copiés
  const poulailler = await Poulailler.create({
    owner: req.user._id,
    name: req.body.name,
    type: req.body.type,
    animalCount: req.body.animalCount,
    // ... autres champs
    seuils: { ...defaultThresholds } // Copie des seuils par défaut
  });
*/

module.exports = router;
