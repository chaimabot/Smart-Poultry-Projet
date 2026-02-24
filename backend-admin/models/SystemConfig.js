// models/SystemConfig.js
const mongoose = require("mongoose");

// Schéma pour la configuration système (seuils par défaut)
const systemConfigSchema = new mongoose.Schema(
  {
    // Identifiant unique (sera toujours "system" pour avoir un seul document)
    configId: {
      type: String,
      default: "default",
      unique: true,
    },
    // Seuils par défaut pour les nouveaux poulaillers
    defaultThresholds: {
      temperatureMin: {
        type: Number,
        default: 18,
        min: -10,
        max: 50,
      },
      temperatureMax: {
        type: Number,
        default: 28,
        min: -10,
        max: 50,
      },
      humidityMin: {
        type: Number,
        default: 40,
        min: 0,
        max: 100,
      },
      humidityMax: {
        type: Number,
        default: 70,
        min: 0,
        max: 100,
      },
      co2Max: {
        type: Number,
        default: 1500,
        min: 0,
        max: 10000,
      },
      co2Warning: {
        type: Number,
        default: 2500,
        min: 0,
        max: 10000,
      },
      co2Critical: {
        type: Number,
        default: 3000,
        min: 0,
        max: 10000,
      },
      nh3Max: {
        type: Number,
        default: 25,
        min: 0,
        max: 100,
      },
      dustMax: {
        type: Number,
        default: 150,
        min: 0,
        max: 1000,
      },
      waterLevelMin: {
        type: Number,
        default: 20,
        min: 0,
        max: 100,
      },
    },
  },
  {
    timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  },
);

// Méthode statique pour obtenir ou créer la config
systemConfigSchema.statics.getDefaultThresholds = async function () {
  let config = await this.findOne({ configId: "default" });

  if (!config) {
    // Créer la config par défaut si elle n'existe pas
    config = await this.create({ configId: "default" });
  }

  return config.defaultThresholds;
};

// Méthode statique pour mettre à jour les seuils par défaut
systemConfigSchema.statics.updateDefaultThresholds = async function (
  thresholds,
) {
  // Récupérer la config existante
  let config = await this.findOne({ configId: "default" });

  if (!config) {
    // Créer la config par défaut si elle n'existe pas
    config = await this.create({ configId: "default" });
  }

  // Fusionner les nouveaux seuils avec les existants
  const updatedThresholds = {
    ...config.defaultThresholds.toObject(),
    ...thresholds,
  };

  // Mettre à jour seulement les champs fournis
  config.defaultThresholds = updatedThresholds;
  await config.save();

  return config.defaultThresholds;
};

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
