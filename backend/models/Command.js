const mongoose = require("mongoose");

const commandSchema = new mongoose.Schema(
  {
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    typeActionneur: {
      type: String,
      // BUG CORRIGÉ #8 : "pompe" était absent → crash Mongoose si commande pompe créée
      enum: ["porte", "ventilateur", "lampe", "pompe"],
      required: true,
    },
    action: {
      type: String,
      required: true, // e.g., 'ouvrir', 'fermer', 'demarrer', 'arreter', 'on', 'off'
    },
    issuedBy: {
      type: String, // 'system', 'user', 'scheduler'
      default: "system",
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    executedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "executed", "failed"],
      default: "pending",
    },
    source: String, // e.g., 'mobile-app', 'automated-rule'
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Command", commandSchema);
