// models/Alert.js
const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },

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

    parameter: {
      type: String,
      enum: ["temperature", "humidity", "co2", "nh3", "dust", "waterLevel"],
      default: undefined,
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
      enum: ["above", "below"],
      default: undefined,
    },

    message: {
      type: String,
      required: true,
    },

    icon: {
      type: String,
      enum: [
        "alert-circle",
        "alert-triangle",
        "info",
        "thermometer",
        "droplets",
        "wind",
        "flask-conical",
        "cloud-fog",
        "cup-soda",
        "door-open",
        "door-closed",
        "door-warn",
        "fan",
        "fan-off",
        "lightbulb",
        "lightbulb-off",
        "wifi",
        "wifi-off",
        "circle-check",
        "circle-help",
      ],
      default: "circle-help",
    },

    severity: {
      type: String,
      enum: ["info", "warn", "danger"],
      required: true,
      default: "info",
    },

    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

alertSchema.index({ poulailler: 1, read: 1, createdAt: -1 });
alertSchema.index({ poulailler: 1, type: 1, key: 1, severity: 1 });
alertSchema.index({ poulailler: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model("Alert", alertSchema);
