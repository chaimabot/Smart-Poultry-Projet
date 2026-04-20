const porteService = require("../services/porteService");
const Command = require("../models/Command");
const Poulailler = require("../models/Poulailler");

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

    // Create Command record like lampeService
    const command = await Command.create({
      poulailler: id,
      typeActionneur: "porte",
      action,
      status: "sent",
    });

    await porteService.updatePorte(id, action);

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
