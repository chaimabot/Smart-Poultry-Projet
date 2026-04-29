const mongoose = require("mongoose");

const dossierSchema = new mongoose.Schema(
  {
    eleveur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },
    contractNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    totalAmount: { type: Number, required: true, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    remainedAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["EN_ATTENTE", "AVANCE_PAYEE", "TERMINE", "ANNULE"],
      default: "EN_ATTENTE",
    },
    source: { type: String, default: null },
    dateValidation: { type: Date, default: null },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dateCloture: { type: Date, default: null },
    motifCloture: { type: String, default: null },
    cloreBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dateAnnulation: { type: Date, default: null },
    motifAnnulation: { type: String, default: null },
    annulePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    equipmentList: {
      type: String,
      default: "Boîtier IoT ESP32, Température, Humidité, CO2, Niveau d'eau",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Dossier", dossierSchema);
