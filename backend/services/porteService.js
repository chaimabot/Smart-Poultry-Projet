const Poulailler = require("../models/Poulailler");
const Module = require("../models/Module");
const { getMqttClient } = require("./mqttService");

// ============================================================================
// HELPER : obtenir la macAddress du device associé au poulailler
// ✅ La MAC est désormais l'identifiant MQTT — pas uniqueCode ni _id
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

// ============================================================================
// HELPER : obtenir l'heure courante au format { h, m } (fuseau Tunis)
// ============================================================================
const getDoorTimeParts = () => {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    timeZone: process.env.DOOR_TIMEZONE || "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

  return { h: hour, m: minute };
};

// ============================================================================
// Commande manuelle porte (open / close / stop)
// @param {string} poulaillerId  — ObjectId MongoDB du poulailler
// @param {string} action        — "open" | "close" | "stop"
// ============================================================================
const updatePorte = async (poulaillerId, action) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler introuvable");

  const client = getMqttClient();
  if (!client || !client.connected) {
    throw new Error("Le serveur MQTT est déconnecté");
  }

  // ✅ Résoudre la MAC pour construire le topic correct
  const macAddress = await getMacAddress(poulaillerId);
  const topic = `poulailler/${macAddress}/cmd/door`;
  const payload = JSON.stringify({ action });

  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Publish ${topic} -> ${payload}`);
};

// ============================================================================
// Publier la configuration du planning porte vers l'ESP32
// @param {string} poulaillerId
// @param {object} schedule — { openHour, openMinute, closeHour, closeMinute, enabled }
// ============================================================================
const publishDoorConfig = async (poulaillerId, schedule) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler introuvable");

  const client = getMqttClient();
  if (!client || !client.connected) {
    throw new Error("Le serveur MQTT est déconnecté");
  }

  // ✅ Résoudre la MAC
  const macAddress = await getMacAddress(poulaillerId);
  const topic = `poulailler/${macAddress}/config`;

  const payload = JSON.stringify({
    doorSched: {
      openH: schedule.openHour,
      openM: schedule.openMinute,
      closeH: schedule.closeHour,
      closeM: schedule.closeMinute,
      active: schedule.enabled,
    },
    currentTime: getDoorTimeParts(),
  });

  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Publish ${topic} -> ${payload}`);
};

// ============================================================================
// Synchroniser l'horloge de l'ESP32 (appelé toutes les 60s par mqttService)
// @param {string} poulaillerId
// @param {string} macAddress   — passé directement par mqttService pour éviter
//                                un double lookup DB à chaque tick
// ============================================================================
const syncDoorClock = async (poulaillerId, macAddress) => {
  try {
    // Si la MAC n'est pas passée (appel direct), la récupérer
    if (!macAddress) {
      const device = await Module.findOne({ poulailler: poulaillerId });
      if (!device?.macAddress) return false;
      macAddress = device.macAddress;
    }

    const client = getMqttClient();
    if (!client || !client.connected) return false;

    const topic = `poulailler/${macAddress}/config`; // ✅ MAC
    const payload = JSON.stringify({
      currentTime: getDoorTimeParts(),
    });

    client.publish(topic, payload, { qos: 0 });
    return true;
  } catch (err) {
    console.error("[porteService] syncDoorClock error:", err.message);
    return false;
  }
};

module.exports = { updatePorte, publishDoorConfig, syncDoorClock };
