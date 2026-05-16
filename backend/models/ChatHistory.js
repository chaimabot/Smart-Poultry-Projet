const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const chatHistorySchema = new mongoose.Schema(
  {
    poulaillerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Poulailler",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messages: [messageSchema],
  },
  { timestamps: true },
);

// Index pour recherche rapide
chatHistorySchema.index({ poulaillerId: 1, userId: 1 });

module.exports = mongoose.model("ChatHistory", chatHistorySchema);
