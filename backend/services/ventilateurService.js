const Poulailler = require("../models/Poulailler");

const updateVentilateur = async (poulaillerId, mode, action) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler non trouvé");

  // ✅ Sauvegarde UNIQUEMENT en DB pour la persistance
  poulailler.actuatorStates.ventilation.mode = mode;
  poulailler.actuatorStates.ventilation.status = action;

  await poulailler.save();

  // ⚠️ J'ai SUPPRIMÉ le code MQTT ici.
  // L'app mobile envoie déjà les commandes MQTT en temps réel.
  // Ne pas renvoyer de MQTT depuis le backend pour éviter les doublons !

  return poulailler;
};

module.exports = { updateVentilateur };
