const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const Module = require("../models/Module");
const { getMqttClient } = require("./mqttService");

// ============================================================================
// HELPER : obtenir la macAddress du device associé au poulailler
// ============================================================================
const getMacAddress = async (poulaillerId) => {
  const device = await Module.findOne({ poulailler: poulaillerId });
  if (!device?.macAddress) {
    throw new Error(
      `Aucun device/MAC trouvé pour le poulailler ${poulaillerId}`,
    );
  }
  return device.macAddress;
};

const pompeService = {
  // ============================================================================
  // Envoyer une commande pompe à l'ESP32 et logger en BD
  // @param {string} id     — ObjectId MongoDB du poulailler
  // @param {string} mode   — "auto" | "manual"
  // @param {string} action — "on" | "off"
  // ============================================================================
  async sendPumpCommand(id, mode, action) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    console.log(`[pompeService] Envoi commande pompe:`, {
      poulaillerId: id,
      mode,
      action,
    });

    const client = getMqttClient();
    if (!client || !client.connected) {
      console.error("[pompeService] MQTT client non connecté");
      throw new Error("MQTT client non connecté");
    }

    // ✅ Résoudre la MAC pour le topic
    const macAddress = await getMacAddress(id);
    const topic = `poulailler/${macAddress}/cmd/pump`;

    // Format correct : ESP32 attend {"on": true/false, "mode": "auto"/"manual"}
    const payload = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });

    client.publish(topic, payload, { qos: 1 });
    console.log(`[pompeService] Message MQTT publié sur ${topic}:`, payload);

    // Archivage de la commande pour l'historique
    const command = await Command.create({
      poulailler: id,
      typeActionneur: "pompe",
      action,
      mode,
      status: "sent",
    });

    console.log(`[pompeService] Commande sauvegardée en BD:`, command._id);
    return command;
  },

  // ============================================================================
  // Mettre à jour les seuils eau et synchroniser avec l'ESP32
  // ============================================================================
  async updateAndSyncThresholds(id, waterLevelMin, waterHysteresis) {
    // Mise à jour dans MongoDB
    const poulailler = await Poulailler.findByIdAndUpdate(
      id,
      {
        "thresholds.waterLevelMin": waterLevelMin,
        "thresholds.waterHysteresis": waterHysteresis,
      },
      { new: true },
    );

    if (!poulailler) throw new Error("Erreur mise à jour DB");

    console.log(`[pompeService] Seuils mis à jour:`, {
      poulaillerId: id,
      waterLevelMin,
      waterHysteresis,
    });

    // ✅ Envoi immédiat de la nouvelle config à l'ESP32 via MAC
    const client = getMqttClient();
    if (client && client.connected) {
      try {
        const macAddress = await getMacAddress(id);
        const configTopic = `poulailler/${macAddress}/config`;
        const configPayload = JSON.stringify({
          waterMin: waterLevelMin,
          waterHysteresis: waterHysteresis,
        });

        client.publish(configTopic, configPayload, { qos: 1 });
        console.log(`[pompeService] Config MQTT publiée sur ${configTopic}`);
      } catch (err) {
        console.warn(
          "[pompeService] Impossible d'envoyer la config MQTT:",
          err.message,
        );
      }
    }

    return poulailler.thresholds;
  },

  // Sécurité : vérifie si la pompe tourne depuis trop longtemps (prévention surchauffe)
  isRuntimeSafe(startTime) {
    const MAX_SECONDS = 30; // Sécurité pour petite pompe 5V
    const duration = (Date.now() - startTime) / 1000;
    return duration < MAX_SECONDS;
  },
};

module.exports = pompeService;
