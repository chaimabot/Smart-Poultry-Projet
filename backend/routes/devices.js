const express = require("express");
const router = express.Router();
const Module = require("../models/Module");
const { protect } = require("../middlewares/auth");

router.use(protect);

// GET /devices/by-poulailler/:poulaillerId
// Retourne le module (device ESP32) associé à un poulailler
// Utilisé par le mobile pour obtenir la macAddress pour les topics MQTT
router.get("/by-poulailler/:poulaillerId", async (req, res) => {
  try {
    const device = await Module.findOne({
      poulailler: req.params.poulaillerId,
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        error: "Aucun module associé à ce poulailler",
      });
    }

    res.json({ success: true, data: device });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: err.message || "Erreur serveur" });
  }
});

module.exports = router;
