const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "user_created",
        "user_updated",
        "user_deleted",
        "user_login",
        "user_logout",
        "poulailler_created",
        "poulailler_updated",
        "poulailler_deleted",
        "module_claimed",
        "module_dissociated",
        "module_offline",
        "alert_created",
        "alert_resolved",
        "command_sent",
        "command_executed",
        "system_error",
        "system_info",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
    },
    message: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    targetUser: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    poulailler: {
      type: mongoose.Schema.ObjectId,
      ref: "Poulailler",
    },
    module: {
      type: mongoose.Schema.ObjectId,
      ref: "Module",
    },
    alert: {
      type: mongoose.Schema.ObjectId,
      ref: "Alert",
    },
    command: {
      type: mongoose.Schema.ObjectId,
      ref: "Command",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient querying
logSchema.index({ createdAt: -1 });
logSchema.index({ type: 1, createdAt: -1 });
logSchema.index({ severity: 1, createdAt: -1 });
logSchema.index({ user: 1, createdAt: -1 });
logSchema.index({ poulailler: 1, createdAt: -1 });

// ✅ TTL INDEX: Auto-delete logs older than 90 days (keep longer than measures for audit)
logSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }, // 90 days in seconds
);

module.exports = mongoose.model("Log", logSchema);
