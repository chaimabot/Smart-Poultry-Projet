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
} = require("../controllers/poulaillerController");
const {
  getDoorSchedule,
  updateDoorSchedule,
  getDoorHistory,
} = require("../controllers/doorController");
const { protect } = require("../middlewares/auth");

router.use(protect);

router.post("/", createPoulailler);
router.get("/", getPoulaillers);
router.get("/archives", getArchivedPoulaillers);
router.get("/summary", getPoulaillersSummary);
router.get("/critical", getCriticalPoulaillers);

router.get("/:id", getPoulailler);
router.put("/:id", updatePoulailler);
router.delete("/:id", deletePoulailler);
router.post("/:id/archive", archivePoulailler);

router.get("/:id/thresholds", getThresholds);
router.put("/:id/thresholds", updateThresholds);
router.post("/:id/thresholds/reset", resetThresholds);
router.get("/:id/current-measures", getCurrentMeasures);

router.get("/:id/monitoring", getMonitoringData);

// ✅ ROUTE UNIQUE pour les actionneurs
router.patch("/:id/actuators", controlActuator);

router.get("/:id/history", getMeasureHistory);

// [DOOR] Door scheduling routes
router.get("/:id/door/schedule", getDoorSchedule);
router.post("/:id/door/schedule", updateDoorSchedule);
router.get("/:id/door/history", getDoorHistory);

module.exports = router;
