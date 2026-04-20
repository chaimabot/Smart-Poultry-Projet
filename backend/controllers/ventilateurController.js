const ventilateurService = require("../services/ventilateurService");

const handleUpdateVentilateur = async (req, res) => {
  try {
    const { id } = req.params; // ID du poulailler
    const { mode, action } = req.body;

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
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { handleUpdateVentilateur };
