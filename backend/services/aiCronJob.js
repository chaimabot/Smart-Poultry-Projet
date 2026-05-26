// jobs/aiCronJob.js
// Smart Poultry — Analyse automatique toutes les 2 heures
//
// CORRECTIONS v2 :
//   1. Utilise CaptureRequest (MongoDB) au lieu de pendingImages (Map en mémoire)
//      → compatible avec le flow receiveImageFromESP du controller
//   2. waitForImage fait du polling sur CaptureRequest.status
//   3. publishCaptureTrigger appelé depuis aiService (inchangé)
//   4. L'image est récupérée depuis CaptureRequest.result.analysis après complétion
//   5. Délai inter-poulaillers configurable depuis INTER_ANALYSIS_DELAY_MS

"use strict";

const cron = require("node-cron");
const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const Camera = require("../models/Camera");
const CaptureRequest = require("../models/Capturerequest");

const {
  analyzeWithCloudflareAI,
  extractFreshSensors,
  publishCaptureTrigger,
  INTER_ANALYSIS_DELAY_MS,
} = require("../services/aiService");

// ════════════════════════════════════════════════════════════════════════════════
// DÉMARRAGE DU CRON
// ════════════════════════════════════════════════════════════════════════════════

function startAiCronJob() {
  cron.schedule("0 */2 * * *", runCronCycle);
  console.log("[CRON IA] Planificateur démarré (toutes les 2 heures)");
}

// ════════════════════════════════════════════════════════════════════════════════
// CYCLE D'ANALYSE
// ════════════════════════════════════════════════════════════════════════════════

async function runCronCycle() {
  console.log(`[CRON IA] Démarrage cycle — ${new Date().toISOString()}`);

  const poulaillers = await Poulailler.find({ isArchived: false }).catch(
    () => [],
  );

  if (poulaillers.length === 0) {
    console.log("[CRON IA] Aucun poulailler actif.");
    return;
  }

  console.log(`[CRON IA] ${poulaillers.length} poulailler(s) à analyser`);

  for (const poulailler of poulaillers) {
    await analyzeOnePoulailler(poulailler).catch((err) =>
      console.error(`[CRON IA] ✗ ${poulailler.name} :`, err.message),
    );
    await delay(INTER_ANALYSIS_DELAY_MS);
  }

  console.log("[CRON IA] Cycle terminé.");
}

// ════════════════════════════════════════════════════════════════════════════════
// ANALYSE D'UN POULAILLER
// ════════════════════════════════════════════════════════════════════════════════

