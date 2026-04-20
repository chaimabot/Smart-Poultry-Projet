const pompeService = require("../services/pompeService");

const PompeController = {
  async controlPump(req, res) {
    try {
      // Le service s'occupe de tout : DB + MQTT
      const data = await pompeService.sendPumpCommand(
        req.params.id,
        req.body.mode,
        req.body.action,
      );
      res.json({ success: true, data });
    } catch (err) {
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
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = PompeController;
