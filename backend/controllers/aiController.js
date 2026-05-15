const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const {
  publishCaptureTrigger,
  analyzeWithCloudflareAI,
  chatWithGemma,
} = require("../services/aiService");

const analysisLocks = new Set();
const pendingImages = new Map();

async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

function waitForImage(poulaillerId, timeoutMs = 35000) {
  const id = poulaillerId.toString().trim();

  return new Promise((resolve, reject) => {
    const existing = pendingImages.get(id);
    if (existing?.image) {
      pendingImages.delete(id);
      return resolve({ image: existing.image });
    }

    const startTime = Date.now();

    const interval = setInterval(() => {
      try {
        const current = pendingImages.get(id);

        if (current?.image) {
          clearInterval(interval);
          pendingImages.delete(id);
          return resolve({ image: current.image });
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          pendingImages.delete(id);
          reject(new Error(`Timeout image pour poulailler ${id}`));
        }
      } catch (err) {
        clearInterval(interval);
        pendingImages.delete(id);
        reject(err);
      }
    }, 500);
  });
}

async function receiveImageFromESP(req, res) {
  try {
    const deviceId = req.body?.deviceId; // MAC address ESP32CAM
    const image = req.body?.image || req.body?.imageBase64;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: "deviceId requis" });
    }
    if (!image) {
      return res.status(400).json({ success: false, error: "image requise" });
    }

    // ── Résolution MAC → poulaillerId ──────────────────────
    let poulaillerId;
    const poulailler = await Poulailler.findOne({ macAddressCam: deviceId });

    if (poulailler) {
      poulaillerId = poulailler._id.toString().trim();
      console.log(`[AI] MAC ${deviceId} → poulailler ${poulaillerId}`);
    } else {
      if (deviceId === "70:4B:CA:23:E5:44") {
        poulaillerId = "69f27e9b62b5f08c9bf125f9";
        console.warn(
          `[AI] MODE TEST — MAC ${deviceId} → poulailler ${poulaillerId}`,
        );
      } else {
        return res
          .status(404)
          .json({ success: false, error: `MAC inconnue : ${deviceId}` });
      }
    }

    const cleanBase64 = image.includes(",") ? image.split(",")[1] : image;
    const base64Length = cleanBase64.length;
    const padding = (cleanBase64.match(/=/g) || []).length;
    const imageSizeKb = Math.round(((base64Length * 3) / 4 - padding) / 1024);

    if (imageSizeKb < 3) {
      return res.status(400).json({
        success: false,
        error: `Image trop petite (${imageSizeKb} Ko) — minimum 3 Ko requis`,
      });
    }

    console.log(
      `[AI] Image reçue — poulailler ${poulaillerId} (${imageSizeKb} Ko)`,
    );

    // ── Stockage en attente d'analyse ──────────────────────
    pendingImages.set(poulaillerId, {
      image: cleanBase64,
      receivedAt: Date.now(),
    });

    setTimeout(() => {
      if (pendingImages.has(poulaillerId)) {
        pendingImages.delete(poulaillerId);
        console.warn(`[AI] Image expirée pour le poulailler ${poulaillerId}`);
      }
    }, 60_000);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] Erreur receiveImageFromESP :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function analyzePoultry(req, res) {
  const { poulaillerId } = req.params;

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

    await publishCaptureTrigger(poulaillerId);
    console.log("[AI] Trigger MQTT envoyé — attente de l'image...");

    const { image } = await waitForImage(poulaillerId, 35000);
    console.log("[AI] Image reçue — lancement de l'analyse...");

    const aiResult = await analyzeWithCloudflareAI(
      image,
      sensorData,
      thresholds,
    );

    const analysis = await AiAnalysis.create({
      poulaillerId,
      triggeredBy: req.body.triggeredBy ?? "manual",
      sensors: sensorData,
      result: aiResult,
      imageQuality: aiResult.imageQuality,
      imageBase64: image,
    });

    console.log(
      `[AI] Analyse sauvegardée — ID: ${analysis._id} | Score: ${aiResult.healthScore}`,
    );

    if (
      aiResult.urgencyLevel === "critique" ||
      aiResult.detections?.mortalityDetected ||
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
        icon: aiResult.detections?.mortalityDetected ? "alert-circle" : "wind",
        severity: "danger",
      });
      console.warn(
        `[AI] Alerte critique créée pour le poulailler ${poulaillerId}`,
      );
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    console.error("[AI] Erreur analyse :", err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    analysisLocks.delete(poulaillerId);
  }
}
async function awaitCameraImage(req, res) {
  const { poulaillerId } = req.params;

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  try {
    console.log(`[AI] Déclenchement capture MQTT — poulailler ${poulaillerId}`);

    // 1. Publie la commande MQTT → ESP32CAM prend la photo
    await publishCaptureTrigger(poulaillerId);
    console.log("[AI] Commande MQTT envoyée → attente image...");

    // 2. Attend que l'ESP32 envoie l'image (POST /api/ai/receive-image)
    const { image } = await waitForImage(poulaillerId, 35_000);
    console.log("[AI] Image reçue — envoi au client");

    // 3. Retourne l'image base64 au client mobile
    return res.status(200).json({
      success: true,
      data: {
        imageBase64: image, // base64 pur, sans préfixe data:
        sizeKb: Math.round((image.length * 3) / 4 / 1024),
      },
    });
  } catch (err) {
    console.error("[AI] Erreur awaitCameraImage :", err.message);
    return res.status(504).json({
      success: false,
      error: "Timeout ou erreur lors de la capture : " + err.message,
    });
  }
}

