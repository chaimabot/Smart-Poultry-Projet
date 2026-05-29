// test/aiImageHealthTest.js
// ============================================================
// Test interactif — Donner une image → Santé des volailles
// Usage : node test/aiImageHealthTest.js [chemin-image]
// Exemple : node test/aiImageHealthTest.js test/test-image.jpg
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const {
  analyzeWithCloudflareAI,
  chatWithGemma,
} = require("../services/aiService");
const fs = require("fs");

// ============================================================
// CAPTEURS PAR DÉFAUT (modifiables via args CLI)
// ============================================================
const DEFAULT_SENSORS = {
  temperature: 24,
  humidity: 58,
  airQualityPercent: 70,
  waterLevel: 55,
  animalCount: 100,
  surface: 40,
};

const DEFAULT_THRESHOLDS = {
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 70,
  airQualityMin: 20,
  waterLevelMin: 20,
};

// ============================================================
// MAIN
// ============================================================
async function main() {
  printBanner();

  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error("❌ Aucune image fournie.");
    console.error(
      "   Usage : node test/aiImageHealthTest.js <chemin-vers-image>",
    );
    console.error(
      "   Exemple : node test/aiImageHealthTest.js test/test-image.jpg",
    );
    process.exit(1);
  }

  const resolvedPath = path.resolve(imagePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Image introuvable : ${resolvedPath}`);
    process.exit(1);
  }

  // Charger et afficher infos image
  const imageBuffer = fs.readFileSync(resolvedPath);
  const imageBase64 = imageBuffer.toString("base64");
  const sizeKb = Math.round(imageBuffer.length / 1024);
  const ext = path.extname(resolvedPath).toLowerCase();

  console.log("📸 IMAGE CHARGÉE");
  console.log(`   Fichier  : ${path.basename(resolvedPath)}`);
  console.log(`   Format   : ${ext}`);
  console.log(`   Taille   : ${sizeKb} Ko`);
  console.log(
    `   Base64   : ${Math.round(imageBase64.length / 1024)} Ko encodé`,
  );
  console.log();

  if (!["jpg", "jpeg", "png", "webp"].includes(ext.replace(".", ""))) {
    console.warn(
      `⚠️  Format '${ext}' inhabituel — recommandé : .jpg ou .png\n`,
    );
  }

  // Afficher les capteurs utilisés
  console.log("🌡️  CAPTEURS UTILISÉS (valeurs de test)");
  console.log(`   Température     : ${DEFAULT_SENSORS.temperature}°C`);
  console.log(`   Humidité        : ${DEFAULT_SENSORS.humidity}%`);
  console.log(`   Qualité de l'air: ${DEFAULT_SENSORS.airQualityPercent}%`);
  console.log(`   Niveau d'eau    : ${DEFAULT_SENSORS.waterLevel}%`);
  console.log(`   Nombre volailles: ${DEFAULT_SENSORS.animalCount}`);
  console.log(`   Surface         : ${DEFAULT_SENSORS.surface} m²`);
  console.log();

  // ============================================================
  // ÉTAPE 1 — Analyse IA de l'image
  // ============================================================
  console.log("⏳ Analyse IA en cours...\n");
  const startAnalyze = Date.now();
  let aiResult;

  try {
    // ✅ CORRECTION
    aiResult = await analyzeWithCloudflareAI(
      imageBase64,
      DEFAULT_SENSORS,
      DEFAULT_THRESHOLDS,
      true,
    );
  } catch (err) {
    console.error(`❌ Erreur lors de l'analyse : ${err.message}`);
    process.exit(1);
  }

  const durationAnalyze = Date.now() - startAnalyze;

  // ============================================================
  // AFFICHAGE RÉSULTAT ANALYSE
  // ============================================================
  printSeparator("📊 RÉSULTAT DE L'ANALYSE");

  const urgencyEmoji = { normal: "✅", attention: "⚠️ ", critique: "🚨" };
  const scoreBar = buildScoreBar(aiResult.healthScore);

  console.log(`   Score de santé  : ${scoreBar} ${aiResult.healthScore}/100`);
  console.log(
    `   Niveau urgence  : ${urgencyEmoji[aiResult.urgencyLevel] ?? "❓"} ${aiResult.urgencyLevel.toUpperCase()}`,
  );
  console.log(`   Confiance IA    : ${aiResult.confidence ?? "N/A"}%`);
  console.log(
    `   Qualité image   : ${aiResult.imageQuality?.status ?? "N/A"} (${aiResult.imageQuality?.sizeKb ?? "?"}Ko)`,
  );
  console.log(`   Durée analyse   : ${durationAnalyze}ms`);
  console.log();

  console.log("📝 DIAGNOSTIC");
  console.log(`   ${aiResult.diagnostic}`);
  console.log();

  console.log("🔍 DÉTECTIONS");
  console.log(
    `   Mortalité détectée : ${aiResult.detections?.mortalityDetected ? "❌ OUI" : "✅ NON"}`,
  );
  console.log(
    `   Comportement normal: ${aiResult.detections?.behaviorNormal ? "✅ OUI" : "⚠️  NON"}`,
  );
  console.log();

  console.log("💡 CONSEILS");
  if (Array.isArray(aiResult.advices) && aiResult.advices.length > 0) {
    aiResult.advices.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  } else {
    console.log("   Aucun conseil disponible.");
  }
  console.log();

  // ============================================================
  // ÉTAPE 2 — Chat IA avec délai anti-rate-limit
  // ============================================================
  printSeparator("💬 RÉSUMÉ SANTÉ EN LANGAGE NATUREL (chatWithGemma)");

  const chatContext = {
    poulaillerName: "Poulailler Test",
    animalCount: DEFAULT_SENSORS.animalCount,
    lastScore: aiResult.healthScore,
    lastUrgency: aiResult.urgencyLevel,
    lastDiagnostic: aiResult.diagnostic,
    lastAdvices: aiResult.advices?.join(". ") || null,
    temperature: DEFAULT_SENSORS.temperature,
    humidity: DEFAULT_SENSORS.humidity,
    airQuality: DEFAULT_SENSORS.airQualityPercent,
    waterLevel: DEFAULT_SENSORS.waterLevel,
  };

  const chatQuestions = [
    "Quel est l'état de santé général de mes volailles ?",
    "Y a-t-il des risques ou alertes à surveiller ?",
    "Que dois-je faire maintenant pour améliorer leur état ?",
  ];

  for (let i = 0; i < chatQuestions.length; i++) {
    const question = chatQuestions[i];
    console.log(`❓ ${question}`);
    const startChat = Date.now();

    try {
      const answer = await chatWithGemma(question, chatContext);
      const durationChat = Date.now() - startChat;
      console.log(`💬 ${answer}`);
      console.log(`   ⏱️  ${durationChat}ms\n`);
    } catch (err) {
      console.error(`   ❌ Erreur chat : ${err.message}\n`);
    }

    // Pause 2s entre chaque question pour éviter le rate limit Cloudflare
    if (i < chatQuestions.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ============================================================
  // VERDICT FINAL
  // ============================================================
  printSeparator("🏁 VERDICT FINAL");

  if (aiResult.urgencyLevel === "critique") {
    console.log("🚨 INTERVENTION IMMÉDIATE REQUISE");
    console.log("   Contactez un vétérinaire et vérifiez le poulailler.");
  } else if (aiResult.urgencyLevel === "attention") {
    console.log("⚠️  SURVEILLANCE RENFORCÉE CONSEILLÉE");
    console.log("   Observez les volailles et contrôlez les capteurs.");
  } else {
    console.log("✅ ÉTAT SATISFAISANT");
    console.log("   Continuez la surveillance régulière.");
  }

  console.log();
}

// ============================================================
// HELPERS AFFICHAGE
// ============================================================
function printBanner() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   🐔 SMART POULTRY — TEST SANTÉ PAR IMAGE                ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

function printSeparator(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 54 - title.length))}`);
}

function buildScoreBar(score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const color = score >= 70 ? "🟩" : score >= 40 ? "🟨" : "🟥";
  return color.repeat(filled) + "⬜".repeat(empty);
}

// ============================================================
// LANCER
// ============================================================
main().catch((err) => {
  console.error("💥 Erreur globale :", err);
  process.exit(1);
});
