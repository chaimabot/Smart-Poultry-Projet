// services/ventilateurService.js

const Poulailler = require("../models/Poulailler");
const mqttService = require("./mqttService");

/**
 * Met à jour le ventilateur (mode + état)
 * Envoie la commande MQTT à l'ESP32 si en mode manuel
 */
async function updateVentilateur(poulaillerId, mode, action) {
  console.log(`[VENTILATEUR] Update:`, { poulaillerId, mode, action });

  // 1. Trouver le poulailler
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) {
    throw new Error("Poulailler non trouvé");
  }

  // 2. Mettre à jour le mode
  poulailler.actuatorStates.ventilation.mode = mode;

  // 3. Mettre à jour le status (seulement en mode manuel)
  // En mode AUTO, c'est autoControlService qui décide
  if (mode === "manual") {
    poulailler.actuatorStates.ventilation.status = action;
  } else if (mode === "auto") {
    // En passant en AUTO, reset à "off" et laisser le serveur décider
    poulailler.actuatorStates.ventilation.status = "off";
    poulailler.actuatorStates.ventilation.lastAutoReason = "";
  }

  await poulailler.save();
  console.log(
    `[VENTILATEUR]   BD mise à jour: mode=${mode}, status=${poulailler.actuatorStates.ventilation.status}`,
  );

  // 4.   ENVOYER LA COMMANDE MQTT À L'ESP32
  const mqttClient = mqttService.getMqttClient();

  if (!mqttClient || !mqttClient.connected) {
    console.warn("[VENTILATEUR]   MQTT non connecté, commande non envoyée");
    return poulailler;
  }

  //     Utiliser la MAC, pas uniqueCode
  const macAddress = await mqttService.resolveMacByPoulaillerId(poulaillerId);

  if (!macAddress) {
    console.warn(`[VENTILATEUR]   Aucune MAC pour poulailler ${poulaillerId}`);
    return poulailler;
  }

  // Construire le topic et le payload
  const topic = `poulailler/${macAddress}/cmd/fan`;
  const payload = JSON.stringify({
    on: action === "on",
    mode: mode,
  });

  console.log(`[VENTILATEUR]   Envoi MQTT:`);
  console.log(`[VENTILATEUR]    Topic: ${topic}`);
  console.log(`[VENTILATEUR]    Payload: ${payload}`);

  // Publier la commande
  return new Promise((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[VENTILATEUR]   Erreur publish:`, err.message);
        // On résout quand même car la BD est à jour
        resolve(poulailler);
      } else {
        console.log(`[VENTILATEUR]   Commande envoyée à l'ESP32`);
        resolve(poulailler);
      }
    });
  });
}

module.exports = {
  updateVentilateur,
};
