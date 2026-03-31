const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    // Alert classification
    type: {
      type: String,
      enum: ["sensor", "door", "mqtt"],
      default: "sensor",
    },
    key: {
      type: String,
      required: true,
      // Examples: 'temperature', 'humidity', 'door_scheduled', 'door_timeout', 'mqtt_disconnect', 'mqtt_reconnect'
    },
    // Sensor-specific fields (optional)
    parameter: {
      type: String,
      enum: ["temperature", "humidity", "co2", "nh3", "dust", "waterLevel"],
    },
    value: {
      type: Number,
    },
    threshold: {
      type: Number,
    },
    direction: {
      type: String,
      enum: ["above", "below"],
    },
    // Display fields
    message: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      enum: ["⚠️", "🔴", "✅"],
      default: "✅",
    },
    severity: {
      type: String,
      enum: ["info", "warn", "danger"],
      default: "info",
    },
    // State
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
    timestamps: true,
  },
);

// Index for fast queries
alertSchema.index({ poulailler: 1, read: 1, createdAt: -1 });
alertSchema.index({ poulailler: 1, type: 1, key: 1, severity: 1 });

module.exports = mongoose.model("Alert", alertSchema);
