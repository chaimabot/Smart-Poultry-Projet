// test/aiService.test.js
// Test complet du Service IA — Smart Poultry
// Inclut : analyzeWithCloudflareAI + chatWithGemma
// Lancer avec : node test/aiService.test.js

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const {
  analyzeWithCloudflareAI,
  chatWithGemma,
} = require("../services/aiService");

const fs = require("fs");

const TEST_IMAGE_NAME = "test-image.jpg";

const BASE_SENSOR_DATA = {
  temperature: 26,
  humidity: 55,
  airQualityPercent: 75,
  waterLevel: 60,
  animalCount: 120,
  surface: 50,
};

const THRESHOLDS = {
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 70,
  airQualityMin: 20,
  waterLevelMin: 20,
};

const BASE_CONTEXT = {
  poulaillerName: "Poulailler Test A",
  animalCount: 120,
  lastScore: 82,
  lastUrgency: "normal",
  lastDiagnostic: "État général satisfaisant, volailles actives.",
  lastAdvices: "Surveiller la ventilation. Vérifier les abreuvoirs.",
  temperature: 26,
  humidity: 55,
  airQuality: 75,
  waterLevel: 60,
};

async function testAI() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     🧪 TEST SERVICE IA — SMART POULTRY                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const hasCloudflare = !!(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
  );

  console.log("📋 Configuration détectée :");
  console.log(
    `   Cloudflare AI : ${hasCloudflare ? "✅ Configuré" : "⚠️  Non configuré"}`,
  );
  console.log(
    `   Mode actif    : ${hasCloudflare ? "Cloudflare AI (Gemma)" : "Fallback capteurs (offline)"}`,
  );
  console.log();

  const imagePath = path.join(__dirname, TEST_IMAGE_NAME);
  let imageBase64 = null;

  if (fs.existsSync(imagePath)) {
    imageBase64 = fs.readFileSync(imagePath, "base64");
    console.log(
      `📸 Image chargée : ${Math.round(imageBase64.length / 1024)} Ko\n`,
    );
  } else {
    console.warn(
      `⚠️  Image '${TEST_IMAGE_NAME}' non trouvée dans backend/test/\n`,
    );
  }

  let totalPassed = 0;
  let totalFailed = 0;

  // ============================================================
  // BLOC 1 — Tests analyzeWithCloudflareAI
  // ============================================================
  console.log("┌──────────────────────────────────────────────────────────┐");
  console.log("│          📷 BLOC 1 : analyzeWithCloudflareAI             │");
  console.log("└──────────────────────────────────────────────────────────┘\n");

  const analyzeTests = [
    {
      name: "TEST 1 : Conditions normales",
      image: imageBase64,
      sensors: { ...BASE_SENSOR_DATA },
      expectedUrgency: "normal",
    },
    {
      name: "TEST 2 : Air quality critique + surchauffe",
      image: imageBase64,
      sensors: { ...BASE_SENSOR_DATA, airQualityPercent: 15, temperature: 32 },
      expectedUrgency: "critique",
    },
    {
      name: "TEST 3 : Température basse + eau bas",
      image: imageBase64,
      sensors: { ...BASE_SENSOR_DATA, temperature: 12, waterLevel: 10 },
      expectedUrgency: "attention",
    },
    {
      name: "TEST 4 : Fallback capteurs uniquement (sans image)",
      image: null,
      sensors: { ...BASE_SENSOR_DATA },
      expectedUrgency: "normal",
    },
  ];

  for (const test of analyzeTests) {
    const { passed, failed } = await runAnalyzeTest(
      test.name,
      test.image,
      test.sensors,
      THRESHOLDS,
      test.expectedUrgency,
    );
    totalPassed += passed;
    totalFailed += failed;
    console.log();
  }

  // ============================================================
  // BLOC 2 — Tests chatWithGemma
  // ============================================================
  console.log("┌──────────────────────────────────────────────────────────┐");
  console.log("│          💬 BLOC 2 : chatWithGemma                       │");
  console.log("└──────────────────────────────────────────────────────────┘\n");

  const chatTests = [
    {
      name: "CHAT 1 : Question sur la santé",
      question: "Quel est l'état de santé de mon poulailler ?",
      context: { ...BASE_CONTEXT },
    },
    {
      name: "CHAT 2 : Question sur la température",
      question: "Est-ce que la température est normale ?",
      context: { ...BASE_CONTEXT, temperature: 32, lastUrgency: "critique" },
    },
    {
      name: "CHAT 3 : Question sur les alertes",
      question: "Y a-t-il des alertes ou dangers en ce moment ?",
      context: { ...BASE_CONTEXT, lastUrgency: "critique", lastScore: 35 },
    },
    {
      name: "CHAT 4 : Question sur les conseils",
      question: "Quels sont tes recommandations pour améliorer la santé ?",
      context: { ...BASE_CONTEXT },
    },
    {
      name: "CHAT 5 : Question sur l'eau",
      question: "Le niveau d'eau est-il suffisant ?",
      context: { ...BASE_CONTEXT, waterLevel: 12 },
    },
    {
      name: "CHAT 6 : Question libre (hors mots-clés)",
      question: "Combien de volailles sont dans ce poulailler ?",
      context: { ...BASE_CONTEXT },
    },
    {
      name: "CHAT 7 : Contexte sans analyse précédente",
      question: "Comment vont mes volailles ?",
      context: {
        ...BASE_CONTEXT,
        lastScore: "N/A",
        lastUrgency: "normal",
        lastDiagnostic: "Aucune analyse récente",
        lastAdvices: null,
      },
    },
  ];

  for (const test of chatTests) {
    const { passed, failed } = await runChatTest(
      test.name,
      test.question,
      test.context,
    );
    totalPassed += passed;
    totalFailed += failed;
    console.log();
  }

  // ============================================================
  // RÉSULTATS FINAUX
  // ============================================================
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                    📊 RÉSULTATS GLOBAUX                  ║");
  console.log(
    `║   ✅ Vérifications passées  : ${String(totalPassed).padStart(2)}                       ║`,
  );
  console.log(
    `║   ❌ Vérifications échouées : ${String(totalFailed).padStart(2)}                       ║`,
  );
  const total = totalPassed + totalFailed;
  const pct = total > 0 ? Math.round((totalPassed / total) * 100) : 0;
  console.log(
    `║   📈 Taux de réussite       : ${String(pct).padStart(2)}%                      ║`,
  );
  console.log("╚══════════════════════════════════════════════════════════╝");
}

