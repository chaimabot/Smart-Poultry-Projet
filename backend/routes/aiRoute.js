const express = require("express");
const router = express.Router();
const {
  receiveImageFromESP,
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  chatWithVet,
  getChatHistory,
  clearChatHistory,
  awaitCameraImage,
} = require("../controllers/aiController");
const { protect } = require("../middlewares/auth");

// ── Public (ESP32 sans JWT) ───────────────────────────────
router.post("/receive-image", receiveImageFromESP);

// ── Analyse image ─────────────────────────────────────────
router.post("/analyze/:poulaillerId", protect, analyzePoultry);
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);
router.post("/capture/:poulaillerId", protect, awaitCameraImage);

// ── Chat IA ───────────────────────────────────────────────
router.post("/chat", protect, chatWithVet);
router.get("/chat/history/:poulaillerId", protect, getChatHistory);
router.delete("/chat/history/:poulaillerId", protect, clearChatHistory);

module.exports = router;
