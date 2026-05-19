const mongoose = require("mongoose");

// ─── SCHEMA ──────────────────────────────────────────────────────────────────

const cameraSchema = new mongoose.Schema(
  {
    macAddress: {
      type: String,
      required: [true, "L'adresse MAC est requise"],
      unique: true,
      uppercase: true,
      trim: true,
      match: [
        /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/,
        "Adresse MAC invalide (format attendu : XX:XX:XX:XX:XX:XX)",
      ],
    },

    serialNumber: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    deviceName: {
      type: String,
      trim: true,
    },

    firmwareVersion: {
      type: String,
      trim: true,
    },

    // ── Champ spécifique ESP32-CAM ──────────────────────────────────────────
    streamUrl: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (v) => !v || /^https?:\/\/.+/.test(v),
        message: "L'URL du flux doit commencer par http:// ou https://",
      },
    },

    status: {
      type: String,
      enum: ["pending", "associated", "offline", "dissociated"],
      default: "pending",
    },

    lastPing: {
      type: Date,
      default: null,
    },

    poulailler: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      default: null,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    dissociationReason: {
      type: String,
      default: null,
    },

    dissociatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ─── INDEXES ─────────────────────────────────────────────────────────────────

cameraSchema.index({ status: 1 });
cameraSchema.index({ poulailler: 1 });

// ─── STATIC: normalize MAC address ───────────────────────────────────────────
// Accepte : "A8032A1B4C20", "A8:03:2A:1B:4C:20", "a8-03-2a-1b-4c-20"
// Retourne : "A8:03:2A:1B:4C:20" ou null si invalide

cameraSchema.statics.normalizeMac = function (raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/[:\-\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(cleaned)) return null;
  return cleaned.match(/.{2}/g).join(":");
};

// ─── STATIC: generate next serial + device name ──────────────────────────────
// Retourne { serialNumber: "CAM-001", deviceName: "ESP32CAM_001" }
// Cherche le numéro max parmi tous les serials existants pour éviter
// les conflits même après suppression.

cameraSchema.statics.generateIdentifiers = async function () {
  const all = await this.find(
    { serialNumber: { $exists: true, $ne: null } },
    { serialNumber: 1 },
  ).lean();

  let maxIndex = 0;
  for (const doc of all) {
    const match = doc.serialNumber && doc.serialNumber.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxIndex) maxIndex = n;
    }
  }

  const padded = String(maxIndex + 1).padStart(3, "0");
  return {
    serialNumber: "CAM-" + padded,
    deviceName: "ESP32CAM_" + padded,
  };
};

// ─── MODEL ───────────────────────────────────────────────────────────────────

module.exports = mongoose.model("Camera", cameraSchema);
