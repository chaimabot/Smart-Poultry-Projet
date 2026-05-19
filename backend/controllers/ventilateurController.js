// controllers/ventilateurController.js

const ventilateurService = require("../services/ventilateurService");

const handleUpdateVentilateur = async (req, res) => {
  try {
    const { id } = req.params; // ID du poulailler
    const { mode, action } = req.body;

    console.log(`[VENTILATEUR CTRL] Requête reçue:`, {
      poulaillerId: id,
      mode,
      action,
    });

    // Validation
    if (!mode || !["auto", "manual"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "Mode invalide. Valeurs acceptées : auto | manual",
      });
    }

    if (!action || !["on", "off"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action invalide. Valeurs acceptées : on | off",
      });
    }

    const updatedPoulailler = await ventilateurService.updateVentilateur(
      id,
      mode,
      action,
    );

    res.status(200).json({
      success: true,
      data: updatedPoulailler.actuatorStates.ventilation,
    });
  } catch (error) {
    console.error("[VENTILATEUR CTRL] Erreur:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleUpdateVentilateur };
