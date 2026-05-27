// jobs/aiCronJob.js

const cron = require("node-cron");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const CaptureRequest = require("../models/Capturerequest");

// ✅ FIX : import depuis aiService (source unique de vérité), plus depuis aiController
const {
  pendingImages,
  publishCaptureTrigger,
  analyzeWithCloudflareAI,
  INTER_ANALYSIS_DELAY_MS,
} = require("../services/aiService");

function startAiCronJob() {
  cron.schedule("0 */2 * * *", async () => {
    console.log("[CRON IA] Déclenchement :", new Date().toISOString());

    const poulaillers = await Poulailler.find({ isArchived: false });
    if (poulaillers.length === 0) {
      console.log("[CRON IA] Aucun poulailler actif.");
      return;
    }

    console.log(`[CRON IA] ${poulaillers.length} poulailler(s) à analyser`);

    for (const poulailler of poulaillers) {
      const id = poulailler._id.toString();

      try {
        const sensorData = {
          temperature: poulailler.lastMonitoring?.temperature ?? null,
          humidity: poulailler.lastMonitoring?.humidity ?? null,
          airQualityPercent:
            poulailler.lastMonitoring?.airQualityPercent ?? null,
          waterLevel: poulailler.lastMonitoring?.waterLevel ?? null,
          animalCount: poulailler.animalCount,
          surface: poulailler.surface,
        };

        const thresholds = poulailler.thresholds;

        // ✅ FIX : génération d'un requestId avant l'appel (était undefined avant)
        const requestId = `cron-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        let mqttSent = false;
        try {
          mqttSent = await publishCaptureTrigger(id, requestId);
          console.log(
            `[CRON IA] Trigger MQTT → ${poulailler.name} (requestId: ${requestId})`,
          );
        } catch (mqttErr) {
          // La caméra est peut-être absente ou déconnectée — on continue en mode capteurs
          console.warn(
            `[CRON IA] MQTT échoué pour ${poulailler.name} : ${mqttErr.message}`,
          );
        }

        let image = null;

        if (mqttSent) {
          // Attente de l'image envoyée par l'ESP32 (30s max)
          image = await waitForCronImage(id, 30000);
        }

        if (!image) {
          console.warn(
            `[CRON IA] Pas d'image pour ${poulailler.name} — analyse capteurs uniquement`,
          );

          const aiResult = await analyzeWithCloudflareAI(
            "",
            sensorData,
            thresholds,
          );

          await AiAnalysis.create({
            poultryId: id,
            triggeredBy: "auto",
            sensors: sensorData,
            result: aiResult,
            imageQuality: { sizeKb: 0, status: "poor" },
          });

          await maybeCreateAlert(
            id,
            aiResult,
            sensorData,
            thresholds,
            poulailler.name,
          );
          continue;
        }

        const aiResult = await analyzeWithCloudflareAI(
          image,
          sensorData,
          thresholds,
        );

        await AiAnalysis.create({
          poultryId: id,
          triggeredBy: "auto",
          sensors: sensorData,
          result: aiResult,
          imageQuality: aiResult.imageQuality,
        });

        console.log(
          `[CRON IA] ✓ ${poulailler.name} — Score: ${aiResult.healthScore}`,
        );

        await maybeCreateAlert(
          id,
          aiResult,
          sensorData,
          thresholds,
          poulailler.name,
        );
      } catch (err) {
        console.error(`[CRON IA] ✗ ${poulailler.name} :`, err.message);
      }

      // Délai entre deux poulaillers pour ne pas saturer l'API Cloudflare
      await new Promise((r) => setTimeout(r, INTER_ANALYSIS_DELAY_MS));
    }

    console.log("[CRON IA] Cycle terminé.");
  });

  console.log("[CRON IA] Planificateur démarré (toutes les 2 heures)");
}

// ─── Création d'alerte si critique ─────────────────────────────────────────

async function maybeCreateAlert(
  poulaillerId,
  aiResult,
  sensorData,
  thresholds,
  name,
) {
  if (
    aiResult.urgencyLevel === "critique" ||
    aiResult.detections?.mortalityDetected
  ) {
    await Alert.create({
      poulailler: poulaillerId,
      type: "sensor",
      key: "ai_analysis",
      parameter: "airQuality",
      value: sensorData.airQualityPercent,
      threshold: thresholds.airQualityMin,
      direction: "below",
      message: `[CRON] ${aiResult.diagnostic}`,
      icon: "alert-circle",
      severity: "danger",
    });
    console.warn(`[CRON IA] ⚠ ALERTE pour ${name}`);
  }
}

// ─── Attente de l'image (pendingImages) ─────────────────────────────────────
// Interroge la Map toutes les 500ms jusqu'à réception ou timeout.

async function waitForCronImage(poulaillerId, timeoutMs) {
  const key = poulaillerId.toString().trim();
  const start = Date.now();

  return new Promise((resolve) => {
    // Vérification synchrone immédiate avant de démarrer l'interval
    const existing = pendingImages.get(key);
    if (existing?.image) {
      pendingImages.delete(key);
      return resolve(existing.image);
    }

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
          resolve(null); // continue sans image
        }
      } catch (err) {
        clearInterval(interval);
        pendingImages.delete(key);
        resolve(null);
      }
    }, 500);
  });
}

module.exports = { startAiCronJob };
