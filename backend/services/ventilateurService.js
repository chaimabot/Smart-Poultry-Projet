const Poulailler = require("../models/Poulailler");
const { getMqttClient } = require("./mqttService");

const updateVentilateur = async (poulaillerId, mode, action) => {
  // 1. Mise à jour dans MongoDB
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler non trouvé");

  poulailler.actuatorStates.ventilation.mode = mode;
  poulailler.actuatorStates.ventilation.status = action; // action est "on" ou "off"

  await poulailler.save();

  // 2. Envoi du message MQTT à l'ESP32
  const client = getMqttClient();
  if (client && client.connected) {
    const poulaillerId = poulailler.uniqueCode || poulailler._id.toString();
    const topic = `poulailler/${poulaillerId}/cmd/fan`;
    // Format correct : ESP32 attend {"on": true/false, "mode": "auto"/"manual"}
    const message = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });
    client.publish(topic, message, { qos: 1 });
    console.log(`[MQTT→ESP32] ${topic}: ${message}`);
  }

  return poulailler;
};

module.exports = { updateVentilateur };