async function getAnalysisHistory(req, res) {
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
    console.error("[AI] Erreur historique :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function getLatestAnalysis(req, res) {
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
      return res.status(200).json({
        success: true,
        data: null,
        message: "Aucune analyse disponible",
      });
    }

    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    console.error("[AI] Erreur dernière analyse :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function getAnalysisStats(req, res) {
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
      return res.status(200).json({
        success: true,
        data: null,
        message: "Aucune donnée disponible",
      });
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

    const urgencyDistribution = analyses.reduce((acc, a) => {
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
        urgencyDistribution,
      },
    });
  } catch (err) {
    console.error("[AI] Erreur statistiques :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function chatWithVet(req, res) {
  const { question, poulaillerId } = req.body;

  if (!question || !poulaillerId) {
    return res.status(400).json({
      success: false,
      error: "Les champs question et poulaillerId sont requis",
    });
  }
  if (question.trim().length < 3) {
    return res.status(400).json({
      success: false,
      error: "Question trop courte (minimum 3 caractères)",
    });
  }
  if (question.length > 500) {
    return res.status(400).json({
      success: false,
      error: "Question trop longue (maximum 500 caractères)",
    });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const lastAnalysis = await AiAnalysis.findOne({ poulaillerId }).sort({
      createdAt: -1,
    });

    const context = {
      poulaillerName: poulailler.name,
      animalCount: poulailler.animalCount,
      lastScore: lastAnalysis?.result?.healthScore ?? "N/A",
      lastUrgency: lastAnalysis?.result?.urgencyLevel ?? "N/A",
      lastDiagnostic:
        lastAnalysis?.result?.diagnostic ?? "Aucune analyse disponible",
      lastAdvices: lastAnalysis?.result?.advices?.join(". ") ?? null,
      temperature: poulailler.lastMonitoring?.temperature ?? null,
      humidity: poulailler.lastMonitoring?.humidity ?? null,
      airQuality: poulailler.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler.lastMonitoring?.waterLevel ?? null,
    };

    const answer = await chatWithGemma(question, context);

    return res.status(200).json({
      success: true,
      data: {
        answer,
        context: {
          lastHealthScore: context.lastScore,
          lastUrgency: context.lastUrgency,
          lastAnalysisDate: lastAnalysis?.createdAt ?? null,
        },
      },
    });
  } catch (err) {
    console.error("[AI] Erreur chatWithVet :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

module.exports = {
  receiveImageFromESP,
  analyzePoultry,
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  chatWithVet,
  pendingImages,
  awaitCameraImage,
};
