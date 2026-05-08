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
  analyzeWithGemini,
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

        const image = await waitForCronImage(id, 30000);

        if (!image) {
          console.warn(
            `[CRON IA] Pas d'image pour ${poulailler.name} — analyse capteurs uniquement`,
          );
          const aiResult = await analyzeWithGemini("", sensorData, thresholds);

          await AiAnalysis.create({
            poulaillerId: id,
            triggeredBy: "auto",
            sensors: sensorData,
            result: aiResult,
            imageQuality: { sizeKb: 0, status: "poor" },
          });
          continue;
        }

        const aiResult = await analyzeWithGemini(image, sensorData, thresholds);

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

      await new Promise((r) => setTimeout(r, 5000));
    }

    console.log("[CRON IA] Cycle terminé.");
  });

  console.log("[CRON IA] Planificateur démarré (toutes les 2 heures)");
}

async function waitForCronImage(poulaillerId, timeoutMs) {
  const id = poulaillerId.toString().trim();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const entry = pendingImages.get(id);
    if (entry?.image) {
      const img = entry.image;
      pendingImages.delete(id);
      return img;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

module.exports = { startAiCronJob };
