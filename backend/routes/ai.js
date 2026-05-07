const express = require("express");
const router = express.Router();
const {
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
} = require("../controllers/aiController");
const { receiveImage } = require("../controllers/uploadController");
const { protect } = require("../middlewares/auth");

// Route publique (appelée par l'ESP32, pas de JWT)
router.post("/upload-image", receiveImage);

// Routes protégées
router.use(protect);
router.post("/analyze/:poulaillerId", analyzePoultry);
router.get("/history/:poulaillerId", getAnalysisHistory);
router.get("/latest/:poulaillerId", getLatestAnalysis);
router.get("/stats/:poulaillerId", getAnalysisStats);

module.exports = router;
