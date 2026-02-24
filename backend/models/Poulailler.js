const mongoose = require("mongoose");

const poulaillerSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Veuillez ajouter un nom"],
      minlength: [3, "Le nom doit avoir au moins 3 caractères"],
      maxlength: [50, "Le nom ne peut pas dépasser 50 caractères"],
    },
    type: {
      type: String,
      enum: ["pondeuses", "chair", "dindes", "canards", "autre"],
      required: [true, "Veuillez sélectionner un type de volaille"],
    },
    animalCount: {
      type: Number,
      min: [1, "Le nombre d'animaux doit être au moins 1"],
      required: [true, "Veuillez indiquer le nombre d'animaux"],
    },
    description: {
      type: String,
      maxlength: [200, "La description ne peut pas dépasser 200 caractères"],
      default: null,
    },
    location: {
      type: String,
      default: null,
    },
    photoUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "en_attente_module",
        "connecte",
        "hors_ligne",
        "maintenance",
        "archive",
      ],
      default: "en_attente_module",
    },
    installationDate: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    lastCommunicationAt: {
      type: Date,
      default: null,
    },
    uniqueCode: {
      type: String,
      unique: true,
      sparse: true, // Permet d'avoir plusieurs null si pas encore défini
    },
    moduleId: {
      type: mongoose.Schema.ObjectId,
      ref: "Module",
      default: null,
    },
    // Sprint 2 : Monitoring & Seuils
    thresholds: {
      temperatureMin: { type: Number, default: 18 },
      temperatureMax: { type: Number, default: 28 },
      humidityMin: { type: Number, default: 40 },
      humidityMax: { type: Number, default: 70 },
      co2Max: { type: Number, default: 1500 },
      nh3Max: { type: Number, default: 25 },
      dustMax: { type: Number, default: 150 },
      waterLevelMin: { type: Number, default: 20 },
    },
    autoThresholds: {
      ventiloThresholdTemp: { type: Number, default: 28 },
      ventiloThresholdCO2: { type: Number, default: 1500 },
      doorOpenTime: { type: String, default: "07:00" },
      doorCloseTime: { type: String, default: "19:00" },
    },
    actuatorStates: {
      door: {
        status: { type: String, enum: ["open", "closed"], default: "closed" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
      ventilation: {
        status: { type: String, enum: ["on", "off"], default: "off" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
    },
    isCritical: {
      type: Boolean,
      default: false,
    },
    lastAlert: {
      type: Date,
      default: null,
    },
    lastCriticalCheck: {
      type: Date,
      default: null,
    },
    lastMeasureAt: {
      type: Date,
      default: null,
    },
    lastMonitoring: {
      temperature: Number,
      humidity: Number,
      co2: Number,
      nh3: Number,
      dust: Number,
      waterLevel: Number,
      timestamp: Date,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Poulailler", poulaillerSchema);
