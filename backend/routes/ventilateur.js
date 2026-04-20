const express = require("express");
const router = express.Router();
const ventilateurController = require("../controllers/ventilateurController");

// Route : PATCH /api/ventilateur/:id/control
router.patch("/:id/control", ventilateurController.handleUpdateVentilateur);

// Route : PUT /api/ventilateur/:id (for backward compatibility)
router.put("/:id", ventilateurController.handleUpdateVentilateur);

module.exports = router;
