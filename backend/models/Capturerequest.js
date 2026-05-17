// models/CaptureRequest.js
// Remplace la Map en mémoire — survit aux redémarrages serveur

const mongoose = require("mongoose");

const captureRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "capturing", "uploading", "analyzing", "completed", "failed"],
      default: "pending",
    },

    error: {
      type: String,
      default: null,
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt auto
  },
);

// Nettoyage auto : TTL 10 minutes après création
captureRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model("CaptureRequest", captureRequestSchema);