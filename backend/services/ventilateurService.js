// services/ventilateurService.js

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

async function updateVentilateur(id, mode, action) {
  const poulailler = await Poulailler.findById(id);
  if (!poulailler) throw new Error("Poulailler introuvable");

  console.log(`[ventilateurService] Update:`, { id, mode, action });

  //   Détecter AUTO → MANUEL
  const previousMode = poulailler.actuatorStates.ventilation.mode;
  const isAutoToManual = previousMode === "auto" && mode === "manual";

  // Mettre à jour la BD
  poulailler.actuatorStates.ventilation.mode = mode;

  if (isAutoToManual) {
    console.log(`[ventilateurService]    AUTO → MANUEL : arrêt forcé`);
    poulailler.actuatorStates.ventilation.status = "off";
    poulailler.actuatorStates.ventilation.lastAutoReason = "";
  } else if (mode === "manual") {
    poulailler.actuatorStates.ventilation.status = action;
  } else if (mode === "auto") {
    poulailler.actuatorStates.ventilation.status = "off";
    poulailler.actuatorStates.ventilation.lastAutoReason = "";
  }

  await poulailler.save();
  console.log(
    `[ventilateurService]   BD: mode=${mode}, status=${poulailler.actuatorStates.ventilation.status}`,
  );

  // Envoi MQTT
  const client = getMqttClient();
  if (!client || !client.connected) {
    throw new Error("MQTT client non connecté");
  }

  const macAddress = await getMacAddress(id);
  const topic = `poulailler/${macAddress}/cmd/fan`;

  //   Si AUTO → MANUEL : forcer OFF
  if (isAutoToManual) {
    const payload = JSON.stringify({ on: false, mode: "manual" });
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error("[ventilateurService] ❌ Erreur:", err.message);
      } else {
        console.log(
          `[ventilateurService]   Arrêt forcé: ${topic} → ${payload}`,
        );
      }
    });
  } else {
    const payload = JSON.stringify({
      on: action === "on",
      mode: mode || "manual",
    });

    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error("[ventilateurService] ❌ Erreur:", err.message);
      } else {
        console.log(`[ventilateurService]   MQTT: ${topic} → ${payload}`);
      }
    });
  }

  // Déclencher évaluation AUTO immédiate
  if (mode === "auto") {
    console.log(`[ventilateurService] 🤖 Évaluation AUTO immédiate`);
    try {
      const { evaluateAutoControls } = require("./autoControlService");
      const freshPoulailler = await Poulailler.findById(id);
      await evaluateAutoControls(freshPoulailler, macAddress, client);
    } catch (e) {
      console.error("[ventilateurService] Erreur évaluation:", e.message);
    }
  }

  // Archive
  await Command.create({
    poulailler: id,
    typeActionneur: "ventilateur",
    action: isAutoToManual
      ? "arret_changement_mode"
      : action === "on"
        ? "demarrer"
        : "arreter",
    mode,
    status: "sent",
  });

  return poulailler;
}

module.exports = {
  updateVentilateur,
};