async function analyzeOnePoulailler(poulailler) {
  const id = poulailler._id.toString();
  const name = poulailler.name;

  const camera = await Camera.findOne({ poulailler: id, status: "associated" });
  const sensorData = extractFreshSensors(poulailler);
  const thresholds = poulailler.thresholds ?? {};

  let imageBase64 = null;
  let captureRequestId = null;

  // ── Tentative de capture ESP32 via CaptureRequest (MongoDB) ───────────────
  if (camera) {
    const requestId = `cron-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    captureRequestId = requestId;

    let mqttSent = false;
    try {
      // Crée le CaptureRequest avant d'envoyer la commande MQTT
      // → receiveImageFromESP pourra trouver le document et le passer à "uploading"
      await CaptureRequest.create({
        requestId,
        poulaillerId: new mongoose.Types.ObjectId(id),
        status: "pending",
      });

      mqttSent = await publishCaptureTrigger(id, requestId);
      console.log(
        `[CRON IA] MQTT → ${name} (${requestId}), envoyé: ${mqttSent}`,
      );
    } catch (err) {
      console.warn(
        `[CRON IA] MQTT/création échoué pour ${name} : ${err.message}`,
      );
      // Nettoyage si la création CaptureRequest a réussi mais MQTT a échoué
      if (captureRequestId) {
        await CaptureRequest.deleteOne({ requestId: captureRequestId }).catch(
          () => {},
        );
        captureRequestId = null;
      }
    }

    // ── Attente de complétion via polling CaptureRequest ──────────────────
    if (mqttSent && captureRequestId) {
      const completed = await waitForCaptureCompletion(
        captureRequestId,
        60_000,
      );

      if (completed?.status === "completed" && completed.result?.analysis) {
        // L'analyse a déjà été faite par processImageAsync dans le controller
        // → on sauvegarde directement les résultats sans rappeler analyzeWithCloudflareAI
        const analysis = completed.result.analysis;
        console.log(
          `[CRON IA] ✓ ${name} (via controller) — score: ${analysis.healthScore}, urgence: ${analysis.urgencyLevel}`,
        );

        // Sauvegarde en base avec triggeredBy = "cron-auto"
        await AiAnalysis.create({
          poultryId: new mongoose.Types.ObjectId(id),
          triggeredBy: "cron-auto",
          sensors: sensorData,
          result: {
            healthScore: analysis.healthScore ?? null,
            urgencyLevel: analysis.urgencyLevel ?? "inconnu",
            confidence: analysis.confidence ?? null,
            diagnostic: analysis.diagnostic ?? "",
            stade_croissance: analysis.stade_croissance ?? "indéterminé",
            comptage: analysis.comptage ?? {
              estimation: null,
              fiabilite: null,
            },
            maladie_suspectee: analysis.maladie_suspectee ?? {
              suspicion: false,
            },
            detections: analysis.detections ?? {},
            advices: Array.isArray(analysis.advices) ? analysis.advices : [],
            sensors: sensorData,
            imageAvailable: analysis.imageAvailable ?? true,
            imageUsable: analysis.imageUsable ?? true,
          },
          imageQuality: completed.result.imageQuality ?? { status: "ok" },
          image: {
            url: completed.result.imageUrl ?? null,
            thumbnailUrl: completed.result.thumbnailUrl ?? null,
            publicId: null,
          },
          cameraMac: camera?.macAddress ?? null,
        });

        await maybeCreateAlert(id, name, analysis, sensorData, thresholds);
        return; // Sortie anticipée — pas besoin de refaire l'analyse
      } else {
        console.warn(
          `[CRON IA] Capture non complétée pour ${name} (status: ${completed?.status ?? "timeout"}) — fallback capteurs`,
        );
      }
    }
  } else {
    console.log(
      `[CRON IA] Pas de caméra pour ${name} — analyse capteurs uniquement`,
    );
  }

  // ── Fallback : analyse capteurs uniquement (pas d'image) ─────────────────
  const aiResult = await analyzeWithCloudflareAI(
    imageBase64 || "",
    sensorData,
    thresholds,
  );

  await AiAnalysis.create({
    poultryId: new mongoose.Types.ObjectId(id),
    triggeredBy: "cron-auto",
    sensors: sensorData,
    result: {
      healthScore: aiResult.healthScore ?? null,
      urgencyLevel: aiResult.urgencyLevel ?? "inconnu",
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
  });

  console.log(
    `[CRON IA] ✓ ${name} (capteurs) — score: ${aiResult.healthScore}, urgence: ${aiResult.urgencyLevel}`,
  );

  await maybeCreateAlert(id, name, aiResult, sensorData, thresholds);
}

// ════════════════════════════════════════════════════════════════════════════════
// ATTENTE COMPLÉTION VIA CAPTUREREQUEST (MongoDB polling)
// Remplace pendingImages (Map en mémoire) — compatible avec receiveImageFromESP
// ════════════════════════════════════════════════════════════════════════════════

async function waitForCaptureCompletion(requestId, timeoutMs = 60_000) {
  const start = Date.now();
  const POLL_INTERVAL = 1000; // 1s entre chaque vérification

  while (Date.now() - start < timeoutMs) {
    try {
      const doc = await CaptureRequest.findOne({ requestId });

      if (!doc) {
        // Document supprimé (TTL ou suppression manuelle)
        console.warn(`[CRON IA] CaptureRequest ${requestId} introuvable`);
        return null;
      }

      if (doc.status === "completed") {
        return doc;
      }

      if (doc.status === "failed") {
        console.warn(`[CRON IA] Capture ${requestId} échouée : ${doc.error}`);
        return doc;
      }

      // pending / capturing / uploading / analyzing → on attend
      await delay(POLL_INTERVAL);
    } catch (err) {
      console.error(
        `[CRON IA] Erreur polling CaptureRequest ${requestId} :`,
        err.message,
      );
      await delay(POLL_INTERVAL);
    }
  }

  // Timeout — marque la capture comme échouée pour nettoyage
  await CaptureRequest.findOneAndUpdate(
    { requestId, status: { $ne: "completed" } },
    { status: "failed", error: "Timeout CRON (60s)" },
  ).catch(() => {});

  console.warn(
    `[CRON IA] Timeout (${timeoutMs / 1000}s) pour CaptureRequest ${requestId}`,
  );
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// ALERTE SI CRITIQUE
// ════════════════════════════════════════════════════════════════════════════════

async function maybeCreateAlert(
  poulaillerId,
  name,
  aiResult,
  sensorData,
  thresholds,
) {
  const isCritique = aiResult.urgencyLevel === "critique";
  const isMortality = aiResult.detections?.mortalityDetected === true;
  const isMaladie = aiResult.maladie_suspectee?.urgence_veterinaire === true;

  if (!isCritique && !isMortality && !isMaladie) return;

  const severity = isMortality ? "danger" : "warning";

  let message = aiResult.diagnostic || "Alerte IA déclenchée";
  if (isMaladie && aiResult.maladie_suspectee?.maladie_probable) {
    message = `[CRON] Maladie suspectée : ${aiResult.maladie_suspectee.maladie_probable}. ${message}`;
  } else {
    message = `[CRON] ${message}`;
  }

  await Alert.create({
    poulailler: poulaillerId,
    type: "sensor",
    key: "ai_cron_analysis",
    parameter: "airQuality",
    value: sensorData.airQualityPercent,
    threshold: thresholds.airQualityMin,
    direction: "below",
    message,
    icon: "alert-circle",
    severity,
  });

  console.warn(
    `[CRON IA] ⚠ ALERTE ${severity.toUpperCase()} pour ${name} : ${message}`,
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// UTILITAIRE
// ════════════════════════════════════════════════════════════════════════════════

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = { startAiCronJob };
