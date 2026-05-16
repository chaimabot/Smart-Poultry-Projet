// routes/aiRoute.js
// CORRIGÉ : Nouvelles routes asynchrones + anciennes pour compatibilité

const express = require("express");
const router = express.Router();
const {
  // ✅ NOUVEAUX — Flux asynchrone (recommandé)
  triggerCapture, // POST /capture/:poulaillerId
  getCaptureStatus, // GET /capture-status/:requestId

  // ✅ CORRIGÉ — Réception image ESP32 avec requestId
  receiveImageFromESP, // POST /receive-image

  // Anciennes routes (garde compatibilité)
  analyzePoultry, // POST /analyze/:poulaillerId
  getAnalysisHistory, // GET /history/:poulaillerId
  getLatestAnalysis, // GET /latest/:poulaillerId
  getAnalysisStats, // GET /stats/:poulaillerId
  chatWithVet, // POST /chat
  getChatHistory, // GET /chat/history/:poulaillerId
  clearChatHistory, // DELETE /chat/history/:poulaillerId

  // ❌ SUPPRIMÉ : awaitCameraImage (causait le 504)
} = require("../controllers/aiController");

const { protect } = require("../middlewares/auth");

// ============================================================================
// ROUTES ESP32 (Public — sans JWT)
// ============================================================================

// ✅ CORRIGÉ : L'ESP32 envoie l'image ici avec deviceId + requestId
router.post("/receive-image", receiveImageFromESP);

// ============================================================================
// ROUTES CAPTURE ASYNCHRONE (NOUVEAU — remplace awaitCameraImage)
// ============================================================================

// ✅ NOUVEAU : Déclenche une capture, retourne immédiatement un requestId
// La réponse est en < 1 seconde, pas de timeout 504
router.post("/capture/:poulaillerId", protect, triggerCapture);

// ✅ NOUVEAU : Polling du statut de capture par l'app mobile
// Retourne : { status: "pending" | "uploading" | "analyzing" | "completed" | "failed" }
router.get("/capture-status/:requestId", protect, getCaptureStatus);

// ============================================================================
// ROUTES ANALYSE (Anciennes — gardées pour compatibilité)
// ============================================================================

// Analyse avec image fournie directement (mode manuel)
router.post("/analyze/:poulaillerId", protect, analyzePoultry);

// Historique et statistiques
router.get("/history/:poulaillerId", protect, getAnalysisHistory);
router.get("/latest/:poulaillerId", protect, getLatestAnalysis);
router.get("/stats/:poulaillerId", protect, getAnalysisStats);

// ============================================================================
// ROUTES CHAT IA (Inchangées)
// ============================================================================

router.post("/chat", protect, chatWithVet);
router.get("/chat/history/:poulaillerId", protect, getChatHistory);
router.delete("/chat/history/:poulaillerId", protect, clearChatHistory);

module.exports = router;
