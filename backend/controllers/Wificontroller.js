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
//          1. Valide ssid + password
//          2. Sauvegarde le SSID en base (jamais le mot de passe)
//          3. Publie ssid + password via MQTT → ESP32 sauvegarde en NVS et redémarre
// @route   PUT /api/wifi/:poulaillerId
// @access  Private
// ============================================================
exports.updateWifi = async (req, res) => {
  try {
    const { ssid, password } = req.body;

    // ── Debug : vérifier ce que reçoit le serveur ────────────
    console.log("[WIFI] Body reçu :", req.body);
    console.log("[WIFI] ssid :", ssid);
    console.log("[WIFI] password :", password);

    // ── Validation ──────────────────────────────────────────
    if (!ssid || typeof ssid !== "string" || ssid.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Le champ ssid est requis" });
    }

    // password peut être une chaîne vide (réseau ouvert) mais pas undefined
    if (password === undefined || password === null) {
      return res
        .status(400)
        .json({
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
    const mqttClient = mqttService.getMqttClient();
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
    // IMPORTANT : la clé doit être "password" (pas "pass")
    // car l'ESP32 lit doc["password"] dans onMessage()
    const topic = `poulailler/${device.macAddress}/cmd/wifi`;
    const payload = JSON.stringify({
      ssid: ssid.trim(),
      password: String(password), // forcer string même si envoyé vide
    });

    console.log(`[WIFI] Publication MQTT → topic: ${topic}`);
    console.log(`[WIFI] Payload: ${payload}`);

    mqttClient.publish(topic, payload, { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error(`[WIFI] Erreur publication MQTT: ${err.message}`);
      } else {
        console.log(
          `[WIFI] Commande envoyée → ${topic} | SSID: ${ssid.trim()}`,
        );
      }
    });

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
