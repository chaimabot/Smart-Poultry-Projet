const Device = require("../models/Module");
const mqttService = require("../services/mqttService");

// ============================================================
// @desc    Obtenir le WiFi actuel enregistré pour l'ESP32
// @route   GET /api/wifi/:poulaillerId
// @access  Private
// ============================================================
exports.getWifi = async (req, res) => {
  try {
    const device = await Device.findOne({
      poulailler: req.params.poulaillerId,
    }).populate("poulailler");

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
// @route   PUT /api/wifi/:poulaillerId
// @access  Private
// ============================================================
exports.updateWifi = async (req, res) => {
  try {
    const { ssid, password } = req.body;

    console.log("[WIFI] Body reçu :", req.body);

    // ── Validation ───────────────────────────────────────────
    if (!ssid || typeof ssid !== "string" || ssid.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Le champ ssid est requis" });
    }

    if (password === undefined || password === null) {
      return res.status(400).json({
        success: false,
        error: "Le champ password est requis (chaîne vide si réseau ouvert)",
      });
    }

    // ── Récupération device ──────────────────────────────────
    const device = await Device.findOne({
      poulailler: req.params.poulaillerId,
    });

    if (!device) {
      return res
        .status(404)
        .json({ success: false, error: "Device non trouvé" });
    }

    if (!device.macAddress) {
      return res.status(400).json({
        success: false,
        error:
          "Adresse MAC du device inconnue — impossible d'envoyer la commande",
      });
    }

    // ── Vérification MQTT ────────────────────────────────────
    // La lib "mqtt" npm expose client.connected (boolean)
    const mqttClient = mqttService.getMqttClient();

    console.log("[WIFI] mqttClient:", mqttClient ? "existe" : "null");
    console.log("[WIFI] mqttClient.connected:", mqttClient?.connected);

    if (!mqttClient || !mqttClient.connected) {
      return res.status(502).json({
        success: false,
        error: "MQTT non connecté — commande non envoyée à l'ESP32",
      });
    }

    // ── Sauvegarde SSID en base (jamais le mot de passe) ────
    device.wifiSsid = ssid.trim();
    device.wifiUpdatedAt = new Date();
    await device.save();

    // ── Publication MQTT vers l'ESP32 ────────────────────────
    const topic = `poulailler/${device.macAddress}/cmd/wifi`;
    const payload = JSON.stringify({
      ssid: ssid.trim(),
      password: String(password),
    });

    console.log(`[WIFI] Publication → topic: ${topic}`);
    console.log(`[WIFI] Payload: ${payload}`);

    // ✅ Sans callback (comme publishConfig et publishCommand dans mqttService)
    mqttClient.publish(topic, payload, { qos: 1, retain: false });

    console.log(`[WIFI] ✅ Commande envoyée → ${topic} | SSID: ${ssid.trim()}`);

    return res.status(200).json({
      success: true,
      message: "Commande WiFi envoyée — l'ESP32 va redémarrer",
      data: {
        ssid: device.wifiSsid,
        updatedAt: device.wifiUpdatedAt,
      },
    });
  } catch (err) {
    console.error("[WIFI] updateWifi error:", err.message);
    console.error("[WIFI] Stack:", err.stack);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
