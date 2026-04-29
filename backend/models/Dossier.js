const mongoose = require("mongoose");

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
      enum: ["EN_ATTENTE", "AVANCE_PAYEE", "TERMINE", "ANNULE"], // ✅ ANNULE ajouté
      default: "EN_ATTENTE",
    },
    source: { type: String, default: null }, // ✅ champ manquant
    // Validation
    dateValidation: { type: Date },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Clôture
    dateCloture: { type: Date },
    motifCloture: { type: String, default: null },
    cloreBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Annulation
    dateAnnulation: { type: Date },
    motifAnnulation: { type: String, default: null },
    annulePar: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Infos statiques
    equipmentList: {
      type: String,
      default: "Boîtier IoT ESP32, Température, Humidité, CO2, Niveau d'eau",
    },
  },
  { timestamps: true },
);

dossierSchema.pre("save", async function () {
  if (!this.contractNumber) {
    this.contractNumber = "CTR-" + Date.now();
  }
});

module.exports = mongoose.model("Dossier", dossierSchema);
