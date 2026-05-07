const express = require("express");
const router = express.Router();
const {
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
} = require("../controllers/aiController");
const { protect } = require("../middlewares/auth");

router.use(protect);

// POST  /api/ai/analyze/:poulaillerId  → déclenche capture + analyse Gemini
router.post("/analyze/:poulaillerId", analyzePoultry);

// GET   /api/ai/history/:poulaillerId  → 10 dernières analyses
router.get("/history/:poulaillerId", getAnalysisHistory);

// GET   /api/ai/latest/:poulaillerId   → dernière analyse
router.get("/latest/:poulaillerId", getLatestAnalysis);

// GET   /api/ai/stats/:poulaillerId    → score moyen + tendance
router.get("/stats/:poulaillerId", getAnalysisStats);

module.exports = router;
