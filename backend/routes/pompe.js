const express = require("express");
const router = express.Router();

// On importe le controller qui va utiliser le service
const PompeController = require("../controllers/PompeController");

// Middleware de sécurité
const { protect } = require("../middlewares/auth");

// Protection de toutes les routes
router.use(protect);

// Action directe : Allumer/Éteindre ou changer de Mode
// PATCH /api/pompe/:id/control
router.patch("/:id/control", PompeController.controlPump);

// Configuration : Modifier les seuils de niveau d'eau
// PUT /api/pompe/:id/thresholds
router.put("/:id/thresholds", PompeController.updateThresholds);

module.exports = router;
