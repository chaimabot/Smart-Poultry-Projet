// controllers/aiController.js
// CORRIGÉ : Architecture asynchrone avec polling, pas d'attente bloquante

const Poulailler = require("../models/Poulailler");
const Camera = require("../models/Camera");
const AiAnalysis = require("../models/AiAnalysis");
const ChatHistory = require("../models/ChatHistory");
const Alert = require("../models/Alert");
const cloudinary = require("../services/cloudinaryService");

const {
  publishCaptureTrigger,
  analyzeWithCloudflareAI,
  chatWithGemma,
} = require("../services/aiService");

// ============================================================================
// STOCKAGE DES CAPTURES EN COURS (pour polling)
// ============================================================================
const pendingCaptures = new Map(); // requestId → { status, image, result, error }
const analysisLocks = new Set();

// Nettoyage auto après 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [requestId, capture] of pendingCaptures.entries()) {
    if (now - capture.createdAt > 120000) {
      // 2 min
      pendingCaptures.delete(requestId);
      console.log(`[AI] Capture expirée et nettoyée: ${requestId}`);
    }
  }
}, 30000);

// ============================================================================
// HELPER : Vérifie accès utilisateur
// ============================================================================
async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

// ============================================================================
// HELPER : Vérifie caméra associée
// ============================================================================
async function verifyCameraLinked(poulaillerId) {
  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: { $nin: ["pending", "dissociated"] },
  });
  if (!camera) {
    throw new Error("Aucune caméra active associée à ce poulailler");
  }
  return camera;
}

