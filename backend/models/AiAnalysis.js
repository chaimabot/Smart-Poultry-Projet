const mongoose = require("mongoose");

// Modèle Mongoose (CommonJS)
// Important: ce fichier ne doit PAS contenir d'imports ESM (`import ...`) car
// le backend est exécuté en CommonJS sur Render.

const AiAnalysisSchema = new mongoose.Schema(
  {
    poultryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },

    triggeredBy: { type: String, default: "unknown" },

    sensors: { type: Object, default: {} },

    result: { type: Object, default: {} },

    imageQuality: { type: Object, default: {} },

    image: { type: Object, default: {} },

    cameraMac: { type: String, default: null },

    captureRequestId: { type: Object, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AiAnalysis", AiAnalysisSchema);
