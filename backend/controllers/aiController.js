// controllers/aiController.js
// ============================================================
// AI Controller — Smart Poultry
// Gère : analyse manuelle, réception ESP32, historique, stats
// ============================================================

const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const {
  publishCaptureTrigger,
  analyzeWithGemini,
} = require("../services/aiService");

const analysisLocks = new Set();

// Map temporaire : images en attente d'analyse
// { poulaillerId: { image: string, receivedAt: timestamp } }
const pendingImages = new Map();

// ============================================================
// HELPER — vérifie accès poulailler
// ============================================================
async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

// ============================================================
// @desc    ESP32 envoie l'image directement
// @route   POST /api/ai/receive-image
// @access  Public (ESP32 sans JWT)
// ============================================================
exports.receiveImageFromESP = async (req, res) => {
  try {
    const poulaillerId = req.body?.poulaillerId || req.body?.deviceId;
    const image = req.body?.image || req.body?.imageBase64;

    if (!poulaillerId) {
      return res
        .status(400)
        .json({ success: false, error: "poulaillerId requis" });
    }
    if (!image) {
      return res.status(400).json({ success: false, error: "image requise" });
    }

    const id = poulaillerId.toString().trim();
    const imageSizeKb = Math.round((image.length * 3) / 4 / 1024);

    if (imageSizeKb < 3) {
      return res.status(400).json({
        success: false,
        error: `Image trop petite (${imageSizeKb} Ko)`,
      });
    }

    console.log(`[AI] Image ESP32 reçue — poulailler ${id}, ${imageSizeKb} Ko`);

    // Stocker pour que waitForImage la récupère
    pendingImages.set(id, { image, receivedAt: Date.now() });

    // Auto-cleanup après 60s
    setTimeout(() => {
      if (pendingImages.has(id)) {
        pendingImages.delete(id);
        console.warn(`[AI] Image expirée pour ${id}`);
      }
    }, 60000);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] Erreur receiveImageFromESP :", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// @desc    Attend l'image d'un poulailler (INTERNE)
// ============================================================
function waitForImage(poulaillerId, timeoutMs = 35000) {
  const id = poulaillerId.toString().trim();

  return new Promise((resolve, reject) => {
    // Image déjà arrivée ?
    const existing = pendingImages.get(id);
    if (existing?.image) {
      pendingImages.delete(id);
      return resolve({ image: existing.image });
    }

    // Polling toutes les 500ms
    const startTime = Date.now();
    const interval = setInterval(() => {
      const current = pendingImages.get(id);
      if (current?.image) {
        clearInterval(interval);
        pendingImages.delete(id);
        return resolve({ image: current.image });
      }

      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout image pour poulailler ${id}`));
      }
    }, 500);
  });
}

// ============================================================
// @desc    Analyse IA manuelle
// @route   POST /api/ai/analyze/:poulaillerId
// @access  Private (JWT)
// ============================================================
exports.analyzePoultry = async (req, res) => {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res.status(429).json({
      success: false,
      error: "Analyse déjà en cours pour ce poulailler",
    });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  analysisLocks.add(poulaillerId);

  try {
    console.log(`[AI] Analyse manuelle — ${poulaillerId}`);

    const sensorData = {
      temperature: poulailler.lastMonitoring?.temperature ?? null,
      humidity: poulailler.lastMonitoring?.humidity ?? null,
      airQualityPercent: poulailler.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler.lastMonitoring?.waterLevel ?? null,
      animalCount: poulailler.animalCount,
      surface: poulailler.surface,
    };

    const thresholds = poulailler.thresholds;

    // 1. Trigger MQTT → ESP32
    await publishCaptureTrigger(poulaillerId);
    console.log(`[AI] Trigger envoyé, attente image...`);

    // 2. Attendre image (FONCTION INTERNE)
    const { image } = await waitForImage(poulaillerId, 35000);
    console.log(`[AI] Image reçue, analyse...`);

    // 3. Analyse IA
    const aiResult = await analyzeWithGemini(image, sensorData, thresholds);

    // 4. Sauvegarde
    const analysis = await AiAnalysis.create({
      poulaillerId,
      triggeredBy: req.body.triggeredBy ?? "manual",
      sensors: sensorData,
      result: aiResult,
      imageQuality: aiResult.imageQuality,
    });

    console.log(
      `[AI] Sauvegardé — ${analysis._id} | Score: ${aiResult.healthScore}`,
    );

    // 5. Alerte si critique
    if (
      aiResult.urgencyLevel === "critique" ||
      aiResult.detections.mortalityDetected ||
      aiResult.airQualityAssessment?.estimatedRisk === "high"
    ) {
      await Alert.create({
        poulailler: poulaillerId,
        type: "sensor",
        key: "ai_analysis",
        parameter: "airQuality",
        value: sensorData.airQualityPercent,
        threshold: thresholds.airQualityMin,
        direction: "below",
        message: aiResult.diagnostic,
        icon: aiResult.detections.mortalityDetected ? "alert-circle" : "wind",
        severity: "danger",
      });
      console.warn(`[AI] ⚠ ALERTE CRITIQUE créée pour ${poulaillerId}`);
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    console.error("[AI] Erreur analyse :", err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    analysisLocks.delete(poulaillerId);
  }
};

// ============================================================
// @desc    Historique des analyses
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
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Dernière analyse
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
        .json({ success: true, data: null, message: "Aucune analyse" });
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Statistiques
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

    let trend = "stable";
    if (scores.length >= 2) {
      const diff = scores[0] - scores[1];
      if (diff > 5) trend = "amelioration";
      else if (diff < -5) trend = "degradation";
    }

    // Compteur par niveau d'urgence
    const urgencyCounts = analyses.reduce((acc, a) => {
      acc[a.result.urgencyLevel] = (acc[a.result.urgencyLevel] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      data: {
        totalAnalyses: analyses.length,
        avgHealthScore: avgScore,
        trend,
        lastScore: scores[0],
        urgencyDistribution: urgencyCounts,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ============================================================
// @desc    Chatbot vétérinaire
// @route   POST /api/ai/chat
// @access  Private
// ============================================================
exports.chatWithVet = async (req, res) => {
  const { question, poulaillerId } = req.body;

  try {
    const poulailler = await Poulailler.findById(poulaillerId);
    const lastAnalysis = await AiAnalysis.findOne({ poulaillerId }).sort({
      createdAt: -1,
    });

    // Réponse basée sur les données du poulailler (sans cloud IA)
    const context = {
      poulaillerName: poulailler?.name || "Inconnu",
      animalCount: poulailler?.animalCount || "N/A",
      lastScore: lastAnalysis?.result?.healthScore || "N/A",
      lastUrgency: lastAnalysis?.result?.urgencyLevel || "N/A",
      lastDiagnostic: lastAnalysis?.result?.diagnostic || "Aucune analyse",
    };

    // Réponse simple basée sur les règles (peut être enrichie avec un vrai LLM plus tard)
    let answer = "";

    if (
      question.toLowerCase().includes("santé") ||
      question.toLowerCase().includes("etat")
    ) {
      answer = `État du poulailler ${context.poulaillerName} : Dernier score de santé ${context.lastScore}/100 (niveau ${context.lastUrgency}). ${context.lastDiagnostic}`;
    } else if (
      question.toLowerCase().includes("alerte") ||
      question.toLowerCase().includes("danger")
    ) {
      answer =
        context.lastUrgency === "critique"
          ? "🚨 ALERTE ACTIVE : Intervention immédiate recommandée !"
          : context.lastUrgency === "attention"
            ? "⚠️ Surveillance renforcée conseillée."
            : "✅ Aucune alerte active. État stable.";
    } else if (
      question.toLowerCase().includes("conseil") ||
      question.toLowerCase().includes("recommandation")
    ) {
      answer =
        lastAnalysis?.result?.advices?.join(" ") ||
        "Maintenir la surveillance régulière et vérifier les capteurs.";
    } else {
      answer = `Je suis l'assistant IA de Smart Poultry. Le poulailler ${context.poulaillerName} compte ${context.animalCount} volailles. Dernière analyse : ${context.lastDiagnostic}. Posez-moi une question sur la santé, les alertes ou les conseils.`;
    }

    return res.status(200).json({
      success: true,
      data: {
        answer,
        context: {
          lastHealthScore: context.lastScore,
          lastUrgency: context.lastUrgency,
          lastAnalysisDate: lastAnalysis?.createdAt,
        },
      },
    });
  } catch (err) {
    console.error("[AI] Erreur chat :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
