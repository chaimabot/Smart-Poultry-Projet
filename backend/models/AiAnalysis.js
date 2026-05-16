const mongoose = require("mongoose");

const DetectionSchema = new mongoose.Schema(
  {
    behaviorNormal: { type: Boolean, default: true },
    mortalityDetected: { type: Boolean, default: false },
    densityOk: { type: Boolean, default: true },
    cleanEnvironment: { type: Boolean, default: true },
    ventilationAdequate: { type: Boolean, default: true },
  },
  { _id: false },
);

const SensorSchema = new mongoose.Schema(
  {
    temperature: { type: Number },
    humidity: { type: Number },
    airQualityPercent: { type: Number },
    waterLevel: { type: Number },
  },
  { _id: false },
);

const ImageQualitySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "processing", "optimized", "failed"],
      default: "pending",
    },
    score: { type: Number, min: 0, max: 100 },
    width: { type: Number },
    height: { type: Number },
    format: { type: String },
    sizeBytes: { type: Number },
  },
  { _id: false },
);

const ImageSchema = new mongoose.Schema(
  {
    url: { type: String },
    thumbnailUrl: { type: String },
    publicId: { type: String },
  },
  { _id: false },
);

const ResultSchema = new mongoose.Schema(
  {
    healthScore: { type: Number, min: 0, max: 100 },
    urgencyLevel: { type: String, enum: ["normal", "attention", "critique"] },
    confidence: { type: Number, min: 0, max: 100 },
    diagnostic: { type: String },
    detections: DetectionSchema,
    advices: [{ type: String }],
    sensors: SensorSchema,
  },
  { _id: false },
);

const AiAnalysisSchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },

    triggeredBy: {
      type: String,
      required: true,
      enum: ["user", "auto", "scheduled", "esp32-auto"],
      default: "user",
    },

    image: ImageSchema,
    imageQuality: ImageQualitySchema,
    result: ResultSchema,

    captureRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CaptureRequest",
      index: true,
    },

    cameraMac: { type: String },

    status: {
      type: String,
      enum: [
        "pending",
        "capturing",
        "uploading",
        "analyzing",
        "completed",
        "failed",
      ],
      default: "pending",
      index: true,
    },

    error: { type: String },
  },
  { timestamps: true },
);

AiAnalysisSchema.index({ poulaillerId: 1, createdAt: -1 });
AiAnalysisSchema.index({ status: 1, createdAt: -1 });
AiAnalysisSchema.index({ captureRequestId: 1 });

module.exports = mongoose.model("AiAnalysis", AiAnalysisSchema);
