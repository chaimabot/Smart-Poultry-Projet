// controllers/aiController.js

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
} = require("../services/aiService");
const { publishCameraCommand } = require("../services/mqttService");

// ─── Locks d'analyse (un seul par poulailler à la fois) ─────────────────────
// ✅ FIX : le lock est géré entièrement dans processImageAsync, pas dans triggerCapture,
//          pour couvrir le traitement asynchrone réel.
const analysisLocks = new Set();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

async function verifyCameraLinked(poulaillerId) {
  // ✅ FIX : on exclut "pending" — une caméra pending n'est pas prête à recevoir des commandes MQTT
  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: "associated",
    macAddress: { $exists: true, $ne: null },
  });
  if (!camera) throw new Error("Aucune caméra associée à ce poulailler");
  return camera;
}

// ─── ROUTE 1 : POST /api/ai/capture/:poulaillerId ───────────────────────────

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

  try {
    const camera = await verifyCameraLinked(poulaillerId);
    const requestId = `cap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await CaptureRequest.create({ requestId, poulaillerId, status: "pending" });

    let mqttSent = false;
    try {
      mqttSent = await publishCameraCommand(poulaillerId, requestId);
    } catch (err) {
      console.error(`[AI] MQTT échoué: ${err.message}`);
    }

    // Timeout de 90s : marque la requête comme échouée si l'ESP32 ne répond pas
    // (Le lock n'est PAS libéré ici — il sera libéré dans processImageAsync)
    setTimeout(async () => {
      try {
        const doc = await CaptureRequest.findOne({ requestId });
        if (doc && doc.status === "pending") {
          await CaptureRequest.findOneAndUpdate(
            { requestId },
            {
              status: "failed",
              error: "L'ESP32-CAM n'a pas répondu dans les délais (90s).",
            },
          );
          // Si la capture a expiré sans que processImageAsync soit jamais appelé, on libère le lock
          analysisLocks.delete(poulaillerId);
        }
      } catch (e) {
        console.error("[AI] Erreur timeout handler:", e.message);
        analysisLocks.delete(poulaillerId);
      }
    }, 90000);

    return res.status(200).json({
      success: true,
      data: {
        requestId,
        mqttSent,
        cameraMac: camera.macAddress,
        message: mqttSent
          ? "Capture déclenchée. Polling requis pour le résultat."
          : "MQTT indisponible — vérifiez la connexion au broker.",
        pollUrl: `/api/ai/capture-status/${requestId}`,
      },
    });
  } catch (err) {
    console.error("[AI] Erreur triggerCapture:", err.message);
    analysisLocks.delete(poulaillerId);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ─── ROUTE 2 : GET /api/ai/capture-status/:requestId ────────────────────────

async function getCaptureStatus(req, res) {
  const { requestId } = req.params;
  const capture = await CaptureRequest.findOne({ requestId });

  if (!capture) {
    return res
      .status(404)
      .json({ success: false, error: "Capture introuvable ou expirée" });
  }

  if (capture.status === "completed") {
    // Nettoyage différé (le client a 30s pour relire si besoin)
    setTimeout(async () => {
      await CaptureRequest.deleteOne({ requestId }).catch(() => {});
    }, 30000);

    return res.json({
      success: true,
      data: {
        status: "completed",
        imageUrl: capture.result?.imageUrl,
        thumbnailUrl: capture.result?.thumbnailUrl,
        analysis: capture.result?.analysis,
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
    data: { status: capture.status, message: "Capture en cours..." },
  });
}

// ─── ROUTE 3 : POST /api/ai/receive-image ────────────────────────────────────

async function receiveImageFromESP(req, res) {
  try {
    const {
      deviceId,
      requestId,
      image,
      poulaillerId: directPoulaillerId,
      imageBase64,
    } = req.body;

    const rawImage = image || imageBase64;
    if (!rawImage)
      return res.status(400).json({ success: false, error: "image requise" });

    let poulaillerId;
    let camera = null;

    if (directPoulaillerId && !deviceId) {
      // Mode mobile : poulaillerId fourni directement
      if (!mongoose.isValidObjectId(directPoulaillerId))
        return res
          .status(400)
          .json({ success: false, error: "poulaillerId invalide" });
      poulaillerId = directPoulaillerId;
      camera = (await Camera.findOne({ poulailler: poulaillerId })) || null;
    } else {
      // Mode ESP32 : résolution via adresse MAC
      if (!deviceId)
        return res
          .status(400)
          .json({ success: false, error: "deviceId ou poulaillerId requis" });

      const normalizedMac = Camera.normalizeMac(deviceId);
      if (!normalizedMac)
        return res
          .status(400)
          .json({ success: false, error: "deviceId/MAC invalide" });

      camera = await Camera.findOne({ macAddress: normalizedMac });
      if (!camera || !camera.poulailler)
        return res
          .status(404)
          .json({ success: false, error: "Caméra non enregistrée" });

      poulaillerId = camera.poulailler.toString();

      await Camera.findByIdAndUpdate(camera._id, {
        lastPing: new Date(),
        status: "associated",
      });
    }

    const cleanB64 = rawImage.includes(",") ? rawImage.split(",")[1] : rawImage;
    const b64Length = cleanB64.length;
    const padding = (cleanB64.match(/=/g) || []).length;
    const imageSizeKb = Math.round(((b64Length * 3) / 4 - padding) / 1024);

    if (imageSizeKb < 3) {
      return res
        .status(400)
        .json({
          success: false,
          error: `Image trop petite (${imageSizeKb} Ko)`,
        });
    }

    if (camera?._id) {
      await Camera.findByIdAndUpdate(camera._id, {
        lastPing: new Date(),
        status: "associated",
      });
    }

    // ✅ FIX : le lock est posé ici, avant processImageAsync, et sera libéré dans son finally
    if (requestId) {
      const captureDoc = await CaptureRequest.findOne({ requestId });
      if (captureDoc) {
        await CaptureRequest.findOneAndUpdate(
          { requestId },
          { status: "uploading" },
        );
        // Lock posé uniquement si pas déjà actif
        if (!analysisLocks.has(poulaillerId)) {
          analysisLocks.add(poulaillerId);
        }
        processImageAsync(requestId, poulaillerId, cleanB64, camera);
      } else {
        const orphanId = `orphan-${Date.now()}`;
        await CaptureRequest.create({
          requestId: orphanId,
          poulaillerId,
          status: "uploading",
        });
        if (!analysisLocks.has(poulaillerId)) {
          analysisLocks.add(poulaillerId);
        }
        processImageAsync(orphanId, poulaillerId, cleanB64, camera);
      }
    } else {
      const autoId = `auto-${Date.now()}`;
      await CaptureRequest.create({
        requestId: autoId,
        poulaillerId,
        status: "uploading",
      });
      if (!analysisLocks.has(poulaillerId)) {
        analysisLocks.add(poulaillerId);
      }
      processImageAsync(autoId, poulaillerId, cleanB64, camera);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] Erreur receiveImageFromESP:", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ─── Traitement asynchrone de l'image ─────────────────────────────────────
// ✅ FIX : le lock est libéré dans le finally de cette fonction, qui représente
//          le vrai fin du traitement (pas dans triggerCapture qui retourne immédiatement).

async function processImageAsync(requestId, poulaillerId, imageBase64, camera) {
  try {
    if (!poulaillerId || !mongoose.isValidObjectId(poulaillerId)) {
      throw new Error(`poulaillerId invalide: ${poulaillerId}`);
    }

    await CaptureRequest.findOneAndUpdate(
      { requestId },
      { status: "analyzing" },
    );

    const poulailler = await Poulailler.findById(poulaillerId);
    const sensorData = {
      temperature: poulailler?.lastMonitoring?.temperature ?? null,
      humidity: poulailler?.lastMonitoring?.humidity ?? null,
      airQualityPercent: poulailler?.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler?.lastMonitoring?.waterLevel ?? null,
      animalCount: poulailler?.animalCount,
      surface: poulailler?.surface,
    };

    // ✅ FIX : AI + Cloudinary en parallèle — gain de ~2-3s par analyse
    const [aiResult, cloudImage] = await Promise.all([
      analyzeWithCloudflareAI(imageBase64, sensorData, poulailler?.thresholds),
      cloudinary.uploadImage(imageBase64, poulaillerId),
    ]);

    const analysisPayload = {
      poultryId: new mongoose.Types.ObjectId(poulaillerId),
      triggeredBy: "esp32-auto",
      captureRequestId: mongoose.isValidObjectId(requestId)
        ? new mongoose.Types.ObjectId(requestId)
        : null,
      sensors: sensorData,
      result: {
        healthScore: aiResult?.healthScore ?? null,
        urgencyLevel: ["normal", "attention", "critique"].includes(
          aiResult?.urgencyLevel,
        )
          ? aiResult.urgencyLevel
          : "normal",
        confidence: aiResult?.confidence ?? null,
        diagnostic: aiResult?.diagnostic ?? "",
        detections: {
          behaviorNormal: aiResult?.detections?.behaviorNormal ?? true,
          mortalityDetected: aiResult?.detections?.mortalityDetected ?? false,
          densityOk: aiResult?.detections?.densityOk ?? true,
          cleanEnvironment: aiResult?.detections?.cleanEnvironment ?? true,
          ventilationAdequate:
            aiResult?.detections?.ventilationAdequate ?? true,
        },
        advices: Array.isArray(aiResult?.advices) ? aiResult.advices : [],
        sensors: sensorData,
      },
      imageQuality: aiResult?.imageQuality?.status
        ? {
            status: ["pending", "processing", "optimized", "failed"].includes(
              aiResult.imageQuality.status,
            )
              ? aiResult.imageQuality.status
              : "pending",
            score: aiResult.imageQuality.score ?? null,
            width: aiResult.imageQuality.width ?? null,
            height: aiResult.imageQuality.height ?? null,
            format: aiResult.imageQuality.format ?? null,
            sizeBytes: aiResult.imageQuality.sizeBytes ?? null,
          }
        : { status: "pending" },
      image: {
        url: cloudImage?.url ?? null,
        thumbnailUrl: cloudImage?.thumbnailUrl ?? null,
        publicId: cloudImage?.publicId ?? null,
      },
      cameraMac: camera?.macAddress ?? null,
    };

    const analysis = await AiAnalysis.create(analysisPayload);

    await CaptureRequest.findOneAndUpdate(
      { requestId },
      {
        status: "completed",
        result: {
          imageUrl: cloudImage?.url,
          thumbnailUrl: cloudImage?.thumbnailUrl,
          analysis: {
            _id: analysis._id,
            healthScore: aiResult?.healthScore,
            urgencyLevel: aiResult?.urgencyLevel,
            diagnostic: aiResult?.diagnostic,
            detections: aiResult?.detections,
            advices: aiResult?.advices,
          },
        },
      },
    );

    if (
      aiResult?.urgencyLevel === "critique" ||
      aiResult?.detections?.mortalityDetected
    ) {
      await Alert.create({
        poulailler: poulaillerId,
        type: "sensor",
        key: "ai-analysis",
        severity: "danger",
        message: aiResult?.diagnostic || "Alerte IA déclenchée",
        icon: "alert-circle",
      });
    }
  } catch (err) {
    console.error(`[AI] Erreur traitement image ${requestId}:`, err.message);
    await CaptureRequest.findOneAndUpdate(
      { requestId },
      { status: "failed", error: err.message },
    ).catch(() => {});
  } finally {
    // ✅ FIX : libération du lock ici, à la vraie fin du traitement
    analysisLocks.delete(poulaillerId);
  }
}

// ─── ROUTE 4 : POST /api/ai/analyze/:poulaillerId ────────────────────────────

async function analyzePoultry(req, res) {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res
      .status(429)
      .json({ success: false, error: "Une analyse est déjà en cours" });
  }

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  if (req.body?.imageBase64) {
    analysisLocks.add(poulaillerId);
    try {
      const requestId = `manual-${Date.now()}`;
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
      // processImageAsync libère le lock dans son finally

      const capture = await CaptureRequest.findOne({ requestId });
      if (capture?.status === "completed") {
        return res.json({ success: true, data: capture.result });
      }
      return res
        .status(500)
        .json({ success: false, error: capture?.error || "Erreur inconnue" });
    } catch (err) {
      analysisLocks.delete(poulaillerId);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return triggerCapture(req, res);
}

// ─── Historique ───────────────────────────────────────────────────────────────

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
      return res.json({ success: true, data: null, message: "Aucune analyse" });
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
      .select("result.healthScore result.urgencyLevel createdAt");

    if (analyses.length === 0)
      return res.json({ success: true, data: null, message: "Aucune donnée" });

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
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ─── Chat vétérinaire ─────────────────────────────────────────────────────────

async function chatWithVet(req, res) {
  const { question, poulaillerId } = req.body;
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
    // ✅ FIX : on lit l'historique depuis la DB (source de vérité) plutôt que depuis req.body
    //          pour ne pas perdre le contexte si le client redémarre.
    const chatDoc = await ChatHistory.findOne({
      poulaillerId,
      userId: req.user.id,
    });
    const history = chatDoc?.messages?.slice(-6) || [];

    const lastAnalysis = await AiAnalysis.findOne({ poultryId: poulaillerId })
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
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

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
