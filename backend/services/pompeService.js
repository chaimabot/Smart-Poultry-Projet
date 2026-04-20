const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const { getMqttClient } = require("./mqttService");

const pompeService = {
  // Envoi de la commande à l'ESP32 et log dans la DB
  async sendPumpCommand(id, mode, action) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    console.log(`[pompeService] Envoi commande pompe:`, {
      poulaillerId: id,
      mode,
      action,
    });

    // Publication MQTT vers le hardware au bon topic avec le bon format
    const client = getMqttClient();
    if (!client || !client.connected) {
      console.error("[pompeService] MQTT client non connecté");
      throw new Error("MQTT client non connecté");
    }

    const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();
    const topic = `poulailler/${poulaillerId}/cmd/pump`;
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

  // Mise à jour des seuils (Min et Hystérésis) et Sync Hardware
  async updateAndSyncThresholds(id, waterLevelMin, waterHysteresis) {
    // Maj de la configuration dans MongoDB
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

    // Envoi immédiat de la nouvelle config à l'ESP32
    const client = getMqttClient();
    if (client && client.connected) {
      const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();
      const configTopic = `poulailler/${poulaillerId}/config`;
      const configPayload = JSON.stringify({
        waterMin: waterLevelMin,
        waterHysteresis: waterHysteresis,
      });

      client.publish(configTopic, configPayload, { qos: 1 });
      console.log(`[pompeService] Config MQTT publié sur ${configTopic}`);
    }

    return poulailler.thresholds;
  },

  // Sécurité : Vérifie si la pompe tourne trop longtemps (prévention surchauffe)
  isRuntimeSafe(startTime) {
    const MAX_SECONDS = 30; // Sécurité pour petite pompe 5V
    const duration = (Date.now() - startTime) / 1000;
    return duration < MAX_SECONDS;
  },
};

module.exports = pompeService;
