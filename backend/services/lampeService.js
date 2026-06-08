// services/lampeService.js (BACKEND)

const Poulailler = require("../models/Poulailler");
const Command = require("../models/Command");
const Module = require("../models/Module");
const { getMqttClient } = require("./mqttService");

const getMacAddress = async (poulaillerId) => {
  const device = await Module.findOne({ poulailler: poulaillerId });
  if (!device?.macAddress) {
    throw new Error(`Aucun device/MAC trouvé pour ${poulaillerId}`);
  }
  return device.macAddress;
};

async function updateLampe(id, mode, action) {
  const poulailler = await Poulailler.findById(id);
  if (!poulailler) throw new Error("Poulailler introuvable");

  console.log(`[lampeService] Update:`, { id, mode, action });

  //   Détecter AUTO → MANUEL
  const previousMode = poulailler.actuatorStates.lamp.mode;
  const isAutoToManual = previousMode === "auto" && mode === "manual";

  poulailler.actuatorStates.lamp.mode = mode;

  if (isAutoToManual) {
    console.log(`[lampeService]    AUTO → MANUEL : arrêt forcé`);
    poulailler.actuatorStates.lamp.status = "off";
    poulailler.actuatorStates.lamp.lastAutoReason = "";
  } else if (mode === "manual") {
    poulailler.actuatorStates.lamp.status = action;
  } else if (mode === "auto") {
    poulailler.actuatorStates.lamp.status = "off";
    poulailler.actuatorStates.lamp.lastAutoReason = "";
  }

  await poulailler.save();
  console.log(
    `[lampeService]   BD: mode=${mode}, status=${poulailler.actuatorStates.lamp.status}`,
  );

  const client = getMqttClient();
  if (!client || !client.connected) {
    throw new Error("MQTT client non connecté");
  }

  const macAddress = await getMacAddress(id);
  const topic = `poulailler/${macAddress}/cmd/lamp`;

  //   Si AUTO → MANUEL : forcer OFF
  if (isAutoToManual) {
    const payload = JSON.stringify({ on: false, mode: "manual" });
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error("[lampeService] ❌ Erreur:", err.message);
      } else {
        console.log(`[lampeService]   Arrêt forcé: ${topic} → ${payload}`);
      }
    });
  } else {
    const payload = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });

    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error("[lampeService] ❌ Erreur:", err.message);
      } else {
        console.log(`[lampeService]   MQTT: ${topic} → ${payload}`);
      }
    });
  }

  if (mode === "auto") {
    try {
      const { evaluateAutoControls } = require("./autoControlService");
      const freshPoulailler = await Poulailler.findById(id);
      await evaluateAutoControls(freshPoulailler, macAddress, client);
    } catch (e) {
      console.error("[lampeService] Erreur évaluation:", e.message);
    }
  }

  await Command.create({
    poulailler: id,
    typeActionneur: "lampe",
    action: isAutoToManual
      ? "arret_changement_mode"
      : action === "on"
        ? "allumer"
        : "eteindre",
    mode,
    status: "sent",
  });

  return poulailler;
}

//   Compatibilité : ancien controller utilise sendLampCommand
// Ce projet a une seule fonction métier updateLampe.
const sendLampCommand = updateLampe;

module.exports = {
  updateLampe,
  sendLampCommand,
};
