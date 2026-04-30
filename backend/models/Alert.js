const mongoose = require("mongoose");

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

    key: {
      type: String,
      required: true,
    },

    // ── Champs spécifiques capteur (optionnels) ───────────────────────────────
    parameter: {
      type: String,
      // FIX: null is not a valid enum value in Mongoose — use sparse or just omit it
      enum: ["temperature", "humidity", "co2", "nh3", "dust", "waterLevel"],
      default: undefined, // FIX: was `null`, which fails enum validation on non-sensor alerts
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
      enum: ["above", "below"], // FIX: removed `null` from enum — null is not a valid enum member in Mongoose
      default: undefined, // FIX: use undefined so the field is simply absent when not applicable
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
      index: true, // FIX: add index here since it's used heavily in queries
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ── Index ─────────────────────────────────────────────────────────────────────
alertSchema.index({ poulailler: 1, read: 1, createdAt: -1 });
alertSchema.index({ poulailler: 1, type: 1, key: 1, severity: 1 });
alertSchema.index({ poulailler: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
