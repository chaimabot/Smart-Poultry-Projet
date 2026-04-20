const express = require("express");
const router = express.Router();
const porteController = require("../controllers/porteController");
const doorController = require("../controllers/doorController");
const { protect } = require("../middlewares/auth");

router.use(protect);

// Route : POST /api/porte/:id/control
router.post("/:id/control", porteController.handleControlPorte);

// Route : POST /api/porte/:id/planning
router.post("/:id/planning", doorController.updateDoorSchedule);

module.exports = router;
