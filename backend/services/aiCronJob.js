// cron/aiCronJob.js
// ============================================================
// Cron Job IA — Analyse automatique toutes les 2 heures
// ============================================================

const cron = require("node-cron");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const Alert = require("../models/Alert");
const { pendingImages } = require("../controllers/aiController");
const {
  publishCaptureTrigger,
  analyzeWithCloudflareAI, // FIX #5 : était "analyzeWithGemini" (inexistant)
  INTER_ANALYSIS_DELAY_MS, // FIX #5 : délai centralisé depuis aiService
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

        await publishCaptureTrigger(id);
        console.log(`[CRON IA] Trigger → ${poulailler.name}`);

        // FIX #1 + #3 : waitForCronImage utilise le même pattern robuste
        //               (clearInterval + delete garantis dans tous les chemins)
        const image = await waitForCronImage(id, 30000);

        if (!image) {
          console.warn(
            `[CRON IA] Pas d'image pour ${poulailler.name} — analyse capteurs uniquement`,
          );

          // FIX #5 : analyzeWithCloudflareAI gère déjà le cas image vide/null
          const aiResult = await analyzeWithCloudflareAI(
            "",
            sensorData,
            thresholds,
          );

          await AiAnalysis.create({
            poulaillerId: id,
            triggeredBy: "auto",
            sensors: sensorData,
            result: aiResult,
            imageQuality: { sizeKb: 0, status: "poor" },
          });
          continue;
        }

        // FIX #5 : nom de fonction corrigé
        const aiResult = await analyzeWithCloudflareAI(
          image,
          sensorData,
          thresholds,
        );

        await AiAnalysis.create({
          poulaillerId: id,
          triggeredBy: "auto",
          sensors: sensorData,
          result: aiResult,
          imageQuality: aiResult.imageQuality,
        });

        console.log(
          `[CRON IA] ✓ ${poulailler.name} — Score: ${aiResult.healthScore}`,
        );

        if (
          aiResult.urgencyLevel === "critique" ||
          aiResult.detections.mortalityDetected
        ) {
          await Alert.create({
            poulailler: id,
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
          console.warn(`[CRON IA] ⚠ ALERTE pour ${poulailler.name}`);
        }
      } catch (err) {
        console.error(`[CRON IA] ✗ ${poulailler.name} :`, err.message);
      }

      // FIX #5 : délai centralisé depuis aiService (n'était pas utilisé)
      await new Promise((r) => setTimeout(r, INTER_ANALYSIS_DELAY_MS));
    }

    console.log("[CRON IA] Cycle terminé.");
  });

  console.log("[CRON IA] Planificateur démarré (toutes les 2 heures)");
}

// ============================================================
// FIX #1 + #3 : waitForCronImage
// - pendingImages.delete() garanti dans TOUS les chemins
// - try/catch dans le setInterval pour éviter un interval orphelin
// ============================================================

async function waitForCronImage(poulaillerId, timeoutMs) {
  const id = poulaillerId.toString().trim();
  const start = Date.now();

  return new Promise((resolve) => {
    // Vérification synchrone avant de créer l'interval
    const existing = pendingImages.get(id);
    if (existing?.image) {
      pendingImages.delete(id); // FIX #1
      return resolve(existing.image);
    }

    const interval = setInterval(() => {
      try {
        const entry = pendingImages.get(id);

        if (entry?.image) {
          clearInterval(interval);
          pendingImages.delete(id); // FIX #1 : nettoyage sur succès
          return resolve(entry.image);
        }

        if (Date.now() - start >= timeoutMs) {
          clearInterval(interval);
          pendingImages.delete(id); // FIX #1 : nettoyage sur timeout
          resolve(null); // Le cron continue sans image
        }
      } catch (err) {
        // FIX #3 : interval orphelin évité en cas d'erreur synchrone
        clearInterval(interval);
        pendingImages.delete(id);
        resolve(null);
      }
    }, 500);
  });
}

module.exports = { startAiCronJob };
