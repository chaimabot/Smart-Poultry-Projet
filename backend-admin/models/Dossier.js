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
      required: true,
    },

    // ── Finance ────────────────────────────────────────────────
    totalAmount: { type: Number, required: true, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    remainedAmount: { type: Number, default: 0 },

    // ── Workflow ───────────────────────────────────────────────
    status: {
      type: String,
      enum: ["EN_ATTENTE", "AVANCE_PAYEE", "TERMINE", "ANNULE"],
      default: "EN_ATTENTE",
    },

    // Clôture (TERMINE)
    dateCloture: { type: Date, default: null },
    motifCloture: { type: String, trim: true, default: null },
    cloreBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Annulation (ANNULE)
    dateAnnulation: { type: Date, default: null },
    motifAnnulation: { type: String, trim: true, default: null },
    annulePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Indique si l'avance avait déjà été perçue au moment de l'annulation
    // (utile pour la comptabilité / régularisation manuelle)
    avanceDejaPercueALAnnulation: { type: Boolean, default: false },

    // ── Infos statiques (pour le contrat) ─────────────────────
    equipmentList: {
      type: String,
      default: "Boîtier IoT ESP32, Température, Humidité, CO2, Niveau d'eau",
    },
    dateValidation: { type: Date },
  },
  { timestamps: true },
);

dossierSchema.pre("save", async function () {
  if (!this.contractNumber) {
    this.contractNumber = "CTR-" + Date.now();
  }
});

module.exports = mongoose.model("Dossier", dossierSchema);
