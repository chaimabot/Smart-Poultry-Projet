const Poulailler = require("../models/Poulailler");
const { getMqttClient } = require("./mqttService");

const getDeviceId = (poulailler) =>
  poulailler.uniqueCode || poulailler._id.toString();

const updatePorte = async (poulaillerId, action) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler introuvable");

  const deviceId = getDeviceId(poulailler);
  const client = getMqttClient();

  if (!client || !client.connected) {
    throw new Error("Le serveur MQTT est déconnecté");
  }

  const topic = `poulailler/${deviceId}/cmd/door`;

  // ✅ CORRECTION ICI
  const payload = JSON.stringify({ action });

  client.publish(topic, payload, { qos: 1 });

  console.log(`[MQTT] Publish ${topic} -> ${payload}`);
};

const getDoorTimeParts = () => {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
timeZone: process.env.DOOR_TIMEZONE || "Africa/Tunis",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );

  return { h: hour, m: minute };
};

const publishDoorConfig = async (poulaillerId, schedule) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler introuvable");

  const client = getMqttClient();
  if (!client || !client.connected) {
    throw new Error("Le serveur MQTT est déconnecté");
  }

  const topic = `poulailler/${getDeviceId(poulailler)}/config`;
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

const syncDoorClock = async (poulaillerId) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return false;

  const client = getMqttClient();
  if (!client || !client.connected) return false;

  const topic = `poulailler/${getDeviceId(poulailler)}/config`;
  const payload = JSON.stringify({
    currentTime: getDoorTimeParts(),
  });

  client.publish(topic, payload, { qos: 0 });
  return true;
};

module.exports = { updatePorte, publishDoorConfig, syncDoorClock };
