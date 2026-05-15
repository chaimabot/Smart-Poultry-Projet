const express = require("express");
const router = express.Router();
const wifiController = require("../controllers/wifiController");

// Route : GET /api/wifi/:poulaillerId  — lire le SSID actuel
// Route : PUT /api/wifi/:poulaillerId  — envoyer nouveau WiFi à l'ESP32
router.get("/:poulaillerId", wifiController.getWifi);
router.put("/:poulaillerId", wifiController.updateWifi);

module.exports = router;
