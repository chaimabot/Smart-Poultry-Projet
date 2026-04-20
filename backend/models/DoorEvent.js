const mongoose = require("mongoose");

const DoorEventSchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["open", "close"],
      required: true,
    },
    source: {
      type: String,
      enum: ["auto", "manual"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },

  },
  { timestamps: false } // We only use our custom timestamp
);

// TTL index: automatically delete documents after 90 days
DoorEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model("DoorEvent", DoorEventSchema);
