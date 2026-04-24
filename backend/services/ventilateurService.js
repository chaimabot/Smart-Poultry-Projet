const Poulailler = require("../models/Poulailler");
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

const updateVentilateur = async (poulaillerId, mode, action) => {
  // 1. Mise à jour dans MongoDB
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler non trouvé");

  poulailler.actuatorStates.ventilation.mode = mode;
  poulailler.actuatorStates.ventilation.status = action;

  await poulailler.save();

  // 2. Envoi du message MQTT à l'ESP32
  const client = getMqttClient();
  if (client && client.connected) {
    // ✅ FIX : macAddress au lieu de uniqueCode ou _id
    const macAddress = await getMacAddress(poulaillerId);
    const topic = `poulailler/${macAddress}/cmd/fan`;
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
