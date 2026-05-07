const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const {
  captureFromESP32,
  analyzeWithGemini,
} = require("../services/aiService");

// Verrou pour éviter deux analyses simultanées sur le même poulailler
const analysisLocks = new Set();

// ============================================================
// HELPER — vérifie l'accès au poulailler
// ============================================================
async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

// ============================================================
// @desc    Déclencher une analyse IA (capture + Gemini)
// @route   POST /api/ai/analyze/:poulaillerId
// @access  Private (JWT requis)
// ============================================================
exports.analyzePoultry = async (req, res) => {
  const { poulaillerId } = req.params;

  // Verrou : 1 seule analyse à la fois par poulailler
  if (analysisLocks.has(poulaillerId)) {
    return res.status(429).json({
      success: false,
      error: "Une analyse est déjà en cours pour ce poulailler",
    });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  // Vérifier que l'IP ESP32-CAM est configurée
  const espIp = poulailler.espCamIp || process.env.ESP32_CAM_IP;
  if (!espIp) {
    return res.status(400).json({
      success: false,
      error: "Adresse IP de l'ESP32-CAM non configurée",
    });
  }

  analysisLocks.add(poulaillerId);

  try {
    console.log(
      `[AI CONTROLLER] Analyse déclenchée pour poulailler ${poulaillerId}`,
    );

    // 1. Capture image depuis ESP32-CAM
    const imageBase64 = await captureFromESP32(espIp);

    // 2. Données capteurs actuelles
    const sensorData = {
      temperature: poulailler.lastMonitoring?.temperature ?? null,
      humidity: poulailler.lastMonitoring?.humidity ?? null,
      co2: poulailler.lastMonitoring?.co2 ?? null,
      nh3: poulailler.lastMonitoring?.nh3 ?? null,
      animalCount: poulailler.animalCount,
      surface: poulailler.surface,
    };

    // 3. Analyse Gemini
    const geminiResult = await analyzeWithGemini(imageBase64, sensorData);

    // 4. Sauvegarde en base
    const analysis = await AiAnalysis.create({
      poulaillerId,
      triggeredBy: req.body.triggeredBy ?? "manual",
      sensors: sensorData,
      result: geminiResult,
    });

    console.log(
      `[AI CONTROLLER] Analyse sauvegardée : ${analysis._id} | Score : ${geminiResult.healthScore}`,
    );

    // 5. Notification push si anomalie critique (délégué à alertService si disponible)
    if (
      geminiResult.urgencyLevel === "critique" ||
      geminiResult.detections.mortalityDetected
    ) {
      console.warn(
        `[AI CONTROLLER] ANOMALIE CRITIQUE détectée pour ${poulaillerId}`,
      );
      // TODO : appeler alertService.sendPushNotification() si disponible
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    console.error("[AI CONTROLLER] Erreur analyse :", err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    analysisLocks.delete(poulaillerId);
  }
};

// ============================================================
// @desc    Historique des 10 dernières analyses
// @route   GET /api/ai/history/:poulaillerId
// @access  Private
// ============================================================
exports.getAnalysisHistory = async (req, res) => {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const analyses = await AiAnalysis.find({
      poulaillerId: req.params.poulaillerId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    return res
      .status(200)
      .json({ success: true, count: analyses.length, data: analyses });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Dernière analyse uniquement
// @route   GET /api/ai/latest/:poulaillerId
// @access  Private
// ============================================================
exports.getLatestAnalysis = async (req, res) => {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const analysis = await AiAnalysis.findOne({
      poulaillerId: req.params.poulaillerId,
    }).sort({ createdAt: -1 });

    if (!analysis) {
      return res
        .status(200)
        .json({
          success: true,
          data: null,
          message: "Aucune analyse disponible",
        });
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Statistiques (score moyen, tendance)
// @route   GET /api/ai/stats/:poulaillerId
// @access  Private
// ============================================================
exports.getAnalysisStats = async (req, res) => {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const analyses = await AiAnalysis.find({
      poulaillerId: req.params.poulaillerId,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("result.healthScore result.urgencyLevel createdAt");

    if (analyses.length === 0) {
      return res
        .status(200)
        .json({ success: true, data: null, message: "Aucune donnée" });
    }

    const scores = analyses.map((a) => a.result.healthScore);
    const avgScore = Math.round(
      scores.reduce((a, b) => a + b, 0) / scores.length,
    );

    // Tendance : comparaison dernière vs avant-dernière analyse
    let trend = "stable";
    if (scores.length >= 2) {
      const diff = scores[0] - scores[1];
      if (diff > 5) trend = "amelioration";
      else if (diff < -5) trend = "degradation";
    }

    return res.status(200).json({
      success: true,
      data: {
        totalAnalyses: analyses.length,
        avgHealthScore: avgScore,
        trend,
        lastScore: scores[0],
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
