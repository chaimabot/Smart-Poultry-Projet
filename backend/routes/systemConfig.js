const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");
const SystemConfig = require("../models/SystemConfig");

// @desc    Obtenir les seuils par défaut globaux
// @route   GET /api/system-config/default-thresholds
// @access  Private
router.get("/default-thresholds", protect, async (req, res) => {
  try {
    const config = await SystemConfig.getDefaultThresholds();
    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (err) {
    console.error("[GET DEFAULT THRESHOLDS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des seuils par défaut",
    });
  }
});

module.exports = router;
