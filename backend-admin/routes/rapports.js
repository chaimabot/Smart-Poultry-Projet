const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getGlobalReport,
  getAlertesReport,
  getModulesReport,
  getMesuresReport,
} = require("../controllers/rapportsController");

// All routes require authentication and admin role
router.use(protect, admin);

// Get global report
router.get("/global", getGlobalReport);

// Get alerts report
router.get("/alertes", getAlertesReport);

// Get modules report
router.get("/modules", getModulesReport);

// Get measures report
router.get("/mesures", getMesuresReport);

module.exports = router;
