// controllers/aiController.js
// CORRIGÉ : Utilise Camera.normalizeMac() + Camera.findOne() au lieu de Poulailler.macAddressCam

const Poulailler = require("../models/Poulailler");
const Camera = require("../models/Camera"); // ✅ AJOUT
const AiAnalysis = require("../models/AiAnalysis");
const ChatHistory = require("../models/ChatHistory");
const Alert = require("../models/Alert");
const cloudinary = require("../services/cloudinaryService");

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
    const deviceId = req.body?.deviceId;
    const image = req.body?.image || req.body?.imageBase64;

    if (!deviceId) {
      return res.status(400).json({ success: false, error: "deviceId requis" });
    }
    if (!image) {
      return res.status(400).json({ success: false, error: "image requise" });
    }

    // ✅ CORRECTION : Normalise la MAC et cherche dans Camera
    const normalizedMac = Camera.normalizeMac(deviceId);
    if (!normalizedMac) {
      return res.status(400).json({
        success: false,
        error: "deviceId/MAC invalide (format attendu : XX:XX:XX:XX:XX:XX)",
      });
    }

    const camera = await Camera.findOne({ macAddress: normalizedMac });
    if (!camera || !camera.poulailler) {
      return res.status(404).json({
        success: false,
        error: "Caméra non enregistrée ou non associée à un poulailler",
      });
    }

    const poulaillerId = camera.poulailler.toString(); // ✅ ID récupéré via Camera

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

// ✅ HELPER : Vérifie qu'une caméra active est associée
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

    let imageBase64 = req.body?.imageBase64;

    if (!imageBase64) {
      // ✅ Vérifie caméra avant de publier MQTT
      await verifyCameraLinked(poulaillerId);

      await publishCaptureTrigger(poulaillerId);
      console.log("[AI] Trigger MQTT envoyé — attente de l'image...");

      const { image } = await waitForImage(poulaillerId, 35000);
      imageBase64 = image;
    }

    console.log("[AI] Image reçue — lancement de l'analyse...");

    const aiResult = await analyzeWithCloudflareAI(
      imageBase64,
      sensorData,
      thresholds,
    );

    console.log("[AI] Upload Cloudinary...");
    const cloudImage = await cloudinary.uploadImage(imageBase64, poulaillerId);

    const analysis = await AiAnalysis.create({
      poulaillerId,
      triggeredBy: req.body.triggeredBy ?? "manual",
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

    return res.status(200).json({
      success: true,
      data: {
        _id: analysis._id,
        result: aiResult,
        imageUrl: cloudImage.url,
        thumbnailUrl: cloudImage.thumbnailUrl,
        createdAt: analysis.createdAt,
      },
    });
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
    // ✅ Vérifie caméra avant de publier MQTT
    await verifyCameraLinked(poulaillerId);

    console.log(`[AI] Déclenchement capture MQTT — poulailler ${poulaillerId}`);

    await publishCaptureTrigger(poulaillerId);
    console.log("[AI] Commande MQTT envoyée → attente image...");

    const { image } = await waitForImage(poulaillerId, 35_000);
    console.log("[AI] Image reçue — envoi au client");

    return res.status(200).json({
      success: true,
      data: {
        imageBase64: image,
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
  const { question, poulaillerId, history = [] } = req.body;

  if (!question?.trim() || !poulaillerId) {
    return res
      .status(400)
      .json({ success: false, error: "Question et poulaillerId sont requis" });
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

    return res.status(200).json({
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
    console.error("[AI] Erreur chatWithVet:", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function getChatHistory(req, res) {
  const { poulaillerId } = req.params;

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  try {
    const history = await ChatHistory.findOne({
      poulaillerId,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: history?.messages || [],
    });
  } catch (err) {
    console.error("[Chat] Erreur getChatHistory:", err.message);
    return res.status(500).json({ success: false, error: "Erreur serveur" });
  }
}

async function clearChatHistory(req, res) {
  const { poulaillerId } = req.params;

  const { error, status } = await checkAccess(poulaillerId, req.user.id);
  if (error) return res.status(status).json({ success: false, error });

  try {
    await ChatHistory.findOneAndDelete({ poulaillerId, userId: req.user.id });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[Chat] Erreur clearChatHistory:", err.message);
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
  getChatHistory,
  clearChatHistory,
  pendingImages,
  awaitCameraImage,
};
