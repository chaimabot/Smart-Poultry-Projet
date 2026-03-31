const mongoose = require("mongoose");

/**
 * Statuts du module (SIMPLIFIES - Uni avec backend-admin):
 * - pending: Module en attente de claim/association
 * - associated: Module associé à un poulailler
 * - offline: Module hors ligne (pas de ping depuis 24h)
 * - dissociated: Module dissocié (disponible pour nouvelle association)
 */
const STATUS_ENUM = ["pending", "associated", "offline", "dissociated"];

/**
 * Schéma de log d'audit pour les opérations sur les modules
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        "created",
        "claimed",
        "associated",
        "dissociated",
        "revoked",
        "code_generated",
      ],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    details: {
      type: String,
      default: null,
    },
    claimCode: {
      type: String,
      default: null,
    },
    poulaillerId: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

const moduleSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: String,
      required: [true, "Le numéro de série est requis"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    macAddress: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    deviceName: {
      type: String,
      required: [true, "Le nom du module est requis"],
      maxlength: [50, "Le nom ne peut pas dépasser 50 caractères"],
    },
    firmwareVersion: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "pending",
      index: true,
    },
    claimCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    claimCodeExpiresAt: {
      type: Date,
      default: null,
    },
    claimCodeUsedAt: {
      type: Date,
      default: null,
    },
    previousClaimCode: {
      type: String,
      default: null,
    },
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      default: null,
    },
    owner: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
    },
    installationDate: {
      type: Date,
      default: null,
    },
    lastPing: {
      type: Date,
      default: null,
    },
    dissociationReason: {
      type: String,
      maxlength: [500, "Le motif ne peut pas dépasser 500 caractères"],
      default: null,
    },
    dissociatedAt: {
      type: Date,
      default: null,
    },
    auditLogs: [auditLogSchema],
  },
  {
    timestamps: true,
  },
);

// Indexes
moduleSchema.index({ status: 1, claimCodeExpiresAt: 1 });
moduleSchema.index({ claimCode: 1, claimCodeUsedAt: 1 });
moduleSchema.index({ owner: 1, status: 1 });

/**
 * Methode pour mettre a jour le statut base sur lastPing
 */
moduleSchema.methods.updateStatus = function () {
  if (this.status === "pending" || this.status === "dissociated") return;
  if (!this.lastPing) return;

  const timeSinceLastPing = Date.now() - new Date(this.lastPing).getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (timeSinceLastPing > twentyFourHours && this.status === "associated") {
    this.status = "offline";
  }
};

/**
 * Methode pour generer un code claim cryptographique
 * Format: XXXX-XXXX-XXXX
 */
moduleSchema.statics.generateClaimCode = function () {
  // Generation de 4 bytes pour chaque partie
  const bytes1 = require("crypto").randomBytes(4);
  const bytes2 = require("crypto").randomBytes(4);
  const bytes3 = require("crypto").randomBytes(4);

  // Conversion en hex et prise des 4 premiers caracteres
  const part1 = bytes1.toString("hex").substring(0, 4).toUpperCase();
  const part2 = bytes2.toString("hex").substring(0, 4).toUpperCase();
  const part3 = bytes3.toString("hex").substring(0, 4).toUpperCase();

  return `${part1}-${part2}-${part3}`;
};

/**
 * Methode pour verifier si un code claim est expire
 */
moduleSchema.methods.isClaimCodeExpired = function () {
  if (!this.claimCode || !this.claimCodeExpiresAt) return true;
  return new Date() > this.claimCodeExpiresAt;
};

// Pre-save middleware
moduleSchema.pre("save", function (next) {
  this.updateStatus();
  next();
});

module.exports = mongoose.model("Module", moduleSchema);
