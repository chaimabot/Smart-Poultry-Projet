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

const lampeService = {
  // ============================================================================
  // Envoyer une commande lampe à l'ESP32 et logger en BD
  // @param {string} id     — ObjectId MongoDB du poulailler
  // @param {string} mode   — "auto" | "manual"
  // @param {string} action — "on" | "off"
  // ============================================================================
  async sendLampCommand(id, mode, action) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    const client = getMqttClient();
    if (!client || !client.connected) throw new Error("MQTT non connecté");

    // ✅ Résoudre la MAC pour le topic
    const macAddress = await getMacAddress(id);
    const topic = `poulailler/${macAddress}/cmd/lamp`;

    // Format correct : ESP32 attend {"on": true/false, "mode": "auto"/"manual"}
    const payload = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });

    client.publish(topic, payload, { qos: 1 });
    console.log(`[MQTT→ESP32] ${topic}: ${payload}`);

    // =========================================================================
    // ✅ CORRECTION CRITIQUE : sauvegarder le mode ET le statut en base
    // Sans ça, fetchPoultryInfo lit toujours actuatorStates.lamp = undefined
    // → lampAutoRef reste false → le mobile croit toujours être en mode manuel
    // =========================================================================
    await Poulailler.findByIdAndUpdate(id, {
      $set: {
        "actuatorStates.lamp.mode": mode, // "auto" ou "manual"
        "actuatorStates.lamp.status": action, // "on" ou "off"
        "actuatorStates.lamp.updatedAt": new Date(),
      },
    });

    console.log(
      `[DB] actuatorStates.lamp mis à jour → mode: ${mode}, status: ${action}`,
    );

    // Garder une trace de la commande en base
    return await Command.create({
      poulailler: id,
      typeActionneur: "lampe",
      action,
      mode,
      status: "sent",
    });
  },

  // ============================================================================
  // Mettre à jour les seuils température et synchroniser avec l'ESP32
  // ============================================================================
  async updateAndSyncThresholds(id, temperatureMin, temperatureMax) {
    // Mise à jour dans MongoDB
    const poulailler = await Poulailler.findByIdAndUpdate(
      id,
      {
        "thresholds.temperatureMin": Number(temperatureMin),
        "thresholds.temperatureMax": Number(temperatureMax),
      },
      { new: true },
    );

    if (!poulailler)
      throw new Error("Poulailler introuvable en base de données");

    // ✅ Synchronisation avec l'ESP32 via MAC
    const client = getMqttClient();
    if (client && client.connected) {
      try {
        const macAddress = await getMacAddress(id);
        const configTopic = `poulailler/${macAddress}/config`;
        const configPayload = JSON.stringify({
          tempMin: Number(temperatureMin),
          tempMax: Number(temperatureMax),
        });

        client.publish(configTopic, configPayload, { qos: 1, retain: false });
        console.log(
          `[MQTT] Config lampe envoyée sur ${configTopic}:`,
          configPayload,
        );
      } catch (err) {
        console.warn(
          "[lampeService] Impossible d'envoyer la config MQTT:",
          err.message,
        );
      }
    }

    return poulailler.thresholds;
  },
};

module.exports = lampeService;
