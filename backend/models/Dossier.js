const mongoose = require("mongoose");

const dossierSchema = new mongoose.Schema(
  {
    eleveur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // FIX #1 : index ajouté pour les lookups fréquents par éleveur
    },
    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true, // FIX #1 : idem
    },
    contractNumber: {
      type: String,
      unique: true,
      sparse: true, // FIX #2 : sparse requis car la valeur est générée en pre-save,
      // pas à l'insertion — sans sparse, les docs sans contractNumber
      // entrent en conflit sur l'index unique.
    },

    // ── Finance ───────────────────────────────
    totalAmount: { type: Number, required: true, default: 0 },
    advanceAmount: { type: Number, default: 0 },
    remainedAmount: { type: Number, default: 0 },

    // ── Workflow ──────────────────────────────
    status: {
      type: String,
      enum: ["EN_ATTENTE", "AVANCE_PAYEE", "TERMINE", "ANNULE"],
      default: "EN_ATTENTE",
    },
    source: { type: String, default: null },

    // ── Validation ────────────────────────────
    dateValidation: { type: Date, default: null },
    validatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Clôture ───────────────────────────────
    dateCloture: { type: Date, default: null },
    motifCloture: { type: String, default: null },
    cloreBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Annulation ────────────────────────────
    dateAnnulation: { type: Date, default: null },
    motifAnnulation: { type: String, default: null },
    annulePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Infos statiques ───────────────────────
    equipmentList: {
      type: String,
      default: "Boîtier IoT ESP32, Température, Humidité, CO2, Niveau d'eau",
    },
  },
  { timestamps: true },
);

// ─────────────────────────────────────────────
// Pre-save : génération du numéro de contrat
// ─────────────────────────────────────────────

// FIX #3 : [Date.now] était un lien Markdown copié par erreur dans le code source.
//          Date.now est une référence à la fonction (pas un appel) → toujours 0.
//          Corrigé en Date.now() (appel effectif).
//
// FIX #4 : le middleware pre("save") ne doit être déclenché qu'une seule fois.
//          Ajout de la garde `if (this.contractNumber)` pour ne pas régénérer
//          le numéro lors des sauvegardes ultérieures (update, archivage, etc.).
//
// FIX #5 : `next` était absent de la signature — Mongoose attend next() pour
//          passer au middleware suivant en mode callback. Sans next(), le save
//          reste bloqué indéfiniment si un autre middleware est enregistré.
//          Utilisation de async/next plutôt que async seul.
dossierSchema.pre("save", async function (next) {
  if (!this.contractNumber) {
    this.contractNumber =
      "CTR-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  }
  next();
});

module.exports = mongoose.model("Dossier", dossierSchema);
