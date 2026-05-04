// controllers/ventilateurController.js
const ventilateurService = require("../services/ventilateurService");

const handleUpdateVentilateur = async (req, res) => {
  try {
    const { id } = req.params;
    let { mode, action } = req.body;

    // SUPPORT DES DEUX FORMATS (compatibilité maximale)
    if (req.body["actuatorStates.ventilation.mode"]) {
      mode = req.body["actuatorStates.ventilation.mode"];
    }
    if (req.body["actuatorStates.ventilation.status"]) {
      action = req.body["actuatorStates.ventilation.status"] === "on";
    }

    // Si seul le mode est envoyé (cas de l'app mobile)
    if (mode === undefined && req.body.mode !== undefined) {
      mode = req.body.mode;
    }
    if (action === undefined && req.body.action !== undefined) {
      action = req.body.action;
    }

    const updatedPoulailler = await ventilateurService.updateVentilateur(
      id,
      mode || "manual",
      action !== undefined ? action : null,
    );

    res.status(200).json({
      success: true,
      data: updatedPoulailler.actuatorStates.ventilation,
    });
  } catch (error) {
    console.error("Erreur handleUpdateVentilateur :", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleUpdateVentilateur };
