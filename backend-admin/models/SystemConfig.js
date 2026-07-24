// models/SystemConfig.js
const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema(
  {
    configId: {
      type: String,
      default: "default",
      unique: true,
    },
    defaultThresholds: {
      temperatureMin: { type: Number, default: 18, min: -10, max: 50 },
      temperatureMax: { type: Number, default: 28, min: -10, max: 50 },
      humidityMin: { type: Number, default: 40, min: 0, max: 100 },
      humidityMax: { type: Number, default: 70, min: 0, max: 100 },
      airQualityMin: { type: Number, default: 50, min: 0, max: 500 },
      waterLevelMin: { type: Number, default: 20, min: 0, max: 100 },
    },
  },
  { timestamps: true },
);

// Obtenir les seuils par défaut (crée le document s'il n'existe pas)
systemConfigSchema.statics.getDefaultThresholds = async function () {
  let config = await this.findOne({ configId: "default" });
  if (!config) config = await this.create({ configId: "default" });
  return config.defaultThresholds;
};

// Mettre à jour les seuils avec $set pour garantir la persistance
systemConfigSchema.statics.updateDefaultThresholds = async function (
  thresholds,
) {
  // Construire l'objet $set champ par champ pour éviter le bug de .toObject()
  const update = {};
  for (const [key, val] of Object.entries(thresholds)) {
    update[`defaultThresholds.${key}`] = val;
  }

  const config = await this.findOneAndUpdate(
    { configId: "default" },
    { $set: update },
    { new: true, upsert: true, runValidators: true },
  );

  return config.defaultThresholds;
};

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
