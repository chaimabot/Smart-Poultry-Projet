const Device = require("../models/Device");
const mqttService = require("../services/mqttService");

// ============================================================
// @desc    Obtenir le WiFi actuel de l'ESP32
// @route   GET /api/wifi/:poulaillerId
// @access  Private
// ============================================================
exports.getWifi = async (req, res) => {
  try {
    const device = await Device.findOne({
      poulailler: req.params.poulaillerId,
    });

    if (!device) {
      return res
        .status(404)
        .json({ success: false, error: "Device non trouvé" });
    }

    res.status(200).json({
      success: true,
      data: {
        ssid: device.wifiSsid ?? null,
        updatedAt: device.wifiUpdatedAt ?? null,
      },
    });
  } catch (err) {
    console.error("[WIFI] getWifi error:", err.message);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Mettre à jour le WiFi de l'ESP32
//          — sauvegarde le SSID en base (pas le mot de passe)
//          — envoie SSID + password à l'ESP32 via MQTT
//          — l'ESP32 sauvegarde en NVS et redémarre
// @route   PUT /api/wifi/:poulaillerId
// @access  Private
// ============================================================
exports.updateWifi = async (req, res) => {
  try {
    const { ssid, password } = req.body;

    if (!ssid || typeof ssid !== "string" || ssid.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Le champ ssid est requis" });
    }
    if (password === undefined || password === null) {
      return res
        .status(400)
        .json({ success: false, error: "Le champ password est requis" });
    }

    const device = await Device.findOne({
      poulailler: req.params.poulaillerId,
    });

    if (!device) {
      return res
        .status(404)
        .json({ success: false, error: "Device non trouvé" });
    }

    // Sauvegarde SSID uniquement en base — jamais le mot de passe
    device.wifiSsid = ssid.trim();
    device.wifiUpdatedAt = new Date();
    await device.save();

    // Envoi MQTT à l'ESP32
    const mqttClient = mqttService.getMqttClient();
    if (!mqttClient || !mqttClient.connected) {
      return res.status(502).json({
        success: false,
        error: "MQTT non connecté — commande non envoyée à l'ESP32",
      });
    }

    const topic = `poulailler/${device.macAddress}/cmd/wifi`;
    const payload = JSON.stringify({ ssid: ssid.trim(), password });

    mqttClient.publish(topic, payload, { qos: 1 });
    console.log(`[WIFI] Commande envoyée sur ${topic} — SSID: ${ssid.trim()}`);

    res.status(200).json({
      success: true,
      message: "Commande WiFi envoyée — l'ESP32 va redémarrer",
      data: {
        ssid: device.wifiSsid,
        updatedAt: device.wifiUpdatedAt,
      },
    });
  } catch (err) {
    console.error("[WIFI] updateWifi error:", err.message);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
