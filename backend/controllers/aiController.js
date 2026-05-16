// controllers/aiController.js
// CORRIGÉ : poulaillerId cohérent + captureRequestId lié + imageQuality sécurisé

const Poulailler = require("../models/Poulailler");
const Camera = require("../models/Camera");
const AiAnalysis = require("../models/AiAnalysis");
const ChatHistory = require("../models/ChatHistory");
const Alert = require("../models/Alert");
const CaptureRequest = require("../models/CaptureRequest");
const cloudinary = require("../services/cloudinaryService");

const {
  analyzeWithCloudflareAI,
  chatWithGemma,
} = require("../services/aiService");

const { publishCameraCommand } = require("../services/mqttService");

const analysisLocks = new Set();

async function checkAccess(poulaillerId, userId) {
  const poulailler = await Poulailler.findById(poulaillerId);
  if (!poulailler) return { error: "Poulailler non trouvé", status: 404 };
  if (poulailler.owner.toString() !== userId)
    return { error: "Accès non autorisé", status: 403 };
  return { poulailler };
}

async function verifyCameraLinked(poulaillerId) {
  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: { $in: ["associated", "pending"] },
    macAddress: { $exists: true, $ne: null },
  });
  if (!camera) {
    throw new Error("Aucune caméra associée à ce poulailler");
  }
  return camera;
}

