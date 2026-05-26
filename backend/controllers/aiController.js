// controllers/aiController.js
// Smart Poultry — Contrôleur IA
// Routes : capture, analyse, historique, chat vétérinaire

"use strict";

const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const Camera = require("../models/Camera");
const AiAnalysis = require("../models/AiAnalysis");
const ChatHistory = require("../models/ChatHistory");
const Alert = require("../models/Alert");
const CaptureRequest = require("../models/Capturerequest");
const cloudinary = require("../services/cloudinaryService");

const {
  analyzeWithCloudflareAI,
  chatWithGemma,
  extractFreshSensors,
} = require("../services/aiService");

const { publishCameraCommand } = require("../services/mqttService");

// ─── Locks d'analyse (évite double analyse simultanée) ───────────────────────
const analysisLocks = new Set();

// ════════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════════

async function checkAccess(poulaillerId, userId) {
  if (!mongoose.isValidObjectId(poulaillerId))
    return { error: "ID poulailler invalide", status: 400 };

  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };

  return { poulailler };
}

async function verifyCameraLinked(poulaillerId) {
  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: "associated",
    macAddress: { $exists: true, $ne: null },
  });
  if (!camera) throw new Error("Aucune caméra associée à ce poulailler");
  return camera;
}

function releaseLock(poulaillerId) {
  analysisLocks.delete(poulaillerId);
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE 1 — POST /api/ai/capture/:poulaillerId
// Déclenche une capture via MQTT → ESP32-CAM
// ════════════════════════════════════════════════════════════════════════════════

async function triggerCapture(req, res) {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res.status(429).json({
      success: false,
      error: "Une analyse est déjà en cours pour ce poulailler",
    });
  }

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  let camera;
  try {
    camera = await verifyCameraLinked(poulaillerId);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  const requestId = `cap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    await CaptureRequest.create({ requestId, poulaillerId, status: "pending" });

    let mqttSent = false;
    try {
      mqttSent = await publishCameraCommand(poulaillerId, requestId);
    } catch (err) {
      console.error(`[AI] MQTT échoué : ${err.message}`);
    }

    // Timeout ESP32 : 90 secondes
    setTimeout(async () => {
      try {
        const doc = await CaptureRequest.findOne({ requestId });
        if (doc?.status === "pending") {
          await CaptureRequest.findOneAndUpdate(
            { requestId },
            {
              status: "failed",
              error: "ESP32-CAM n'a pas répondu dans les délais (90s)",
            },
          );
          releaseLock(poulaillerId);
        }
      } catch (e) {
        console.error("[AI] Timeout handler :", e.message);
        releaseLock(poulaillerId);
      }
    }, 90_000);

    return res.status(200).json({
      success: true,
      data: {
        requestId,
        mqttSent,
        cameraMac: camera.macAddress,
        message: mqttSent
          ? "Capture déclenchée — utilisez pollUrl pour suivre l'avancement."
          : "MQTT indisponible — vérifiez la connexion au broker.",
        pollUrl: `/api/ai/capture-status/${requestId}`,
      },
    });
  } catch (err) {
    console.error("[AI] triggerCapture :", err.message);
    releaseLock(poulaillerId);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE 2 — GET /api/ai/capture-status/:requestId
// Polling du résultat de capture
// ════════════════════════════════════════════════════════════════════════════════

async function getCaptureStatus(req, res) {
  const { requestId } = req.params;
  const capture = await CaptureRequest.findOne({ requestId });

  if (!capture) {
    return res
      .status(404)
      .json({ success: false, error: "Capture introuvable ou expirée" });
  }

  if (capture.status === "completed") {
    // Suppression différée (30s) — laisse le temps au client de récupérer
    setTimeout(
      () => CaptureRequest.deleteOne({ requestId }).catch(() => {}),
      30_000,
    );

    return res.json({
      success: true,
      data: {
        status: "completed",
        imageUrl: capture.result?.imageUrl,
        thumbnailUrl: capture.result?.thumbnailUrl,
        analysis: capture.result?.analysis,
        imageQuality: capture.result?.imageQuality,
        sensors: capture.result?.analysis?.sensors,
      },
    });
  }

  if (capture.status === "failed") {
    await CaptureRequest.deleteOne({ requestId }).catch(() => {});
    return res
      .status(500)
      .json({ success: false, error: capture.error || "Capture échouée" });
  }

  return res.json({
    success: true,
    data: { status: capture.status, message: "Analyse en cours..." },
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE 3 — POST /api/ai/receive-image
// Réception de l'image depuis l'ESP32-CAM
// ════════════════════════════════════════════════════════════════════════════════

async function receiveImageFromESP(req, res) {
  try {
    const {
      deviceId,
      requestId,
      image,
      poulaillerId: directId,
      imageBase64,
      isTestImage,
    } = req.body;
    const rawImage = image || imageBase64;

    if (!rawImage)
      return res
        .status(400)
        .json({ success: false, error: "Champ image requis" });

    let poulaillerId;
    let camera = null;

    // ── Résolution du poulailler ─────────────────────────────────────────────
    if (directId && !deviceId) {
      if (!mongoose.isValidObjectId(directId))
        return res
          .status(400)
          .json({ success: false, error: "poulaillerId invalide" });
      poulaillerId = directId;
      camera = (await Camera.findOne({ poulailler: poulaillerId })) || null;
    } else {
      if (!deviceId)
        return res
          .status(400)
          .json({ success: false, error: "deviceId ou poulaillerId requis" });

      const normalizedMac = Camera.normalizeMac(deviceId);
      if (!normalizedMac)
        return res
          .status(400)
          .json({ success: false, error: "Format MAC invalide" });

      camera = await Camera.findOne({ macAddress: normalizedMac });
      if (!camera?.poulailler)
        return res
          .status(404)
          .json({ success: false, error: "Caméra non enregistrée" });

      poulaillerId = camera.poulailler.toString();
      await Camera.findByIdAndUpdate(camera._id, {
        lastPing: new Date(),
        status: "associated",
      });
    }

    // ── Validation taille image ──────────────────────────────────────────────
    const cleanB64 = rawImage.includes(",") ? rawImage.split(",")[1] : rawImage;
    const kb = Math.round(
      ((cleanB64.length * 3) / 4 - (cleanB64.match(/=/g) || []).length) / 1024,
    );

    if (kb < 3)
      return res
        .status(400)
        .json({ success: false, error: `Image trop petite (${kb} Ko)` });

    if (camera?._id)
      await Camera.findByIdAndUpdate(camera._id, {
        lastPing: new Date(),
        status: "associated",
      });

    // ── Lancement analyse asynchrone ─────────────────────────────────────────
    const finalRequestId = requestId || `auto-${Date.now()}`;

    const existingCapture = requestId
      ? await CaptureRequest.findOne({ requestId })
      : null;

    if (!existingCapture) {
      await CaptureRequest.create({
        requestId: finalRequestId,
        poulaillerId,
        status: "uploading",
      });
    } else {
      await CaptureRequest.findOneAndUpdate(
        { requestId },
        { status: "uploading" },
      );
    }

    if (!analysisLocks.has(poulaillerId)) analysisLocks.add(poulaillerId);

    // Fire-and-forget — réponse immédiate à l'ESP32
    processImageAsync(
      finalRequestId,
      poulaillerId,
      cleanB64,
      camera,
      !!isTestImage,
    ).catch((err) => {
      console.error(`[AI] processImageAsync non-catchée : ${err.message}`);
      releaseLock(poulaillerId);
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] receiveImageFromESP :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// TRAITEMENT ASYNCHRONE DE L'IMAGE
// ════════════════════════════════════════════════════════════════════════════════

async function processImageAsync(
  requestId,
  poulaillerId,
  imageBase64,
  camera,
  isTestImage = false,
) {
  try {
    await CaptureRequest.findOneAndUpdate(
      { requestId },
      { status: "analyzing" },
    );

    const poulailler = await Poulailler.findById(poulaillerId);
    const sensorData = extractFreshSensors(poulailler);

    console.log("[AI] Capteurs utilisés :", JSON.stringify(sensorData));

    // ── Analyse IA + Upload Cloudinary en parallèle ──────────────────────────
    const [aiResult, cloudImage] = await Promise.all([
      analyzeWithCloudflareAI(
        imageBase64,
        sensorData,
        poulailler?.thresholds,
        undefined,
        true,
      ),
      cloudinary.uploadImage(imageBase64, poulaillerId),
    ]);

    // ── Sauvegarde analyse ───────────────────────────────────────────────────
    const analysis = await AiAnalysis.create({
      poultryId: new mongoose.Types.ObjectId(poulaillerId),
      triggeredBy: "esp32-auto",
      sensors: sensorData,
      result: {
        healthScore: aiResult.healthScore ?? null,
        urgencyLevel: ["normal", "attention", "critique", "inconnu"].includes(
          aiResult.urgencyLevel,
        )
          ? aiResult.urgencyLevel
          : "inconnu",
        confidence: aiResult.confidence ?? null,
        diagnostic: aiResult.diagnostic ?? "",
        stade_croissance: aiResult.stade_croissance ?? "indéterminé",
        comptage: aiResult.comptage ?? { estimation: null, fiabilite: null },
        maladie_suspectee: aiResult.maladie_suspectee ?? { suspicion: false },
        detections: aiResult.detections ?? {},
        advices: Array.isArray(aiResult.advices) ? aiResult.advices : [],
        sensors: sensorData,
        imageAvailable: aiResult.imageAvailable ?? false,
        imageUsable: aiResult.imageUsable ?? false,
      },
      imageQuality: aiResult.imageQuality ?? { status: "poor" },
      image: {
        url: cloudImage?.url ?? null,
        thumbnailUrl: cloudImage?.thumbnailUrl ?? null,
        publicId: cloudImage?.publicId ?? null,
      },
      cameraMac: camera?.macAddress ?? null,
    });

    // ── Mise à jour CaptureRequest ────────────────────────────────────────────
    await CaptureRequest.findOneAndUpdate(
      { requestId },
      {
        status: "completed",
        result: {
          imageUrl: cloudImage?.url,
          thumbnailUrl: cloudImage?.thumbnailUrl,
          imageQuality: aiResult.imageQuality,
          analysis: {
            _id: analysis._id,
            healthScore: aiResult.healthScore,
            urgencyLevel: aiResult.urgencyLevel,
            diagnostic: aiResult.diagnostic,
            // En mode TEST galerie: bypass total du statut floue.
            // Important: le front se base aussi sur imageAvailable/imageUsable.
            imageQuality: isTestImage ? { status: "ok" } : undefined,
            imageAvailable: isTestImage ? true : undefined,
            imageUsable: isTestImage ? true : undefined,
            stade_croissance: aiResult.stade_croissance,
            comptage: aiResult.comptage,
            maladie_suspectee: aiResult.maladie_suspectee,
            detections: aiResult.detections,
            advices: aiResult.advices,
            sensors: sensorData,
            imageAvailable: aiResult.imageAvailable,
            imageUsable: aiResult.imageUsable,
          },
        },
      },
    );

    // ── Alerte si critique ou mortalité ──────────────────────────────────────
    if (
      aiResult.urgencyLevel === "critique" ||
      aiResult.detections?.mortalityDetected === true ||
      aiResult.maladie_suspectee?.urgence_veterinaire === true
    ) {
      const severity = aiResult.detections?.mortalityDetected
        ? "danger"
        : "warning";
      const message = aiResult.maladie_suspectee?.suspicion
        ? `Maladie suspectée : ${aiResult.maladie_suspectee.maladie_probable}. ${aiResult.diagnostic}`
        : aiResult.diagnostic || "Alerte IA déclenchée";

      await Alert.create({
        poulailler: poulaillerId,
        type: "sensor",
        key: "ai-analysis",
        severity,
        message,
        icon: "alert-circle",
      });
    }

    console.log(
      `[AI] ✓ Analyse terminée — score: ${aiResult.healthScore}, urgence: ${aiResult.urgencyLevel}`,
    );
  } catch (err) {
    console.error(`[AI] processImageAsync ${requestId} :`, err.message);
    await CaptureRequest.findOneAndUpdate(
      { requestId },
      { status: "failed", error: err.message },
    ).catch(() => {});
  } finally {
    releaseLock(poulaillerId);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// ROUTE 4 — POST /api/ai/analyze/:poulaillerId
// Analyse manuelle (upload direct d'image ou déclenchement capture)
// ════════════════════════════════════════════════════════════════════════════════

async function analyzePoultry(req, res) {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res
      .status(429)
      .json({ success: false, error: "Une analyse est déjà en cours" });
  }

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  // ── Upload manuel d'une image ────────────────────────────────────────────
  if (req.body?.imageBase64) {
    analysisLocks.add(poulaillerId);

    const requestId = `manual-${Date.now()}`;

    try {
      await CaptureRequest.create({
        requestId,
        poulaillerId,
        status: "analyzing",
      });
      const camera = await Camera.findOne({ poulailler: poulaillerId });
      await processImageAsync(
        requestId,
        poulaillerId,
        req.body.imageBase64,
        camera,
      );

      const capture = await CaptureRequest.findOne({ requestId });
      if (capture?.status === "completed") {
        return res.json({ success: true, data: capture.result });
      }
      return res
        .status(500)
        .json({ success: false, error: capture?.error || "Erreur inconnue" });
    } catch (err) {
      releaseLock(poulaillerId);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── Pas d'image → déclenche capture MQTT ────────────────────────────────
  return triggerCapture(req, res);
}

// ════════════════════════════════════════════════════════════════════════════════
// HISTORIQUE & STATS
// ════════════════════════════════════════════════════════════════════════════════

async function getAnalysisHistory(req, res) {
  const { error, status } = await checkAccess(
    req.params.poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const analyses = await AiAnalysis.find({
      poultryId: req.params.poulaillerId,
    })
      .sort({ createdAt: -1 })
      .limit(10);
    return res.json({ success: true, count: analyses.length, data: analyses });
  } catch (err) {
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
      poultryId: req.params.poulaillerId,
    }).sort({ createdAt: -1 });
    if (!analysis)
      return res.json({
        success: true,
        data: null,
        message: "Aucune analyse disponible",
      });
    return res.json({ success: true, data: analysis });
  } catch (err) {
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
      poultryId: req.params.poulaillerId,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select(
        "result.healthScore result.urgencyLevel result.maladie_suspectee result.stade_croissance result.comptage createdAt",
      );

    if (analyses.length === 0)
      return res.json({ success: true, data: null, message: "Aucune donnée" });

    const scores = analyses
      .map((a) => a.result.healthScore)
      .filter((s) => s !== null && s !== undefined);

    if (scores.length === 0)
      return res.json({
        success: true,
        data: null,
        message: "Aucun score disponible",
      });

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

    // Maladies détectées sur les 10 dernières analyses
    const maladiesDetectees = analyses
      .filter((a) => a.result.maladie_suspectee?.suspicion === true)
      .map((a) => ({
        maladie: a.result.maladie_suspectee.maladie_probable,
        confiance: a.result.maladie_suspectee.confiance,
        date: a.createdAt,
      }));

    return res.json({
      success: true,
      data: {
        totalAnalyses: analyses.length,
        avgHealthScore: avgScore,
        lastScore: scores[0],
        trend,
        urgencyDistribution,
        maladiesDetectees,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// CHAT VÉTÉRINAIRE
// ════════════════════════════════════════════════════════════════════════════════

async function chatWithVet(req, res) {
  const { question, poulaillerId } = req.body;

  if (!question?.trim() || !poulaillerId) {
    return res
      .status(400)
      .json({ success: false, error: "question et poulaillerId requis" });
  }

  const { error, status, poulailler } = await checkAccess(
    poulaillerId,
    req.user.id,
  );
  if (error) return res.status(status).json({ success: false, error });

  try {
    const chatDoc = await ChatHistory.findOne({
      poulaillerId,
      userId: req.user.id,
    });
    const history = chatDoc?.messages?.slice(-6) || [];

    const lastAnalysis = await AiAnalysis.findOne({ poultryId: poulaillerId })
      .sort({ createdAt: -1 })
      .select("result sensors createdAt");

    const freshSensors = extractFreshSensors(poulailler);

    const context = {
      poulaillerName: poulailler.name,
      animalCount: poulailler.animalCount,
      temperature: freshSensors.temperature,
      humidity: freshSensors.humidity,
      airQuality: freshSensors.airQualityPercent,
      waterLevel: freshSensors.waterLevel,
      lastScore: lastAnalysis?.result?.healthScore ?? null,
      lastUrgency: lastAnalysis?.result?.urgencyLevel ?? null,
      lastDiagnostic: lastAnalysis?.result?.diagnostic ?? null,
      lastAdvices: lastAnalysis?.result?.advices?.join(". ") ?? null,
      lastDisease:
        lastAnalysis?.result?.maladie_suspectee?.maladie_probable ?? null,
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
          lastDisease: context.lastDisease,
          lastAnalysisDate: context.lastAnalysisDate,
        },
      },
    });
  } catch (err) {
    console.error("[AI] chatWithVet :", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
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
    return res.status(500).json({ success: false, error: "Erreur serveur" });
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
    return res.json({ success: true, message: "Historique effacé" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
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
};
