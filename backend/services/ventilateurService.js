// services/ventilateurService.js
const Poulailler = require("../models/Poulailler");

const updateVentilateur = async (poulaillerId, mode, action = null) => {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) throw new Error("Poulailler non trouvé");

  // Mise à jour des champs
  poulailler.actuatorStates.ventilation.mode = mode;
  if (action !== null) {
    poulailler.actuatorStates.ventilation.status = action ? "on" : "off";
  }

  // AJOUT DE await ICI → C'EST ÇA LE BUG !
  await poulailler.save();

  console.log(
    `[DB] Ventilation mode → ${mode}, status → ${poulailler.actuatorStates.ventilation.status}`,
  );

  return poulailler;
};

module.exports = { updateVentilateur };