// ============================================================================
// ROUTE 1 : POST /api/ai/capture/:poulaillerId
// Déclenche la capture, retourne immédiatement un requestId
// ============================================================================
async function triggerCapture(req, res) {
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
    console.log(`[AI] Déclenchement capture — poulailler ${poulaillerId}`);

    // Vérifie caméra
    const camera = await verifyCameraLinked(poulaillerId);
    console.log(`[AI] Caméra trouvée: ${camera.macAddress}`);

    // Génère requestId unique
    const requestId = `cap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialise le suivi
    pendingCaptures.set(requestId, {
      poulaillerId,
      status: "pending",
      createdAt: Date.now(),
      image: null,
      result: null,
      error: null,
    });

    // Tente d'envoyer commande MQTT
    let mqttSent = false;
    try {
      mqttSent = await publishCaptureTrigger(poulaillerId, requestId);
    } catch (err) {
      console.error(`[AI] MQTT échoué: ${err.message}`);
    }

    // ✅ RETOUR IMMÉDIAT — pas d'attente bloquante
    res.status(200).json({
      success: true,
      data: {
        requestId,
        mqttSent,
        message: mqttSent
          ? "Capture déclenchée. Polling requis pour le résultat."
          : "MQTT indisponible. Utilisez le mode manuel (upload direct).",
        pollUrl: `/api/ai/capture-status/${requestId}`,
      },
    });
  } catch (err) {
    console.error("[AI] Erreur triggerCapture:", err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    analysisLocks.delete(poulaillerId);
  }
}

// ============================================================================
// ROUTE 2 : GET /api/ai/capture-status/:requestId
// Polling — retourne l'état actuel de la capture
// ============================================================================
async function getCaptureStatus(req, res) {
  const { requestId } = req.params;

  const capture = pendingCaptures.get(requestId);
  if (!capture) {
    return res.status(404).json({
      success: false,
      error: "Capture introuvable ou expirée",
    });
  }

  // Si terminée, on nettoie et retourne le résultat
  if (capture.status === "completed") {
    const result = {
      success: true,
      data: {
        status: "completed",
        imageUrl: capture.result?.imageUrl,
        thumbnailUrl: capture.result?.thumbnailUrl,
        analysis: capture.result?.analysis,
      },
    };
    // Garde en mémoire encore 30s pour éviter race condition
    setTimeout(() => pendingCaptures.delete(requestId), 30000);
    return res.json(result);
  }

  if (capture.status === "failed") {
    pendingCaptures.delete(requestId);
    return res.status(500).json({
      success: false,
      error: capture.error || "Capture échouée",
    });
  }

  // Toujours en cours
  res.json({
    success: true,
    data: {
      status: capture.status, // "pending" | "capturing" | "uploading" | "analyzing"
      message: "Capture en cours...",
    },
  });
}

// ============================================================================
// ROUTE 3 : POST /api/ai/receive-image
// L'ESP32 appelle cette route pour envoyer l'image
// ============================================================================
async function receiveImageFromESP(req, res) {
  try {
    const { deviceId, requestId, image } = req.body;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: "deviceId requis" });
    }
    if (!image) {
      return res.status(400).json({ success: false, error: "image requise" });
    }

    // Normalise et trouve la caméra
    const normalizedMac = Camera.normalizeMac(deviceId);
    if (!normalizedMac) {
      return res.status(400).json({
        success: false,
        error: "deviceId/MAC invalide",
      });
    }

    const camera = await Camera.findOne({ macAddress: normalizedMac });
    if (!camera || !camera.poulailler) {
      return res.status(404).json({
        success: false,
        error: "Caméra non enregistrée ou non associée",
      });
    }

    const poulaillerId = camera.poulailler.toString();

    // Vérifie taille image
    const cleanBase64 = image.includes(",") ? image.split(",")[1] : image;
    const base64Length = cleanBase64.length;
    const padding = (cleanBase64.match(/=/g) || []).length;
    const imageSizeKb = Math.round(((base64Length * 3) / 4 - padding) / 1024);

    if (imageSizeKb < 3) {
      return res.status(400).json({
        success: false,
        error: `Image trop petite (${imageSizeKb} Ko)`,
      });
    }

    console.log(
      `[AI] Image reçue — poulailler ${poulaillerId} (${imageSizeKb} Ko)`,
    );

    // Met à jour le pending si requestId fourni
    if (requestId && pendingCaptures.has(requestId)) {
      const capture = pendingCaptures.get(requestId);
      capture.status = "uploading";
      capture.image = cleanBase64;

      // Lance l'analyse en arrière-plan
      processImageAsync(requestId, poulaillerId, cleanBase64, camera);
    }

    // Répond immédiatement à l'ESP32
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] Erreur receiveImageFromESP:", err.message);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ============================================================================
// TRAITEMENT ASYNCHRONE DE L'IMAGE
// ============================================================================
async function processImageAsync(requestId, poulaillerId, imageBase64, camera) {
  try {
    const capture = pendingCaptures.get(requestId);
    if (!capture) return;

    capture.status = "analyzing";
    console.log(`[AI] Analyse en cours — requestId: ${requestId}`);

    // Récupère les données capteurs
    const poulailler = await Poulailler.findById(poulaillerId);
    const sensorData = {
      temperature: poulailler?.lastMonitoring?.temperature ?? null,
      humidity: poulailler?.lastMonitoring?.humidity ?? null,
      airQualityPercent: poulailler?.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler?.lastMonitoring?.waterLevel ?? null,
      animalCount: poulailler?.animalCount,
      surface: poulailler?.surface,
    };

    // Analyse IA
    const aiResult = await analyzeWithCloudflareAI(
      imageBase64,
      sensorData,
      poulailler?.thresholds,
    );

    // Upload Cloudinary
    console.log("[AI] Upload Cloudinary...");
    const cloudImage = await cloudinary.uploadImage(imageBase64, poulaillerId);

    // Sauvegarde
    const analysis = await AiAnalysis.create({
      poulaillerId,
      triggeredBy: "esp32-auto",
      sensors: sensorData,
      result: aiResult,
      imageQuality: aiResult.imageQuality,
      image: {
        url: cloudImage.url,
        thumbnailUrl: cloudImage.thumbnailUrl,
        publicId: cloudImage.publicId,
        width: cloudImage.width,
        height: cloudImage.height,
        bytes: cloudImage.bytes,
      },
    });

    // Met à jour le résultat
    capture.status = "completed";
    capture.result = {
      imageUrl: cloudImage.url,
      thumbnailUrl: cloudImage.thumbnailUrl,
      analysis: {
        _id: analysis._id,
        healthScore: aiResult.healthScore,
        urgencyLevel: aiResult.urgencyLevel,
        diagnostic: aiResult.diagnostic,
        detections: aiResult.detections,
        advices: aiResult.advices,
      },
    };

    console.log(
      `[AI] ✅ Analyse complète — requestId: ${requestId} | Score: ${aiResult.healthScore}`,
    );

    // Alertes si critique
    if (
      aiResult.urgencyLevel === "critique" ||
      aiResult.detections?.mortalityDetected
    ) {
      await Alert.create({
        poulailler: poulaillerId,
        type: "ai",
        severity: "danger",
        message: aiResult.diagnostic,
        icon: "alert-circle",
      });
    }
  } catch (err) {
    console.error(`[AI] Erreur traitement image ${requestId}:`, err.message);
    const capture = pendingCaptures.get(requestId);
    if (capture) {
      capture.status = "failed";
      capture.error = err.message;
    }
  }
}

// ============================================================================
// ROUTE 4 : POST /api/ai/capture/:id (ancienne — garde compatibilité)
// ============================================================================
async function analyzePoultry(req, res) {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res.status(429).json({
      success: false,
      error: "Une analyse est déjà en cours",
    });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  // Image fournie directement (mode manuel)
  if (req.body?.imageBase64) {
    analysisLocks.add(poulaillerId);
    try {
      const requestId = `manual-${Date.now()}`;
      pendingCaptures.set(requestId, {
        poulaillerId,
        status: "analyzing",
        createdAt: Date.now(),
        image: req.body.imageBase64,
      });

      const camera = await Camera.findOne({ poulailler: poulaillerId });
      await processImageAsync(
        requestId,
        poulaillerId,
        req.body.imageBase64,
        camera,
      );

      const capture = pendingCaptures.get(requestId);
      if (capture?.status === "completed") {
        return res.json({
          success: true,
          data: capture.result,
        });
      }
    } finally {
      analysisLocks.delete(poulaillerId);
    }
  }

  // Sinon, redirige vers le nouveau flux asynchrone
  return triggerCapture(req, res);
}

// ============================================================================
// ROUTES HISTORIQUE / CHAT (inchangées)
// ============================================================================
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

    return res.json({ success: true, count: analyses.length, data: analyses });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
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
      return res.json({ success: true, data: null, message: "Aucune analyse" });
    }

    return res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
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
      return res.json({ success: true, data: null, message: "Aucune donnée" });
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

    return res.json({
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
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function chatWithVet(req, res) {
  const { question, poulaillerId, history = [] } = req.body;
  if (!question?.trim() || !poulaillerId) {
    return res
      .status(400)
      .json({ success: false, error: "Question et poulaillerId requis" });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const lastAnalysis = await AiAnalysis.findOne({ poulaillerId })
      .sort({ createdAt: -1 })
      .select("result sensors createdAt");

    const context = {
      poulaillerName: poulailler.name,
      animalCount: poulailler.animalCount,
      temperature: poulailler.lastMonitoring?.temperature ?? null,
      humidity: poulailler.lastMonitoring?.humidity ?? null,
      airQuality: poulailler.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler.lastMonitoring?.waterLevel ?? null,
      lastScore: lastAnalysis?.result?.healthScore ?? null,
      lastUrgency: lastAnalysis?.result?.urgencyLevel ?? null,
      lastDiagnostic: lastAnalysis?.result?.diagnostic ?? null,
      lastAdvices: lastAnalysis?.result?.advices?.join(". ") ?? null,
      lastAnalysisDate: lastAnalysis?.createdAt ?? null,
    };

    const answer = await chatWithGemma(question, context, history);

    await ChatHistory.findOneAndUpdate(
      { poulaillerId, userId: req.user.id },
      {
        $push: {
          messages: {
            $each: [
              { role: "user", content: question },
              { role: "assistant", content: answer },
            ],
          },
        },
      },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      data: {
        answer,
        context: {
          lastHealthScore: context.lastScore,
          lastUrgency: context.lastUrgency,
          lastAnalysisDate: context.lastAnalysisDate,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function getChatHistory(req, res) {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const history = await ChatHistory.findOne({
      poulaillerId: req.params.poulaillerId,
      userId: req.user.id,
    });
    return res.json({ success: true, data: history?.messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function clearChatHistory(req, res) {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    await ChatHistory.findOneAndDelete({
      poulaillerId: req.params.poulaillerId,
      userId: req.user.id,
    });
    return res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  triggerCapture, // ✅ NOUVEAU
  getCaptureStatus, // ✅ NOUVEAU
  receiveImageFromESP, // ✅ CORRIGÉ (asynchrone)
  analyzePoultry, // Garde compatibilité
  getAnalysisHistory,
  getLatestAnalysis,
  getAnalysisStats,
  chatWithVet,
  getChatHistory,
  clearChatHistory,
  pendingCaptures, // Export pour debug
};
