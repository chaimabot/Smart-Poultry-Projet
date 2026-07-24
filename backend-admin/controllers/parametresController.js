// controllers/parametresController.js
const asyncHandler = require("express-async-handler");
const SystemConfig = require("../models/SystemConfig");

const ALLOWED_FIELDS = [
  "temperatureMin",
  "temperatureMax",
  "humidityMin",
  "humidityMax",
  "airQualityMin",
  "waterLevelMin",
];

// @desc    Get system parameters
// @route   GET /api/admin/parametres
// @access  Private/Admin
exports.getParametres = asyncHandler(async (req, res) => {
  console.log("📥 GET /api/admin/parametres");

  const defaults = await SystemConfig.getDefaultThresholds();

  console.log("📤 Retour defaults:", defaults);

  res.status(200).json({
    success: true,
    defaults,
  });
});

// @desc    Update system parameters
// @route   PUT /api/admin/parametres
// @access  Private/Admin
exports.updateParametres = asyncHandler(async (req, res) => {
  console.log("📥 PUT /api/admin/parametres — body:", req.body);

  const { thresholds } = req.body;

  if (!thresholds || typeof thresholds !== "object") {
    return res.status(400).json({
      success: false,
      error: "Le champ 'thresholds' est requis",
    });
  }

  // Filtrer et valider uniquement les champs autorisés
  const filtered = {};
  for (const key of ALLOWED_FIELDS) {
    if (thresholds[key] !== undefined) {
      const val = Number(thresholds[key]);
      if (isNaN(val)) {
        return res.status(400).json({
          success: false,
          error: `Valeur invalide pour '${key}': ${thresholds[key]}`,
        });
      }
      filtered[key] = val;
    }
  }

  if (Object.keys(filtered).length === 0) {
    return res.status(400).json({
      success: false,
      error: "Aucun champ valide fourni",
    });
  }

  console.log("📦 Thresholds filtrés à sauvegarder:", filtered);

  const updated = await SystemConfig.updateDefaultThresholds(filtered);

  console.log("✅ Sauvegardé en DB:", updated);

  res.status(200).json({
    success: true,
    message: "Paramètres mis à jour avec succès",
    defaults: updated,
  });
});
