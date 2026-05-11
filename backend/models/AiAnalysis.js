// models/AiAnalysis.js
const mongoose = require("mongoose");

const aiAnalysisSchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ["manual", "auto", "scheduled"],
      default: "auto",
    },
    sensors: {
      temperature: { type: Number, default: null },
      humidity: { type: Number, default: null },
      airQualityPercent: { type: Number, default: null },
      waterLevel: { type: Number, default: null },
      animalCount: { type: Number, default: null },
      surface: { type: Number, default: null },
    },
    result: {
      healthScore: { type: Number, min: 0, max: 100 },
      urgencyLevel: { type: String, enum: ["normal", "attention", "critique"] },
      diagnostic: { type: String, default: "" },
      detections: {
        behaviorNormal: { type: Boolean, default: true },
        mortalityDetected: { type: Boolean, default: false },
        mortalityCount: { type: Number, default: null },
        densityOk: { type: Boolean, default: true },
        cleanEnvironment: { type: Boolean, default: true },
        ventilationAdequate: { type: Boolean, default: true },
      },
      airQualityAssessment: {
        visualConsistency: {
          type: String,
          enum: ["matches_sensor", "worse_than_sensor", "better_than_sensor"],
          default: "matches_sensor",
        },
        estimatedRisk: {
          type: String,
          enum: ["none", "low", "medium", "high"],
          default: "none",
        },
        observedSigns: [{ type: String }],
      },
      sensorCorrelation: {
        temperatureConsistent: { type: Boolean, default: true },
        humidityConsistent: { type: Boolean, default: true },
        airQualityConsistent: { type: Boolean, default: true },
        alertLevel: {
          type: String,
          enum: ["none", "low", "medium", "high"],
          default: "none",
        },
      },
      advices: [{ type: String }],
      confidence: { type: Number, min: 0, max: 100, default: 100 },
    },
    imageQuality: {
      sizeKb: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ["good", "acceptable", "poor"],
        default: "good",
      },
    },
    imageBase64: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

aiAnalysisSchema.index({ poulaillerId: 1, createdAt: -1 });
aiAnalysisSchema.index({ "result.urgencyLevel": 1, createdAt: -1 });
aiAnalysisSchema.index({ triggeredBy: 1, createdAt: -1 });

module.exports = mongoose.model("AiAnalysis", aiAnalysisSchema);
