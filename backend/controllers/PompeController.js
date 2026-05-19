const pompeService = require("../services/pompeService");

const PompeController = {
  async controlPump(req, res) {
    try {
      const { id } = req.params;
      const { mode, action, changeModeOnly } = req.body;

      console.log("[POMPE CONTROLLER] Requête:", {
        id,
        mode,
        action,
        changeModeOnly,
      });

      // Validation
      if (!mode && !action) {
        return res.status(400).json({
          success: false,
          error: "mode ou action requis",
        });
      }

      if (mode && !["auto", "manual"].includes(mode)) {
        return res.status(400).json({
          success: false,
          error: "mode invalide (auto ou manual)",
        });
      }

      if (!changeModeOnly && action && !["on", "off"].includes(action)) {
        return res.status(400).json({
          success: false,
          error: "action invalide (on ou off)",
        });
      }

      const data = await pompeService.sendPumpCommand(
        id,
        mode,
        action,
        changeModeOnly || false,
      );

      res.json({ success: true, data });
    } catch (err) {
      console.error("[POMPE CONTROLLER] Erreur:", err.message);
      res.status(500).json({ error: err.message });
    }
  },

  async updateThresholds(req, res) {
    try {
      const { waterLevelMin, waterHysteresis } = req.body;
      const thresholds = await pompeService.updateAndSyncThresholds(
        req.params.id,
        waterLevelMin,
        waterHysteresis,
      );
      res.json({ success: true, thresholds });
    } catch (err) {
      console.error("[POMPE CONTROLLER] Erreur seuils:", err.message);
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = PompeController;
