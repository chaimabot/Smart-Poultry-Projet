const lampeService = require("../services/lampeService");

const LampeController = {
  // Pour allumer/éteindre manuellement ou passer en mode auto
  async controlLamp(req, res) {
    try {
      const data = await lampeService.sendLampCommand(
        req.params.id,
        req.body.mode,
        req.body.action
      );
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Pour régler les seuils de température (utile pour le mode auto)
  async updateThresholds(req, res) {
    try {
      const { temperatureMin, temperatureMax } = req.body;
      const thresholds = await lampeService.updateAndSyncThresholds(
        req.params.id,
        temperatureMin,
        temperatureMax
      );
      res.json({ success: true, thresholds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
};

module.exports = LampeController;