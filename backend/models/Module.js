const mongoose = require("mongoose");

/**
 * Statuts du module:
 * - stock: Module en stock, pas encore activé
 * - pending_claim: Module découvert mais pas encore réclamé/associé
 * - claimed: Code claim utilisé (en attente d'association à un poulailler)
 * - associated: Module associé à un poulailler
 * - offline: Module Hors ligne (pas de ping depuis 24h)
 * - revoked: Module révoqué/dissocié
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
    // Identifiant unique du module (MAC address ou serial)
    serialNumber: {
      type: String,
      required: [true, "Le numéro de série est requis"],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Adresse MAC pour identification ESP32
    macAddress: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      match: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
    },

    // Nom convivial du module
    deviceName: {
      type: String,
      required: [true, "Le nom du module est requis"],
      maxlength: [50, "Le nom ne peut pas dépasser 50 caractères"],
    },

    // Version du firmware
    firmwareVersion: {
      type: String,
      default: null,
    },

    // Statut actuel du module
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "pending",
      index: true,
    },

    // Code de claim (generé cryptographiquement)
    // Format: K9P2-MW4Q-8R7T-X1Y2 (10-12 chars avec tirets)
    claimCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // Date d'expiration du code claim (180 jours par defaut)
    claimCodeExpiresAt: {
      type: Date,
      default: null,
    },

    // Date d'utilisation du code claim
    claimCodeUsedAt: {
      type: Date,
      default: null,
    },

    // Ancien code claim (pour historique, ne peut pas être réutilisé)
    previousClaimCode: {
      type: String,
      default: null,
    },

    // Reference vers le poulailler associe
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
      default: null,
    },

    // Proprietaire (eleveur) du module
    owner: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      default: null,
    },

    // Date d'installation
    installationDate: {
      type: Date,
      default: null,
    },

    // Dernier ping recu
    lastPing: {
      type: Date,
      default: null,
    },

    // Motif de dissociation/revocation
    dissociationReason: {
      type: String,
      maxlength: [500, "Le motif ne peut pas dépasser 500 caractères"],
      default: null,
    },

    // Date de dissociation
    dissociatedAt: {
      type: Date,
      default: null,
    },

    // Logs d'audit
    auditLogs: [auditLogSchema],
  },
  {
    timestamps: true,
  },
);

/**
 * Index pour optimiser les requetes frequentes
 */
// Index compose pour les modules en attente de claim
moduleSchema.index({ status: 1, claimCodeExpiresAt: 1 });
// Index pour recherche par claim code
moduleSchema.index({ claimCode: 1, claimCodeUsedAt: 1 });
// Index pour les modules d'un owner
moduleSchema.index({ owner: 1, status: 1 });

/**
 * Methode pour mettre a jour le statut bas sur lastPing
 * - Si lastPing < 24h: connecte/associated
 * - Si lastPing > 24h: offline
 * - Si lastPing null et status != stock: pending_claim
 */
moduleSchema.methods.updateStatus = function () {
  // Ne pas modifier si en attente ou dissocie
  if (this.status === "pending" || this.status === "dissociated") return;

  // Verifier le dernier heartbeat
  if (this.lastPing) {
    const timeSinceLastPing = Date.now() - new Date(this.lastPing).getTime();
    const fifteenMinutes = 15 * 60 * 1000;

    if (timeSinceLastPing > fifteenMinutes && this.status === "associated") {
      this.status = "offline";
    }
  }
};

/**
 * Methode pour generer un code claim cryptographique
 * Entropie >= 50 bits (10-12 caracteres alphanumeriques avec tirets)
 * Format: XXXX-XXXX-XXXX (12 caracteres avec tirets)
 */
moduleSchema.statics.generateClaimCode = function () {
  // Generation de 9 bytes (72 bits d'entropie) pour le code declaim
  const bytes = require("crypto").randomBytes(9);

  // Conversion en base36 et mise en majuscules
  // On obtient environ 14 caracteres, on prend les 12 premiers avec format XXX-XXX-XXX
  const base36 = bytes.toString("base36").toUpperCase();

  // Format avec tirets: XXXX-XXXX-XXXX
  return `${base36.substring(0, 4)}-${base36.substring(4, 8)}-${base36.substring(8, 12)}`;
};

/**
 * Methode pour verifier si un code claim est expiré
 */
moduleSchema.methods.isClaimCodeExpired = function () {
  if (!this.claimCode || !this.claimCodeExpiresAt) return true;
  return new Date() > this.claimCodeExpiresAt;
};

/**
 * Methode pour ajouter un log d'audit
 */
moduleSchema.methods.addAuditLog = async function (
  action,
  userId,
  details = null,
  options = {},
) {
  this.auditLogs.push({
    action,
    performedBy: userId,
    details,
    claimCode: options.claimCode || null,
    poulaillerId: options.poulaillerId || null,
    ipAddress: options.ipAddress || null,
  });
  await this.save();
};

// Middleware pre-save pour mettre a jour le statut
moduleSchema.pre("save", function (next) {
  this.updateStatus();
  next();
});

module.exports = mongoose.model("Module", moduleSchema);