// ============================================================
// RUNNER — analyzeWithCloudflareAI
// ============================================================
async function runAnalyzeTest(
  testName,
  imageBase64,
  sensorData,
  thresholds,
  expectedUrgency,
) {
  console.log(`═══ ${testName} ═══`);

  const start = Date.now();
  let result;
  let duration;

  try {
    result = await analyzeWithCloudflareAI(imageBase64, sensorData, thresholds);
    duration = Date.now() - start;
  } catch (err) {
    duration = Date.now() - start;
    console.error(`❌ ERREUR FATALE en ${duration}ms : ${err.message}`);
    return { passed: 0, failed: 7 };
  }

  console.log(`⏱️  Durée : ${duration}ms`);
  console.log(
    `📊 Score : ${result.healthScore}/100 | Urgence : ${result.urgencyLevel}`,
  );
  console.log(`📝 Diagnostic : ${result.diagnostic}`);
  console.log(`💡 Conseils : ${result.advices?.length ?? 0} recommandation(s)`);

  const checks = [
    {
      test:
        typeof result.healthScore === "number" &&
        result.healthScore >= 0 &&
        result.healthScore <= 100,
      name: "healthScore est un nombre [0-100]",
    },
    {
      test: ["normal", "attention", "critique"].includes(result.urgencyLevel),
      name: "urgencyLevel valide (normal/attention/critique)",
    },
    {
      test:
        typeof result.diagnostic === "string" && result.diagnostic.length > 10,
      name: "diagnostic présent et significatif",
    },
    {
      test: Array.isArray(result.advices) && result.advices.length > 0,
      name: "advices est un tableau non vide",
    },
    {
      test: result.detections !== null && typeof result.detections === "object",
      name: "detections est un objet",
    },
    {
      test:
        result.imageQuality !== null && typeof result.imageQuality === "object",
      name: "imageQuality est un objet",
    },
    {
      test: result.urgencyLevel === expectedUrgency,
      name: `urgencyLevel correspond à l'attendu (${expectedUrgency})`,
    },
  ];

  return logChecks(checks);
}

// ============================================================
// RUNNER — chatWithGemma
// ============================================================
async function runChatTest(testName, question, context) {
  console.log(`═══ ${testName} ═══`);
  console.log(`❓ Question : "${question}"`);
  console.log(
    `🏠 Contexte : ${context.poulaillerName} | Score: ${context.lastScore} | Urgence: ${context.lastUrgency}`,
  );

  const start = Date.now();
  let answer;
  let duration;

  try {
    answer = await chatWithGemma(question, context);
    duration = Date.now() - start;
  } catch (err) {
    duration = Date.now() - start;
    console.error(`❌ ERREUR FATALE en ${duration}ms : ${err.message}`);
    return { passed: 0, failed: 5 };
  }

  console.log(`⏱️  Durée    : ${duration}ms`);
  console.log(`💬 Réponse  : ${answer}`);

  const checks = [
    {
      test: typeof answer === "string",
      name: "La réponse est une chaîne de caractères",
    },
    {
      test: answer.trim().length >= 10,
      name: "La réponse contient au moins 10 caractères",
    },
    {
      test: answer.trim().length <= 600,
      name: "La réponse ne dépasse pas 600 caractères (concise)",
    },
    {
      test: !answer.includes("{") && !answer.includes("}"),
      name: "La réponse ne contient pas de JSON brut",
    },
    {
      test: !answer.includes("```"),
      name: "La réponse ne contient pas de balises markdown",
    },
  ];

  return logChecks(checks);
}

// ============================================================
// HELPER — affiche et compte les checks
// ============================================================
function logChecks(checks) {
  const passed = checks.filter((c) => c.test).length;
  const failed = checks.filter((c) => !c.test).length;

  console.log(`✅ ${passed}/${checks.length} vérifications passent`);

  if (failed > 0) {
    checks
      .filter((c) => !c.test)
      .forEach((c) => console.log(`   ❌ Échec : ${c.name}`));
  }

  return { passed, failed };
}

testAI().catch((err) => {
  console.error("💥 Erreur globale du test :", err);
  process.exit(1);
});
