const mongoose = require("mongoose");

const aiAnalysisSchema = new mongoose.Schema(
  {
    poultryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poultry",
      required: true,
      index: true,
    },

    // ── Déclencheur de l'analyse ─────────────────────────────
    triggeredBy: {
      type: String,
      required: true,
      enum: [
        "user", // bouton "Analyser" dans l'app
        "auto", // déclenchement automatique (règle serveur)
        "scheduled", // tâche planifiée (cron)
        "esp32-auto", // ✅ ESP32CAM en mode autonome / détection mouvement
      ],
      default: "user",
    },

    // ── Image & qualité ───────────────────────────────────────
    image: {
      url: { type: String },
      thumbnailUrl: { type: String },
      publicId: { type: String },
    },

    imageQuality: {
      status: {
        type: String,
        enum: [
          "pending", // en attente de réception
          "processing", // compression / redimensionnement
          "optimized", // ✅ traitement terminé (Cloudinary ou Sharp)
          "completed", // alternative si vous préférez ce terme
          "failed", // erreur traitement image
        ],
        default: "pending",
      },
      score: { type: Number, min: 0, max: 100 }, // qualité détectée (0-100)
      width: { type: Number },
      height: { type: Number },
      format: { type: String }, // jpg, webp, etc.
      sizeBytes: { type: Number },
    },

    // ── Résultat IA ───────────────────────────────────────────
    result: {
      healthScore: { type: Number, min: 0, max: 100 },
      urgencyLevel: {
        type: String,
        enum: ["normal", "attention", "critique"],
      },
      confidence: { type: Number, min: 0, max: 100 },
      diagnostic: { type: String },
      detections: {
        behaviorNormal: { type: Boolean, default: true },
        mortalityDetected: { type: Boolean, default: false },
        densityOk: { type: Boolean, default: true },
        cleanEnvironment: { type: Boolean, default: true },
        ventilationAdequate: { type: Boolean, default: true },
      },
      advices: [{ type: String }],
      sensors: {
        temperature: { type: Number },
        humidity: { type: Number },
        airQualityPercent: { type: Number },
        waterLevel: { type: Number },
      },
    },

    // ── Métadonnées ───────────────────────────────────────────
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
  {
    timestamps: true, // createdAt, updatedAt
  },
);

// Index composé pour l'historique rapide
aiAnalysisSchema.index({ poultryId: 1, createdAt: -1 });

module.exports = mongoose.model("AiAnalysis", aiAnalysisSchema);
