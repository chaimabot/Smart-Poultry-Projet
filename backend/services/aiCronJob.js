const cron = require("node-cron");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const { publishCaptureTrigger, analyzeWithGemini } = require("./aiService");
const { waitForImage } = require("../controllers/uploadController");

function startAiCronJob() {
  cron.schedule("0 */2 * * *", async () => {
    console.log("[CRON IA] Déclenchement :", new Date().toISOString());

    const poulaillers = await Poulailler.find({ isArchived: false });

    for (const poulailler of poulaillers) {
      try {
        const id = poulailler._id.toString();
        const sensorData = {
          temperature: poulailler.lastMonitoring?.temperature ?? null,
          humidity: poulailler.lastMonitoring?.humidity ?? null,
          co2: poulailler.lastMonitoring?.co2 ?? null,
          nh3: poulailler.lastMonitoring?.nh3 ?? null,
          animalCount: poulailler.animalCount,
          surface: poulailler.surface,
        };

        // 1. Trigger MQTT
        await publishCaptureTrigger(id);

        // 2. Attendre image (30 s)
        const { image } = await waitForImage(id, sensorData, "auto");

        // 3. Gemini
        const geminiResult = await analyzeWithGemini(image, sensorData);

        // 4. Sauvegarde
        await AiAnalysis.create({
          poulaillerId: id,
          triggeredBy: "auto",
          sensors: sensorData,
          result: geminiResult,
        });

        console.log(
          `[CRON IA] ✓ ${poulailler.name} — Score: ${geminiResult.healthScore}`,
        );

        if (
          geminiResult.urgencyLevel === "critique" ||
          geminiResult.detections.mortalityDetected
        )
          console.warn(`[CRON IA] ⚠ ALERTE pour ${poulailler.name}`);

        await new Promise((r) => setTimeout(r, 5000)); // pause Gemini rate limit
      } catch (err) {
        console.error(`[CRON IA] ✗ ${poulailler.name} :`, err.message);
      }
    }
  });

  console.log("[CRON IA] Planificateur démarré");
}

module.exports = { startAiCronJob };
