// routes/aiRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  receiveImageFromESP,
  chatWithVet,
} = require("../controllers/aiController");

// Public — ESP32 envoie l'image ici (pas de JWT)
router.post("/receive-image", receiveImageFromESP);

// Protégées — JWT requis
router.post("/analyze/:poulaillerId", protect, analyzePoultry);
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);
router.post("/chat", protect, chatWithVet);

module.exports = router;
