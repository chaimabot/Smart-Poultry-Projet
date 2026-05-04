const express = require("express");
const router = express.Router();
const {
  createPoulailler,
  getPoulaillers,
  getPoulailler,
  updatePoulailler,
  deletePoulailler,
  archivePoulailler,
  getPoulaillersSummary,
  getCriticalPoulaillers,
  getThresholds,
  updateThresholds,
  resetThresholds,
  getCurrentMeasures,
  getArchivedPoulaillers,
  getMonitoringData,
  controlActuator,

  getMeasureHistory,
} = require("../controllers/poulaillersController");
const {
  getDoorSchedule,
  updateDoorSchedule,
  getDoorHistory,
} = require("../controllers/doorController");
const { protect } = require("../middlewares/auth");

// Toutes les routes sont protégées
router.use(protect);

router.post("/", createPoulailler);

// Liste des poulaillers non archivés
router.get("/", getPoulaillers);

// Liste des poulaillers archivés
router.get("/archives", getArchivedPoulaillers);

// Routes Spéciales (Avant :id)
router.get("/summary", getPoulaillersSummary);
router.get("/critical", getCriticalPoulaillers);

router.get("/:id", getPoulailler);
router.put("/:id", updatePoulailler);
router.delete("/:id", deletePoulailler);
router.post("/:id/archive", archivePoulailler);

// Seuils & Monitoring
router.get("/:id/thresholds", getThresholds);
router.put("/:id/thresholds", updateThresholds);
router.post("/:id/thresholds/reset", resetThresholds);
router.get("/:id/current-measures", getCurrentMeasures);

// ✅ Nouvelles routes
router.get("/:id/monitoring", getMonitoringData); // Monitoring complet + historique 24h
router.patch("/:id/actuators", controlActuator); // Contrôle porte / ventilation
router.get("/:id/history", getMeasureHistory); // Historique par capteur et période
router.get("/:id/commands", getPoulaillerCommands); // Historique des commandes
router.patch("/:id/actuators", controlActuator);

// [DOOR] Door scheduling routes
router.get("/:id/door/schedule", getDoorSchedule);
router.post("/:id/door/schedule", updateDoorSchedule);
router.get("/:id/door/history", getDoorHistory);

module.exports = router;
