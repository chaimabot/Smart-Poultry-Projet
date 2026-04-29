const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const dossierSchema = new mongoose.Schema(
  {
    eleveur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
    },

    // ✅ FIX UNIQUE
    contractNumber: {
      type: String,
      unique: true,
    },

    // Finance
    totalAmount: { type: Number, required: true, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    remainedAmount: { type: Number, default: 0 },

    // Workflow
    status: {
      type: String,
      enum: ["EN_ATTENTE", "AVANCE_PAYEE", "TERMINE", "ANNULE"],
      default: "EN_ATTENTE",
    },

    source: { type: String, default: null },

    dateValidation: { type: Date },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// ✅ Génération UNIQUE sûre
dossierSchema.pre("save", function (next) {
  if (!this.contractNumber) {
    this.contractNumber = "CTR-" + uuidv4();
  }
  next();
});

module.exports = mongoose.model("Dossier", dossierSchema);
