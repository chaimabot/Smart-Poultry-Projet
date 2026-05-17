const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");


const {
  triggerCapture,
  getCaptureStatus,
  receiveImageFromESP,
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  chatWithVet,
  getChatHistory,
  clearChatHistory,
} = require("../controllers/aiController");

// ── Routes protégées (JWT) ──────────────────────────────────
router.post("/capture/:poulaillerId", protect, triggerCapture);
router.get("/capture-status/:requestId", protect, getCaptureStatus);
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);
router.post("/chat", protect, chatWithVet);
router.get("/chat/:poulaillerId", protect, getChatHistory);
router.delete("/chat/:poulaillerId", protect, clearChatHistory);

router.post("/receive-image", receiveImageFromESP);

module.exports = router;
