const mongoose = require("mongoose");

const measureSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },

    temperature: { type: Number, default: null },
    humidity: { type: Number, default: null },
    co2: { type: Number, default: null },
    nh3: { type: Number, default: null },
    dust: { type: Number, default: null },
    waterLevel: { type: Number, default: null },

    status: {
      type: String,
      enum: ["normal", "warning", "critical"],
      default: "normal",
    },

    source: {
      type: String,
      enum: ["mqtt", "manual", "simulation"],
      default: "mqtt",
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { versionKey: false },
);

measureSchema.index({ poulailler: 1, timestamp: -1 });

module.exports = mongoose.model("Measure", measureSchema);
