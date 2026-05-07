const mongoose = require("mongoose");

const AiAnalysisSchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    triggeredBy: {
      type: String,
      enum: ["auto", "manual"],
      required: true,
    },
    sensors: {
      temperature: { type: Number, default: null },
      humidity: { type: Number, default: null },
      co2: { type: Number, default: null },
      nh3: { type: Number, default: null },
    },
    result: {
      healthScore: { type: Number, min: 0, max: 100, required: true },
      urgencyLevel: {
        type: String,
        enum: ["normal", "attention", "critique"],
        required: true,
      },
      diagnostic: { type: String, required: true },
      detections: {
        behaviorNormal: { type: Boolean, required: true },
        mortalityDetected: { type: Boolean, required: true },
        densityOk: { type: Boolean, required: true },
        cleanEnvironment: { type: Boolean, required: true },
      },
      advices: [{ type: String }],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AiAnalysis", AiAnalysisSchema);
