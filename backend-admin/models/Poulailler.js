const mongoose = require("mongoose");

// ─────────────────────────────────────────────
// Sub-schema : Pièce jointe
// ─────────────────────────────────────────────
const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    size: { type: Number, min: 0, default: null },
    uri: { type: String, default: null },
    base64: { type: String, default: null },
  },
  { _id: false },
);

// ─────────────────────────────────────────────
// Schema principal : Poulailler
// ─────────────────────────────────────────────
const poulaillerSchema = new mongoose.Schema(
  {
    // ── Propriétaire ──────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ── Identification ────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    uniqueCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    // ── Caractéristiques physiques ────────────
    animalCount: { type: Number, required: true, min: 1 },
    surface: { type: Number, required: true, min: 0.1 },
    densite: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: function (v) {
          return v === null || v >= 0;
        },
        message: "La densité doit être null ou supérieure ou égale à 0",
      },
    },

    // ── Informations complémentaires ──────────
    remarque: { type: String, maxlength: 200, default: null, trim: true },
    address: { type: String, maxlength: 300, default: null, trim: true },
    attachments: { type: [attachmentSchema], default: [] },

    // ── Statut & flags ────────────────────────
    status: {
      type: String,
      enum: ["en_attente_module", "connecte", "hors_ligne", "maintenance"],
      default: "en_attente_module",
    },
    isCritical: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },

    // ── Module ESP32 lié ──────────────────────
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      default: null,
    },

    // ── Seuils d'alerte ───────────────────────
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

    // ── État des actionneurs ──────────────────
    actuatorStates: {
      door: {
        status: { type: String, enum: ["open", "closed"], default: "closed" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
      ventilation: {
        status: { type: String, enum: ["on", "off"], default: "off" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
      lamp: {
        status: { type: String, enum: ["on", "off"], default: "off" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
      pump: {
        status: { type: String, enum: ["on", "off"], default: "off" },
        mode: { type: String, enum: ["auto", "manual"], default: "auto" },
      },
    },

    // ── Dernière mesure (cache lecture rapide) ─
    lastMonitoring: {
      temperature: { type: Number, default: null },
      humidity: { type: Number, default: null },
      co2: { type: Number, default: null },
      nh3: { type: Number, default: null },
      dust: { type: Number, default: null },
      waterLevel: { type: Number, default: null },
      timestamp: { type: Date, default: null },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt automatiques
    versionKey: false, // supprime __v inutile
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─────────────────────────────────────────────
// Index
// ─────────────────────────────────────────────
poulaillerSchema.index({ owner: 1, isArchived: 1 });
poulaillerSchema.index({ owner: 1, isCritical: 1 });
poulaillerSchema.index({ owner: 1, status: 1 });
poulaillerSchema.index({ uniqueCode: 1 }); // lookup MQTT très fréquent

// ─────────────────────────────────────────────
// Virtual : alerte active ?
// ─────────────────────────────────────────────
poulaillerSchema.virtual("hasAlert").get(function () {
  const m = this.lastMonitoring;
  const t = this.thresholds;
  if (!m?.timestamp) return false;
  return (
    (m.temperature != null &&
      (m.temperature < t.temperatureMin || m.temperature > t.temperatureMax)) ||
    (m.humidity != null &&
      (m.humidity < t.humidityMin || m.humidity > t.humidityMax)) ||
    (m.co2 != null && m.co2 > t.co2Max) ||
    (m.nh3 != null && m.nh3 > t.nh3Max) ||
    (m.dust != null && m.dust > t.dustMax) ||
    (m.waterLevel != null && m.waterLevel < t.waterLevelMin)
  );
});

// ─────────────────────────────────────────────
// Middleware : recalcul automatique de la densité
// ─────────────────────────────────────────────
poulaillerSchema.pre("save", function (next) {
  if (this.isModified("animalCount") || this.isModified("surface")) {
    this.densite =
      this.animalCount > 0 && this.surface > 0
        ? parseFloat((this.animalCount / this.surface).toFixed(2))
        : null;
  }
  next();
});

// ─────────────────────────────────────────────
// Méthode d'instance : payload config → ESP32
// ─────────────────────────────────────────────
poulaillerSchema.methods.toMqttConfig = function () {
  return {
    tempMin: this.thresholds.temperatureMin,
    tempMax: this.thresholds.temperatureMax,
    waterMin: this.thresholds.waterLevelMin,
    waterHysteresis: 10,
    lampMode: this.actuatorStates?.lamp?.mode ?? "auto",
    pumpMode: this.actuatorStates?.pump?.mode ?? "auto",
    fanMode: this.actuatorStates?.ventilation?.mode ?? "auto",
  };
};

module.exports = mongoose.model("Poulailler", poulaillerSchema);
