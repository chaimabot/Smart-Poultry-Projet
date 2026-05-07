const cron = require("node-cron");
const Poulailler = require("../models/Poulailler");
const AiAnalysis = require("../models/AiAnalysis");
const { captureFromESP32, analyzeWithGemini } = require("./aiService");

// ============================================================
// Cron job — Analyse automatique toutes les 2 heures
// Déclenché par le backend sans intervention utilisateur
// ============================================================
function startAiCronJob() {
  // "0 */2 * * *" = toutes les 2 heures pile
  cron.schedule("0 */2 * * *", async () => {
    console.log(
      "[CRON IA] Déclenchement analyse automatique :",
      new Date().toISOString(),
    );

    try {
      // Récupérer tous les poulaillers actifs (non archivés)
      const poulaillers = await Poulailler.find({ isArchived: false });
      console.log(`[CRON IA] ${poulaillers.length} poulailler(s) à analyser`);

      for (const poulailler of poulaillers) {
        const espIp = poulailler.espCamIp || process.env.ESP32_CAM_IP;

        if (!espIp) {
          console.warn(
            `[CRON IA] Pas d'IP ESP32-CAM pour ${poulailler._id} — ignoré`,
          );
          continue;
        }

        try {
          console.log(
            `[CRON IA] Analyse de ${poulailler.name} (${poulailler._id})`,
          );

          // 1. Capture
          const imageBase64 = await captureFromESP32(espIp);

          // 2. Données capteurs
          const sensorData = {
            temperature: poulailler.lastMonitoring?.temperature ?? null,
            humidity: poulailler.lastMonitoring?.humidity ?? null,
            co2: poulailler.lastMonitoring?.co2 ?? null,
            nh3: poulailler.lastMonitoring?.nh3 ?? null,
            animalCount: poulailler.animalCount,
            surface: poulailler.surface,
          };

          // 3. Analyse Gemini
          const geminiResult = await analyzeWithGemini(imageBase64, sensorData);

          // 4. Sauvegarde
          const analysis = await AiAnalysis.create({
            poulaillerId: poulailler._id,
            triggeredBy: "auto",
            sensors: sensorData,
            result: geminiResult,
          });

          console.log(
            `[CRON IA] ✓ ${poulailler.name} — Score: ${geminiResult.healthScore} | Urgence: ${geminiResult.urgencyLevel}`,
          );

          // 5. Alerte si critique
          if (
            geminiResult.urgencyLevel === "critique" ||
            geminiResult.detections.mortalityDetected
          ) {
            console.warn(`[CRON IA] ⚠ ALERTE CRITIQUE pour ${poulailler.name}`);
            // TODO : appeler Expo Push Notifications ici
          }

          // Pause 5s entre chaque poulailler pour respecter la limite Gemini (15 req/min)
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (err) {
          // Erreur sur un poulailler → on logue et on continue avec les suivants
          console.error(
            `[CRON IA] ✗ Échec pour ${poulailler.name} :`,
            err.message,
          );
        }
      }

      console.log("[CRON IA] Cycle terminé :", new Date().toISOString());
    } catch (err) {
      console.error("[CRON IA] Erreur générale :", err.message);
    }
  });

  console.log("[CRON IA] Planificateur démarré — analyse toutes les 2 heures");
}

module.exports = { startAiCronJob };
