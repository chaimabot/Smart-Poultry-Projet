const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// Modèle Alert — Smart Poultry
//
// Types d'alertes :
//   • "sensor"  → déclenchée par un capteur (DHT22, MQ-135, HC-SR04, capteur poussière)
//   • "door"    → déclenchée par un événement de porte (ouverture / fermeture)
//   • "actuator"→ déclenchée par un actionneur (ventilateur, lampe)
//   • "mqtt"    → déclenchée par un événement de connexion MQTT
//
// Sévérités :
//   • "info"    → événement informatif (porte ouverte selon planning, reconnexion OK)
//   • "warn"    → proche du seuil (80-100 % du seuil danger)
//   • "danger"  → seuil critique dépassé / déconnexion MQTT
// ─────────────────────────────────────────────────────────────────────────────

const alertSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },

    // ── Classification ────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: ["sensor", "door", "actuator", "mqtt"],
      required: true,
      default: "sensor",
    },

    // Clé unique de l'événement (ex: "temperature", "door_open", "fan_on", "mqtt_disconnect")
    key: {
      type: String,
      required: true,
    },

    // ── Champs spécifiques capteur (optionnels) ───────────────────────────────
    parameter: {
      type: String,
      enum: ["temperature", "humidity", "co2", "nh3", "dust", "waterLevel"],
      default: null,
    },
    value: {
      type: Number,
      default: null,
    },
    threshold: {
      type: Number,
      default: null,
    },
    direction: {
      type: String,
      enum: ["above", "below", null],
      default: null,
    },

    // ── Champs affichage ──────────────────────────────────────────────────────
    message: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      enum: ["⚠️", "🔴", "✅", "🌡️", "💧", "💨", "🚪", "🔌", "🐔"],
      default: "⚠️",
    },
    severity: {
      type: String,
      enum: ["info", "warn", "danger"],
      required: true,
      default: "info",
    },

    // ── État ──────────────────────────────────────────────────────────────────
    read: {
      type: Boolean,
      default: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

// ── Index ─────────────────────────────────────────────────────────────────────
alertSchema.index({ poulailler: 1, read: 1, createdAt: -1 });
alertSchema.index({ poulailler: 1, type: 1, key: 1, severity: 1 });
alertSchema.index({ poulailler: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
