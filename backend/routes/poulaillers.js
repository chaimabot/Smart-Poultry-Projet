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

const { protect } = require("../middlewares/auth");

router.use(protect);

router.get("/summary", getPoulaillersSummary);
router.get("/critical", getCriticalPoulaillers);
router.get("/archives", getArchivedPoulaillers);

router.get("/", getPoulaillers);
router.post("/", createPoulailler);

router.get("/:id", getPoulailler);
router.put("/:id", updatePoulailler);
router.delete("/:id", deletePoulailler);

router.post("/:id/archive", archivePoulailler);

router.get("/:id/thresholds", getThresholds);
router.put("/:id/thresholds", updateThresholds);
router.post("/:id/thresholds/reset", resetThresholds);

router.get("/:id/current-measures", getCurrentMeasures);
router.get("/:id/monitoring", getMonitoringData);
router.get("/:id/history", getMeasureHistory);

// ✅ IMPORTANT : route utilisée par les boutons équipements
router.patch("/:id/actuators", controlActuator);

module.exports = router;
