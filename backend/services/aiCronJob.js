// jobs/aiCronJob.js
// Smart Poultry — Analyse automatique toutes les 2 heures
// Pour chaque poulailler actif : capture ESP32 → analyse Gemma → alerte si critique

"use strict";

const cron = require("node-cron");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const Camera = require("../models/Camera");

const {
  analyzeWithCloudflareAI,
  extractFreshSensors,
  publishCaptureTrigger,
  pendingImages,
  INTER_ANALYSIS_DELAY_MS,
} = require("../services/aiService");

// ════════════════════════════════════════════════════════════════════════════════
// DÉMARRAGE DU CRON
// ════════════════════════════════════════════════════════════════════════════════

function startAiCronJob() {
  // Toutes les 2 heures
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

    // Délai entre poulaillers pour ne pas saturer l'API Cloudflare
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

  // ── Vérifie qu'une caméra est associée ────────────────────────────────────
  const camera = await Camera.findOne({ poulailler: id, status: "associated" });

  // ── Capteurs frais (utilise extractFreshSensors pour valider la fraîcheur) ─
  const sensorData = extractFreshSensors(poulailler);
  const thresholds = poulailler.thresholds ?? {};

  let imageBase64 = null;

  // ── Tentative de capture ESP32 si caméra disponible ──────────────────────
  if (camera) {
    const requestId = `cron-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    let mqttSent = false;
    try {
      mqttSent = await publishCaptureTrigger(id, requestId);
      console.log(`[CRON IA] MQTT → ${name} (${requestId})`);
    } catch (err) {
      console.warn(`[CRON IA] MQTT échoué pour ${name} : ${err.message}`);
    }

    if (mqttSent) {
      imageBase64 = await waitForImage(id, 30_000);
      if (!imageBase64) {
        console.warn(
          `[CRON IA] Pas d'image reçue pour ${name} — analyse capteurs`,
        );
      }
    }
  } else {
    console.log(
      `[CRON IA] Pas de caméra pour ${name} — analyse capteurs uniquement`,
    );
  }

  // ── Analyse IA ────────────────────────────────────────────────────────────
  const aiResult = await analyzeWithCloudflareAI(
    imageBase64 || "",
    sensorData,
    thresholds,
  );

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  await AiAnalysis.create({
    poultryId: id,
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
    `[CRON IA] ✓ ${name} — score: ${aiResult.healthScore}, urgence: ${aiResult.urgencyLevel}`,
  );

  // ── Alerte si nécessaire ──────────────────────────────────────────────────
  await maybeCreateAlert(id, name, aiResult, sensorData, thresholds);
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
// ATTENTE IMAGE ESP32 (pendingImages Map)
// ════════════════════════════════════════════════════════════════════════════════

function waitForImage(poulaillerId, timeoutMs) {
  const key = poulaillerId.toString().trim();

  return new Promise((resolve) => {
    // Vérification synchrone immédiate
    const existing = pendingImages.get(key);
    if (existing?.image) {
      pendingImages.delete(key);
      return resolve(existing.image);
    }

    const start = Date.now();
    const interval = setInterval(() => {
      try {
        const entry = pendingImages.get(key);
        if (entry?.image) {
          clearInterval(interval);
          pendingImages.delete(key);
          return resolve(entry.image);
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          pendingImages.delete(key);
          resolve(null);
        }
      } catch {
        clearInterval(interval);
        pendingImages.delete(key);
        resolve(null);
      }
    }, 500);
  });
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
