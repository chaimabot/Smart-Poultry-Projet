// controllers/adminController.js
const SystemConfig = require("../models/SystemConfig");

// ============================================================
// GESTION DES SEUILS PAR DÉFAUT (ADMIN SEULEMENT)
// ============================================================

// @desc    Obtenir les seuils par défaut globaux
// @route   GET /api/admin/default-thresholds
// @access  Private/Admin
exports.getDefaultThresholds = async (req, res) => {
  try {
    // Récupérer les seuils par défaut depuis SystemConfig
    const defaultThresholds = await SystemConfig.getDefaultThresholds();

    res.status(200).json({
      success: true,
      data: defaultThresholds,
    });
  } catch (err) {
    console.error("[GET DEFAULT THRESHOLDS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des seuils par défaut",
    });
  }
};

// @desc    Mettre à jour les seuils par défaut globaux
// @route   PUT /api/admin/default-thresholds
// @access  Private/Admin
exports.updateDefaultThresholds = async (req, res) => {
  try {
    const {
      temperatureMin,
      temperatureMax,
      humidityMin,
      humidityMax,
      co2Max,
      co2Warning,
      co2Critical,
      nh3Max,
      dustMax,
      waterLevelMin,
    } = req.body;

    // Validation des valeurs
    if (
      temperatureMin !== undefined &&
      (temperatureMin < -10 || temperatureMin > 50)
    ) {
      return res.status(400).json({
        success: false,
        error: "temperatureMin doit être entre -10 et 50",
      });
    }

    if (
      temperatureMax !== undefined &&
      (temperatureMax < -10 || temperatureMax > 50)
    ) {
      return res.status(400).json({
        success: false,
        error: "temperatureMax doit être entre -10 et 50",
      });
    }

    // Préparer l'objet de mise à jour
    const thresholdsToUpdate = {};

    if (temperatureMin !== undefined)
      thresholdsToUpdate.temperatureMin = temperatureMin;
    if (temperatureMax !== undefined)
      thresholdsToUpdate.temperatureMax = temperatureMax;
    if (humidityMin !== undefined) thresholdsToUpdate.humidityMin = humidityMin;
    if (humidityMax !== undefined) thresholdsToUpdate.humidityMax = humidityMax;

    // Gérer les noms de champs CO2 (co2Max, co2Warning, co2Critical)
    if (co2Max !== undefined) thresholdsToUpdate.co2Max = co2Max;
    if (co2Warning !== undefined) thresholdsToUpdate.co2Warning = co2Warning;
    if (co2Critical !== undefined) thresholdsToUpdate.co2Critical = co2Critical;

    if (nh3Max !== undefined) thresholdsToUpdate.nh3Max = nh3Max;
    if (dustMax !== undefined) thresholdsToUpdate.dustMax = dustMax;
    if (waterLevelMin !== undefined)
      thresholdsToUpdate.waterLevelMin = waterLevelMin;

    // Vérifier qu'au moins un seuil est fourni
    if (Object.keys(thresholdsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun seuil à mettre à jour",
      });
    }

    // Mettre à jour les seuils par défaut
    const updatedThresholds =
      await SystemConfig.updateDefaultThresholds(thresholdsToUpdate);

    console.log("[DEFAULT THRESHOLDS UPDATED]", updatedThresholds);

    res.status(200).json({
      success: true,
      message: "Seuils par défaut mis à jour avec succès",
      data: updatedThresholds,
    });
  } catch (err) {
    console.error("[UPDATE DEFAULT THRESHOLDS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour des seuils par défaut",
    });
  }
};
