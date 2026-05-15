const express = require("express");
const router = express.Router();
const { getWifi, updateWifi } = require("../controllers/Wificontroller");
const protect = require("../middleware/auth"); // ton middleware d'auth existant

// GET  /api/wifi/:poulaillerId  — SSID actuel enregistré pour ce poulailler
router.get("/:poulaillerId", protect, getWifi);

// PUT  /api/wifi/:poulaillerId  — Nouveau WiFi → sauvegarde SSID + envoi MQTT à ESP32
router.put("/:poulaillerId", protect, updateWifi);

module.exports = router;
