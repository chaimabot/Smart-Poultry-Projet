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
      airQualityMin: { type: Number, default: 20, min: 0, max: 100 }, // ← remplace co2Max/nh3Max/dustMax
      waterLevelMin: { type: Number, default: 20, min: 0, max: 100 },
    },
  },
  { timestamps: true },
);

systemConfigSchema.statics.getDefaultThresholds = async function () {
  let config = await this.findOne({ configId: "default" });
  if (!config) {
    config = await this.create({ configId: "default" });
  }

  const t = config.defaultThresholds.toObject();

  // Migration auto : si l'ancien doc en BD a co2Max mais pas airQualityMin
  if (t.airQualityMin == null && t.co2Max != null) {
    t.airQualityMin = 20; // valeur par défaut propre
    await this.updateOne(
      { configId: "default" },
      {
        "defaultThresholds.airQualityMin": 20,
        $unset: {
          "defaultThresholds.co2Max": "",
          "defaultThresholds.co2Warning": "",
          "defaultThresholds.co2Critical": "",
          "defaultThresholds.nh3Max": "",
          "defaultThresholds.dustMax": "",
        },
      },
    );
  }

  return t;
};

systemConfigSchema.statics.updateDefaultThresholds = async function (
  thresholds,
) {
  // Nettoyer les anciens champs s'ils arrivent encore
  const { co2Max, co2Warning, co2Critical, nh3Max, dustMax, ...clean } =
    thresholds;

  const config = await this.findOneAndUpdate(
    { configId: "default" },
    {
      defaultThresholds: clean,
      $unset: {
        "defaultThresholds.co2Max": "",
        "defaultThresholds.co2Warning": "",
        "defaultThresholds.co2Critical": "",
        "defaultThresholds.nh3Max": "",
        "defaultThresholds.dustMax": "",
      },
    },
    { new: true, upsert: true },
  );

  return config.defaultThresholds;
};

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
