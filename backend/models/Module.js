const mongoose = require("mongoose");

const moduleSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    macAddress: {
      type: String,
      required: [true, "L'adresse MAC est requise"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    deviceName: {
      type: String,
      default: null,
      maxlength: 50,
    },
    firmwareVersion: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "associated", "offline", "dissociated"],
      default: "pending",
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
    lastPing: {
      type: Date,
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
    wifiSsid: {
      type: String,
      default: null,
    },
    wifiUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

moduleSchema.statics.normalizeMac = function (raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/[:\-\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(cleaned)) return null;
  return cleaned;
};

moduleSchema.methods.updateStatus = function () {
  if (this.status === "pending" || this.status === "dissociated") return;
  if (!this.lastPing) return;
  const diff = Date.now() - new Date(this.lastPing).getTime();
  if (diff > 24 * 60 * 60 * 1000 && this.status === "associated") {
    this.status = "offline";
  }
};

moduleSchema.pre("save", function (next) {
  this.updateStatus();
  next(); // FIX: missing next() call was causing "next is not a function" error
});

module.exports = mongoose.model("Module", moduleSchema);