// ============================================================================
// ROUTE 1 : POST /api/ai/capture/:poulaillerId
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

    const camera = await verifyCameraLinked(poulaillerId);
    console.log(`[AI] Caméra: ${camera.macAddress} (${camera.status})`);

    const requestId = `cap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await CaptureRequest.create({
      requestId,
      poulaillerId,
      status: "pending",
    });

    let mqttSent = false;
    try {
      console.log(`[AI] Publication MQTT → requestId: ${requestId}`);
      mqttSent = await publishCameraCommand(poulaillerId, requestId);
      console.log(`[AI] MQTT envoyé: ${mqttSent}`);
    } catch (err) {
      console.error(`[AI] MQTT échoué: ${err.message}`);
    }

    setTimeout(async () => {
      try {
        const doc = await CaptureRequest.findOne({ requestId });
        if (doc && doc.status === "pending") {
          console.warn(`[AI] ⏰ Timeout capture ${requestId} — ESP32-CAM muet`);
          await CaptureRequest.findOneAndUpdate(
            { requestId },
            {
              status: "failed",
              error:
                "L'ESP32-CAM n'a pas répondu dans les délais (90s). Vérifiez la connexion MQTT.",
            },
          );
        }
      } catch (e) {
        console.error("[AI] Erreur timeout handler:", e.message);
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
          : "MQTT indisponible — vérifiez la connexion au broker HiveMQ.",
        pollUrl: `/api/ai/capture-status/${requestId}`,
      },
    });
  } catch (err) {
    console.error("[AI] Erreur triggerCapture:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    analysisLocks.delete(poulaillerId);
  }
}

// ============================================================================
// ROUTE 2 : GET /api/ai/capture-status/:requestId
// ============================================================================
async function getCaptureStatus(req, res) {
  const { requestId } = req.params;

  const capture = await CaptureRequest.findOne({ requestId });

  if (!capture) {
    return res.status(404).json({
      success: false,
      error: "Capture introuvable ou expirée",
    });
  }

  if (capture.status === "completed") {
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
    return res.status(500).json({
      success: false,
      error: capture.error || "Capture échouée",
    });
  }

  return res.json({
    success: true,
    data: {
      status: capture.status,
      message: "Capture en cours...",
    },
  });
}

// ============================================================================
// ROUTE 3 : POST /api/ai/receive-image
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

    const normalizedMac = Camera.normalizeMac(deviceId);
    if (!normalizedMac) {
      return res
        .status(400)
        .json({ success: false, error: "deviceId/MAC invalide" });
    }

    const camera = await Camera.findOne({ macAddress: normalizedMac });
    if (!camera || !camera.poulailler) {
      return res.status(404).json({
        success: false,
        error: "Caméra non enregistrée ou non associée",
      });
    }

    const poulaillerId = camera.poulailler.toString();

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
      `[AI] Image reçue — ${poulaillerId} (${imageSizeKb} Ko) | requestId: ${requestId || "sans"}`,
    );

    await Camera.findByIdAndUpdate(camera._id, {
      lastPing: new Date(),
      status: "associated",
    });

    if (requestId) {
      const captureDoc = await CaptureRequest.findOne({ requestId });

      if (captureDoc) {
        await CaptureRequest.findOneAndUpdate(
          { requestId },
          { status: "uploading" },
        );
        processImageAsync(requestId, poulaillerId, cleanBase64, camera);
      } else {
        console.warn(
          `[AI] requestId ${requestId} introuvable — traitement orphelin`,
        );
        const orphanId = `orphan-${Date.now()}`;
        await CaptureRequest.create({
          requestId: orphanId,
          poulaillerId,
          status: "uploading",
        });
        processImageAsync(orphanId, poulaillerId, cleanBase64, camera);
      }
    } else {
      const autoId = `auto-${Date.now()}`;
      await CaptureRequest.create({
        requestId: autoId,
        poulaillerId,
        status: "uploading",
      });
      processImageAsync(autoId, poulaillerId, cleanBase64, camera);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[AI] Erreur receiveImageFromESP:", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

// ============================================================================
// TRAITEMENT ASYNCHRONE — CORRIGÉ
// ============================================================================
async function processImageAsync(requestId, poulaillerId, imageBase64, camera) {
  try {
    // ✅ Vérifie que poulaillerId est valide avant toute création
    if (!poulaillerId || !mongoose.isValidObjectId(poulaillerId)) {
      throw new Error(`poulaillerId invalide: ${poulaillerId}`);
    }

    await CaptureRequest.findOneAndUpdate(
      { requestId },
      { status: "analyzing" },
    );
    console.log(`[AI] Analyse en cours — requestId: ${requestId}`);

    const poulailler = await Poulailler.findById(poulaillerId);
    const sensorData = {
      temperature: poulailler?.lastMonitoring?.temperature ?? null,
      humidity: poulailler?.lastMonitoring?.humidity ?? null,
      airQualityPercent: poulailler?.lastMonitoring?.airQualityPercent ?? null,
      waterLevel: poulailler?.lastMonitoring?.waterLevel ?? null,
      animalCount: poulailler?.animalCount,
      surface: poulailler?.surface,
    };

    const aiResult = await analyzeWithCloudflareAI(
      imageBase64,
      sensorData,
      poulailler?.thresholds,
    );

    console.log("[AI] Upload Cloudinary...");
    const cloudImage = await cloudinary.uploadImage(imageBase64, poulaillerId);

    // ✅ Construction sécurisée de l'analyse
    const analysisPayload = {
      poulaillerId: new mongoose.Types.ObjectId(poulaillerId),
      triggeredBy: "esp32-auto",
      captureRequestId: new mongoose.Types.ObjectId(
        mongoose.isValidObjectId(requestId)
          ? requestId
          : new mongoose.Types.ObjectId(),
      ),
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
      status: "completed",
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

    console.log(
      `[AI] ✅ Analyse complète — requestId: ${requestId} | Score: ${aiResult?.healthScore ?? "?"}`,
    );

    if (
      aiResult?.urgencyLevel === "critique" ||
      aiResult?.detections?.mortalityDetected
    ) {
      await Alert.create({
        poulailler: poulaillerId,
        type: "ai",
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
  }
}

// ============================================================================
// ROUTE 4 : POST /api/ai/capture/:id (ancienne compatibilité)
// ============================================================================
async function analyzePoultry(req, res) {
  const { poulaillerId } = req.params;

  if (analysisLocks.has(poulaillerId)) {
    return res.status(429).json({
      success: false,
      error: "Une analyse est déjà en cours",
    });
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

      const capture = await CaptureRequest.findOne({ requestId });
      if (capture?.status === "completed") {
        return res.json({ success: true, data: capture.result });
      }
      return res
        .status(500)
        .json({ success: false, error: capture?.error || "Erreur inconnue" });
    } finally {
      analysisLocks.delete(poulaillerId);
    }
  }

  return triggerCapture(req, res);
}

// ============================================================================
// HISTORIQUE / CHAT / STATS
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
      return res.json({ success: true, data: null, message: "Aucune analyse" });
    }
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
    return res.status(500).json({ success: false, error: "Erreur serveur" });
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
