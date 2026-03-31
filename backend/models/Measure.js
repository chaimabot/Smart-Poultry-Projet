const mongoose = require("mongoose");

const measureSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    temperature: Number,
    humidity: Number,
    co2: Number,
    nh3: Number,
    dust: Number,
    waterLevel: Number,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Index pour les requêtes historiques
measureSchema.index({ poulailler: 1, timestamp: -1 });

// ✅ TTL INDEX: Auto-delete measurements older than 30 days
// MongoDB will automatically delete documents 30 days after the 'timestamp' field
measureSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }, // 30 days in seconds
);

module.exports = mongoose.model("Measure", measureSchema);
