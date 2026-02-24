// controllers/parametresController.js
const asyncHandler = require("express-async-handler"); // Assumes you have this for error handling, if not, install or use try-catch
const Poulailler = require("../models/Poulailler"); // For reference, but not directly used
const User = require("../models/User"); // If notifications are per user
// For simplicity, we'll assume notifications are per admin user, and default thresholds are global.
// But since defaults are in schema, to make them dynamic, we need a Settings model.
// Let's assume we create a new model for SystemSettings.

// First, you'd need to add this model in models/SystemSettings.js:
// const mongoose = require('mongoose');
// const systemSettingsSchema = new mongoose.Schema({
//   defaultThresholds: {
//     temperatureMin: { type: Number, default: 18 },
//     temperatureMax: { type: Number, default: 32 },
//     humidityMin: { type: Number, default: 40 },
//     humidityMax: { type: Number, default: 70 },
//     co2Max: { type: Number, default: 2500 },
//     nh3Max: { type: Number, default: 25 },
//     dustMax: { type: Number, default: 1.0 },
//     waterLevelMin: { type: Number, default: 20 },
//   },
//   lastUpdated: { type: Date, default: Date.now },
// });
// module.exports = mongoose.model('SystemSettings', systemSettingsSchema);

// Then, in controller:

const SystemSettings = require("../models/SystemSettings"); // Assume added

// @desc    Get system parameters (defaults and notifications)
// @route   GET /api/admin/parametres
// @access  Private/Admin
exports.getParametres = asyncHandler(async (req, res) => {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    // Create default if not exists
    settings = await SystemSettings.create({});
  }

  // Notifications could be per user, so fetch from req.user (assuming auth middleware sets req.user)
  const user = await User.findById(req.user._id);
  if (!user) {
    return res
      .status(404)
      .json({ success: false, error: "Utilisateur non trouvé" });
  }

  const notifications = {
    emailCritique: user.notifications?.emailCritique ?? true, // Assume added to User schema
    emailQuotidien: user.notifications?.emailQuotidien ?? true,
    inAppAlertes: user.notifications?.inAppAlertes ?? true,
  };

  // To add notifications to User schema, you'd update User.js:
  // Add to userSchema:
  // notifications: {
  //   emailCritique: { type: Boolean, default: true },
  //   emailQuotidien: { type: Boolean, default: true },
  //   inAppAlertes: { type: Boolean, default: true },
  // },

  res.status(200).json({
    success: true,
    seuils: settings.defaultThresholds,
    notifications,
  });
});

// @desc    Update system parameters
// @route   PUT /api/admin/parametres
// @access  Private/Admin
exports.updateParametres = asyncHandler(async (req, res) => {
  const { seuils, notifications } = req.body;

  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({});
  }

  if (seuils) {
    settings.defaultThresholds = {
      ...settings.defaultThresholds,
      ...seuils,
    };
    settings.lastUpdated = Date.now();
    await settings.save();
  }

  if (notifications) {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: "Utilisateur non trouvé" });
    }
    user.notifications = {
      ...user.notifications,
      ...notifications,
    };
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: "Paramètres mis à jour avec succès",
    data: { seuils: settings.defaultThresholds, notifications },
  });
});

// Note: To use this, add to routes in a new file or existing.
// e.g., in routes/parametres.js:
// const express = require('express');
// const router = express.Router();
// const { protect, admin } = require('../middlewares/authMiddleware');
// const { getParametres, updateParametres } = require('../controllers/parametresController');
// router.route('/').get(protect, admin, getParametres).put(protect, admin, updateParametres);
// module.exports = router;

// Then in app.js: app.use('/api/admin/parametres', require('./routes/parametres'));
