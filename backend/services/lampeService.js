const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const { getMqttClient } = require("./mqttService");

const lampeService = {
  async sendLampCommand(id, mode, action) {
    const poulailler = await Poulailler.findById(id);
    if (!poulailler) throw new Error("Poulailler introuvable");

    const client = getMqttClient();
    if (!client || !client.connected) throw new Error("MQTT non connecté");

    // On envoie la commande sur le topic de la lampe
    const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();
    const topic = `poulailler/${poulaillerId}/cmd/lamp`;
    // Format correct : ESP32 attend {"on": true/false, "mode": "auto"/"manual"}
    const payload = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });
    client.publish(topic, payload, { qos: 1 });
    console.log(`[MQTT→ESP32] ${topic}: ${payload}`);

    // On garde une trace de la commande en base
    return await Command.create({
      poulailler: id,
      typeActionneur: "lampe",
      action,
      mode,
      status: "sent",
    });
  },

  async updateAndSyncThresholds(id, temperatureMin, temperatureMax) {
    // 1. Mise à jour dans MongoDB (on s'assure que les types sont des nombres)
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

    // 2. Synchronisation avec l'ESP32 via MQTT
    const client = getMqttClient();
    if (client && client.connected) {
      // On utilise l'ID unique ou le code pour le topic
      const idTopic = poulailler.uniqueCode || id;
      const configTopic = `poulailler/${idTopic}/config`;

      // Le Payload doit correspondre aux clés attendues dans mqtt_handler.cpp
      const configPayload = JSON.stringify({
        tempMin: Number(temperatureMin),
        tempMax: Number(temperatureMax),
      });

      client.publish(configTopic, configPayload, { qos: 1, retain: true });
      console.log(`[MQTT] Config envoyée sur ${configTopic}:`, configPayload);
    }

    return poulailler.thresholds;
  },
};

module.exports = lampeService;
