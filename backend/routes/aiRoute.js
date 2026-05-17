const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/auth");

// Diagnostic rapide: vérifier que /api/ai est bien monté
router.get("/__ping", (req, res) => {
  res.json({ ok: true });
});

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
router.post(
  "/capture/:poulaillerId",
  (req, res, next) => {
    console.log(
      `[AI ROUTE] /capture hit poulaillerId=${req.params.poulaillerId}`,
    );
    next();
  },
  protect,
  triggerCapture,
);

router.post("/capture-status/:requestId", protect, getCaptureStatus); // ← gardé pour compatibilité
// ✅ FIX : /analyze/:poulaillerId aliasé vers analyzePoultry (évite 404 si ancien code l'appelle encore)
router.post("/analyze/:poulaillerId", protect, analyzePoultry);
router.get("/capture-status/:requestId", protect, getCaptureStatus);
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);
router.post("/chat", protect, chatWithVet);
router.get("/chat/:poulaillerId", protect, getChatHistory);
router.delete("/chat/:poulaillerId", protect, clearChatHistory);

router.post("/receive-image", receiveImageFromESP);

module.exports = router;
