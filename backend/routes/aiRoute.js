// routes/aiRoutes.js
// ============================================================
// Routes IA — Smart Poultry
// ============================================================

const express = require("express");
const router = express.Router();
const {
  receiveImageFromESP,
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  chatWithVet,
  awaitCameraImage,
} = require("../controllers/aiController");
const { protect } = require("../middlewares/auth");

// ── Public (ESP32 + mobile envoient l'image sans JWT) ────────────────────────
router.post("/receive-image", receiveImageFromESP);

// ── Protégées (JWT requis) ────────────────────────────────────────────────────
router.post("/analyze/:poulaillerId", protect, analyzePoultry);
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);
router.post("/chat", protect, chatWithVet);
router.post("/capture/:poulaillerId", protect, awaitCameraImage);

module.exports = router;
