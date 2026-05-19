const porteService = require("../services/porteService");
const Command = require("../models/Command");
const Poulailler = require("../models/Poulailler");
const mqttService = require("../services/mqttService");

// Délai en ms avant l'envoi automatique du stop après une ouverture
const AUTO_STOP_DELAY_MS = 7000;

// Durcissement : stop auto seulement après une commande "open".
// NOTE: la logique actuelle déclenche un stop dès AUTO_STOP_DELAY_MS après open.
// Si tu observes que la porte ne s’ouvre pas, la cause est généralement dans l’ESP32 ou dans la réception status.

const handleControlPorte = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    console.log("[PORTE][API] Requete recue", {
      poulaillerId: id,
      action,
      userId: req.user?._id || null,
    });

    const validActions = ["open", "close", "stop"];

    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action invalide",
      });
    }

    const poulailler = await Poulailler.findById(id);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, message: "Poulailler introuvable" });
    }

    const command = await Command.create({
      poulailler: id,
      typeActionneur: "porte",
      action,
      status: "sent",
    });

    await porteService.updatePorte(id, action);

    // Marquer la commande manuelle porte pour éviter l'override par les status ESP32 transitoires
    // (même si la porte n'a pas encore complètement bougé / status UNKNOWN).
    try {
      const macAddress = await mqttService.resolveMacByPoulaillerId(id);
      mqttService.markManualCommand(macAddress, "door");
    } catch (e) {
      // pas bloquant
    }

    // ✅ Auto-stop uniquement après "open" (pas "close"), délai cohérent avec AUTO_STOP_DELAY_MS
    if (action === "open") {
      setTimeout(async () => {
        try {
          await porteService.updatePorte(id, "stop");
          console.log(
            `[PORTE][API] Auto-stop porte après ${AUTO_STOP_DELAY_MS}ms`,
            {
              poulaillerId: id,
            },
          );
        } catch (e) {
          console.error("[PORTE][API] Auto-stop porte échoué", {
            poulaillerId: id,
            error: e.message,
          });
        }
      }, AUTO_STOP_DELAY_MS);
    }

    console.log("[PORTE][API] Commande envoyee avec succes", {
      poulaillerId: id,
      action,
      commandId: command._id,
    });

    res.status(200).json({
      success: true,
      data: command,
    });
  } catch (error) {
    console.error("[PORTE][API] Echec commande porte", {
      poulaillerId: req.params?.id,
      action: req.body?.action,
      error: error.message,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = { handleControlPorte };
