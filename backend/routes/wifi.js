const express = require("express");
const router = express.Router();
const { getWifi, updateWifi } = require("../controllers/Wificontroller");

// GET  /api/wifi/:poulaillerId  — SSID actuel enregistré pour ce poulailler
router.get("/:poulaillerId", getWifi);

// PUT  /api/wifi/:poulaillerId  — Nouveau WiFi → sauvegarde SSID + envoi MQTT à ESP32
router.put("/:poulaillerId", updateWifi);

module.exports = router;
