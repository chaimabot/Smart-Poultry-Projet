// services/aiService.js
// Cloudflare AI (Gemma 3 + LLaVA) + MQTT

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const axios = require("axios");
const mqtt = require("mqtt");
const sharp = require("sharp");

const { pendingImages } = require("../controllers/aiController");

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const USE_CLOUDFLARE = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

const PRIMARY_MODEL = "@cf/google/gemma-3-12b-it";
const FALLBACK_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

const GEMMA_TIMEOUT = 12000; // ms — analyse image
const CHAT_TIMEOUT = 20000; // ms — chatbot
const LLAVA_TIMEOUT = 10000; // ms — fallback image

const LLAVA_MAX_KB = 24; // Taille max acceptée par LLaVA

const INTER_ANALYSIS_DELAY_MS = 5000;

// Mots-clés liés à la mortalité à détecter dans le diagnostic et les conseils
const DEATH_KEYWORDS = [
  "décédé",
  "décès",
  "mort",
  "morte",
  "morts",
  "mortes",
  "mortalité",
  "oiseau mort",
  "volaille morte",
  "cadavre",
  "dead",
  "death",
  "mortality",
  "deceased",
];

let mqttClient = null;

function getMqttClient() {
  if (mqttClient?.connected) return mqttClient;

  mqttClient = mqtt.connect(
    `mqtts://${process.env.MQTT_BROKER}:${process.env.MQTT_PORT}`,
    {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      reconnectPeriod: 3000,
      rejectUnauthorized: false,
      connectTimeout: 10000,
      clean: true,
    },
  );

  mqttClient.on("connect", () => console.log("[MQTT] Connecté"));
  mqttClient.on("error", (err) =>
    console.error("[MQTT] Erreur :", err.message),
  );
  mqttClient.on("offline", () => console.warn("[MQTT] Hors-ligne"));

  return mqttClient;
}

async function publishCaptureTrigger(poulaillerId) {
  return new Promise((resolve, reject) => {
    const client = getMqttClient();
    client.publish(
      "poulailler/capture",
      JSON.stringify({ command: "capture", poulaillerId }),
      { qos: 1, retain: false },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

function cleanBase64(base64) {
  if (!base64) return null;
  return base64.includes(",") ? base64.split(",")[1] : base64;
}

function getImageSizeKb(base64) {
  return Math.round((base64.length * 3) / 4 / 1024);
}

async function compressImage(base64) {
  const buffer = Buffer.from(base64, "base64");

  let lastCompressed = null;

  for (let i = 0; i < 5; i++) {
    const quality = Math.max(10, 50 - i * 10);
    const width = Math.max(120, 320 - i * 40);

    const compressed = await sharp(buffer)
      .resize({ width })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const kb = compressed.length / 1024;
    console.log(
      `[AI] Compression tentative ${i + 1} : ${Math.round(kb)} Ko (qualité ${quality}, largeur ${width})`,
    );

    if (kb <= LLAVA_MAX_KB) {
      console.log(`[AI] Image compressée OK : ${Math.round(kb)} Ko`);
      return compressed.toString("base64");
    }

    lastCompressed = compressed;
  }

  console.warn("[AI] Limite de compression atteinte");
  return lastCompressed.toString("base64");
}

function analyzeWithSensorsOnly(sensorData = {}) {
  let score = 85;
  let urgency = "normal";
  let diagnostic = "État général satisfaisant d'après les capteurs.";

  const airQuality = sensorData.airQualityPercent ?? 60;
  const temperature = sensorData.temperature ?? 25;
  const waterLevel = sensorData.waterLevel ?? 60;

  if (airQuality < 20) {
    score -= 40;
    urgency = "critique";
    diagnostic = "Qualité de l'air critique — intervention immédiate requise.";
  }

  if (temperature > 31) {
    score -= 20;
    urgency = "critique";
    diagnostic += " Surchauffe détectée.";
  }

  if (temperature < 15) {
    score -= 15;
    if (urgency !== "critique") urgency = "attention";
    diagnostic += " Température trop basse.";
  }

  if (waterLevel < 20) {
    score -= 15;
    if (urgency !== "critique") urgency = "attention";
    diagnostic += " Niveau d'eau insuffisant.";
  }

  score = Math.max(0, Math.min(100, score));

  return {
    healthScore: score,
    urgencyLevel: urgency,
    diagnostic,
    confidence: 70,
    detections: {
      mortalityDetected: false,
      behaviorNormal: score > 60,
      densityOk: true,
      cleanEnvironment: true,
      ventilationAdequate: true,
    },
    advices: [
      "Maintenir une surveillance continue des capteurs",
      "Vérifier la ventilation et la circulation d'air",
      "Effectuer une maintenance préventive",
    ],
    imageQuality: { sizeKb: 0, status: "poor" },
  };
}

function buildAnalysisPrompt(sensorData = {}) {
  return `
Analyze this poultry farm image carefully.

IMPORTANT RULES:
- mortalityDetected=true ONLY with 90% visual certainty
- sleeping birds are NOT dead
- birds partially hidden are NOT dead
- if uncertain => mortalityDetected=false
- if sensors are normal => do NOT report mortality

urgencyLevel must ONLY be one of: normal | attention | critique

Respond ONLY with valid JSON. No markdown. No explanation.

JSON FORMAT:
{
  "healthScore": 85,
  "urgencyLevel": "normal",
  "diagnostic": "Short diagnostic in French",
  "detections": {
    "mortalityDetected": false,
    "behaviorNormal": true
  },
  "advices": ["conseil 1", "conseil 2", "conseil 3"]
}

Sensor readings:
Temperature    = ${sensorData.temperature ?? "N/A"} °C
Humidity       = ${sensorData.humidity ?? "N/A"} %
AirQuality     = ${sensorData.airQualityPercent ?? "N/A"} %
WaterLevel     = ${sensorData.waterLevel ?? "N/A"} %
AnimalCount    = ${sensorData.animalCount ?? "N/A"}
Surface        = ${sensorData.surface ?? "N/A"} m²
`.trim();
}

// ============================================================
// PROMPT CHAT VÉTÉRINAIRE
// ============================================================

function buildChatPrompt(question, context) {
  return `
Tu es un assistant vétérinaire expert en élevage de volailles.
Réponds en français, de manière claire et concise (3 phrases maximum).
Réponds directement à la question sans te présenter.

CONTEXTE DU POULAILLER :
- Nom            : ${context.poulaillerName}
- Nombre volailles: ${context.animalCount}
- Score de santé : ${context.lastScore}/100
- Niveau urgence : ${context.lastUrgency}
- Dernier diagnostic : ${context.lastDiagnostic}
- Température    : ${context.temperature ?? "N/A"} °C
- Humidité       : ${context.humidity ?? "N/A"} %
- Qualité de l'air: ${context.airQuality ?? "N/A"} %
- Niveau d'eau   : ${context.waterLevel ?? "N/A"} %
- Derniers conseils: ${context.lastAdvices ?? "Aucun"}

QUESTION : ${question}

Réponds uniquement en texte simple, sans JSON, sans markdown, sans listes à puces.
`.trim();
}

async function callCloudflare(model, payload, timeout) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout,
  });

  return response.data.result.response;
}

function normalizeUrgency(value) {
  if (!value) return "normal";
  const v = value.toString().toLowerCase();
  if (v.includes("critical") || v.includes("critique") || v === "high")
    return "critique";
  if (v.includes("attention") || v.includes("medium") || v.includes("warning"))
    return "attention";
  return "normal";
}

function mentionsDeath(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DEATH_KEYWORDS.some((kw) => lower.includes(kw));
}

function parseAIResponse(text, sensorData = {}) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Aucun JSON trouvé dans la réponse IA");

    const parsed = JSON.parse(match[0]);

    let healthScore =
      typeof parsed.healthScore === "number" ? parsed.healthScore : 70;
    healthScore = Math.max(0, Math.min(100, healthScore));

    let urgencyLevel = normalizeUrgency(parsed.urgencyLevel);

    const temperature = sensorData.temperature ?? 25;
    const airQuality = sensorData.airQualityPercent ?? 60;
    const waterLevel = sensorData.waterLevel ?? 60;

    const sensorsNormal =
      temperature >= 18 &&
      temperature <= 28 &&
      airQuality >= 40 &&
      waterLevel >= 20;

    const criticalSensors = airQuality < 20;
    const warningSensors =
      temperature < 15 || temperature > 31 || waterLevel < 20;

    let mortalityDetected = parsed?.detections?.mortalityDetected === true;
    let behaviorNormal = parsed?.detections?.behaviorNormal ?? true;

    if (mortalityDetected && !criticalSensors) {
      console.warn("[AI] Fausse détection de mortalité corrigée");
      mortalityDetected = false;

      if (mentionsDeath(parsed.diagnostic)) {
        parsed.diagnostic = warningSensors
          ? "Paramètres légèrement hors plage — surveillance recommandée."
          : "État général satisfaisant d'après les capteurs et l'image.";
        console.warn("[AI] Diagnostic nettoyé (mention mortalité supprimée)");
      }

      if (Array.isArray(parsed.advices)) {
        const cleaned = parsed.advices.filter((a) => !mentionsDeath(a));
        if (cleaned.length < parsed.advices.length) {
          console.warn("[AI] Conseils nettoyés (mention mortalité supprimée)");
        }
        parsed.advices =
          cleaned.length > 0
            ? cleaned
            : [
                "Surveiller le comportement des volailles",
                "Vérifier la ventilation",
                "Contrôler les capteurs régulièrement",
              ];
      }

      if (warningSensors) {
        urgencyLevel = "attention";
        healthScore = Math.max(healthScore, 55);
      } else if (sensorsNormal) {
        urgencyLevel = "normal";
        healthScore = Math.max(healthScore, 80);
      }
    }

    // --- Priorité capteurs ---
    if (criticalSensors) {
      urgencyLevel = "critique";
      healthScore = Math.min(healthScore <= 0 ? 30 : healthScore, 30);
    } else if (warningSensors) {
      urgencyLevel = "attention";
      healthScore = Math.min(healthScore <= 0 ? 60 : healthScore, 60);
    }

    // --- Protection finale ---
    if (sensorsNormal && !mortalityDetected && healthScore <= 0) {
      urgencyLevel = "normal";
      healthScore = 85;
    }

    urgencyLevel = normalizeUrgency(urgencyLevel);

    return {
      healthScore,
      urgencyLevel,
      diagnostic: parsed.diagnostic || "Analyse IA effectuée",
      detections: {
        mortalityDetected,
        behaviorNormal,
        densityOk: true,
        cleanEnvironment: true,
        ventilationAdequate: true,
      },
      advices:
        Array.isArray(parsed.advices) && parsed.advices.length > 0
          ? parsed.advices.slice(0, 3)
          : [
              "Surveillance continue",
              "Maintenance préventive",
              "Vérifier la ventilation",
            ],
    };
  } catch (err) {
    console.error("[AI] Erreur de parsing :", err.message);
    return analyzeWithSensorsOnly(sensorData);
  }
}

// APPEL GEMMA (modèle principal)

async function callGemma(imageBase64, sensorData) {
  const response = await callCloudflare(
    PRIMARY_MODEL,
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildAnalysisPrompt(sensorData) },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    },
    GEMMA_TIMEOUT,
  );

  return parseAIResponse(response, sensorData);
}

// APPEL LLAVA (modèle de secours)

async function callLlava(imageBase64, sensorData) {
  const response = await callCloudflare(
    FALLBACK_MODEL,
    {
      image: imageBase64,
      prompt: buildAnalysisPrompt(sensorData),
      max_tokens: 512,
    },
    LLAVA_TIMEOUT,
  );

  return parseAIResponse(response, sensorData);
}

// ANALYSE PRINCIPALE — Cloudflare AI (Gemma 3 → LLaVA → Capteurs)

async function analyzeWithCloudflareAI(
  imageBase64,
  sensorData = {},
  thresholds = {},
) {
  try {
    if (!USE_CLOUDFLARE) {
      console.warn("[AI] Cloudflare désactivé — fallback capteurs");
      return analyzeWithSensorsOnly(sensorData);
    }

    const clean = cleanBase64(imageBase64);

    if (!clean || clean.length < 100) {
      console.warn("[AI] Image absente ou invalide — fallback capteurs");
      return analyzeWithSensorsOnly(sensorData);
    }

    const compressed = await compressImage(clean);
    const sizeKb = getImageSizeKb(compressed);
    console.log(`[AI] Taille image finale : ${sizeKb} Ko`);

    // Tentative Gemma
    try {
      console.log("[AI] Tentative Gemma 3...");
      const result = await callGemma(compressed, sensorData);
      return {
        ...result,
        confidence: 85,
        imageQuality: { sizeKb, status: "optimized" },
      };
    } catch (err) {
      console.warn("[AI] Gemma échoué :", err.message);
    }

    // Tentative LLaVA
    if (sizeKb <= LLAVA_MAX_KB) {
      try {
        console.log("[AI] Tentative LLaVA...");
        const result = await callLlava(compressed, sensorData);
        return {
          ...result,
          confidence: 75,
          imageQuality: { sizeKb, status: "optimized" },
        };
      } catch (err) {
        console.warn("[AI] LLaVA échoué :", err.message);
      }
    }

    // Fallback capteurs
    console.warn("[AI] Tous les modèles ont échoué — fallback capteurs");
    return analyzeWithSensorsOnly(sensorData);
  } catch (err) {
    console.error("[AI] Erreur fatale analyzeWithCloudflareAI :", err.message);
    return analyzeWithSensorsOnly(sensorData);
  }
}

// CHATBOT VÉTÉRINAIRE — Gemma 3

async function chatWithGemma(question, context, history = []) {
  try {
    if (!USE_CLOUDFLARE) {
      return buildFallbackAnswer(question, context);
    }

    // Construire les messages avec historique
    const messages = [
      // Message système — rôle de l'assistant
      {
        role: "system",
        content: buildSystemPrompt(context),
      },
      // Historique de la conversation (max 6 derniers messages)
      ...history.slice(-6).map((msg) => ({
        role: msg.role, // "user" ou "assistant"
        content: msg.content,
      })),
      // Question actuelle
      {
        role: "user",
        content: question,
      },
    ];

    const response = await callCloudflare(
      PRIMARY_MODEL,
      { messages },
      CHAT_TIMEOUT,
    );

    if (!response || response.trim().length < 5) {
      return buildFallbackAnswer(question, context);
    }

    // Nettoyer la réponse (enlever markdown, JSON résiduel)
    const cleaned = response
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*?\}/g, "")
      .trim();

    return cleaned || buildFallbackAnswer(question, context);
  } catch (err) {
    console.error("[AI] Erreur chatWithGemma :", err.message);
    return buildFallbackAnswer(question, context);
  }
}

// RÉPONSE FALLBACK CHATBOT (si Cloudflare indisponible)

function buildFallbackAnswer(question, context) {
  const q = question.toLowerCase();

  if (q.includes("santé") || q.includes("état") || q.includes("etat")) {
    return `Le poulailler ${context.poulaillerName} affiche un score de santé de ${context.lastScore}/100 (niveau : ${context.lastUrgency}). ${context.lastDiagnostic}`;
  }

  if (q.includes("alerte") || q.includes("danger") || q.includes("urgent")) {
    if (context.lastUrgency === "critique")
      return "Niveau critique détecté — intervention immédiate recommandée. Vérifiez la ventilation et la qualité de l'air.";
    if (context.lastUrgency === "attention")
      return "Surveillance renforcée conseillée. Contrôlez les capteurs et observez le comportement des volailles.";
    return "Aucune alerte active. L'état du poulailler est stable.";
  }

  if (
    q.includes("conseil") ||
    q.includes("recommandation") ||
    q.includes("faire")
  ) {
    return (
      context.lastAdvices ||
      "Maintenez une surveillance régulière, vérifiez les capteurs et assurez une bonne ventilation."
    );
  }

  if (
    q.includes("température") ||
    q.includes("temperature") ||
    q.includes("chaud") ||
    q.includes("froid")
  ) {
    const temp = context.temperature;
    if (!temp)
      return "Aucune donnée de température disponible pour ce poulailler.";
    if (temp > 28)
      return `La température est élevée (${temp}°C). Activez la ventilation et vérifiez l'hydratation des volailles.`;
    if (temp < 18)
      return `La température est basse (${temp}°C). Vérifiez le système de chauffage et l'isolation du poulailler.`;
    return `La température est dans la plage normale (${temp}°C) — entre 18 et 28°C.`;
  }

  if (q.includes("eau") || q.includes("water")) {
    const wl = context.waterLevel;
    if (!wl) return "Aucune donnée de niveau d'eau disponible.";
    if (wl < 20)
      return `Le niveau d'eau est critique (${wl}%). Remplissez les abreuvoirs immédiatement.`;
    return `Le niveau d'eau est à ${wl}%, ce qui est suffisant.`;
  }

  return `Je suis l'assistant IA de Smart Poultry. ${context.poulaillerName} compte ${context.animalCount} volailles — score santé : ${context.lastScore}/100. ${context.lastDiagnostic}. Posez-moi une question sur la santé, les alertes ou les conseils.`;
}

async function handleCameraImage(poulaillerId, macAddress, imageBase64) {
  try {
    const cleanBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const base64Length = cleanBase64.length;
    const padding = (cleanBase64.match(/=/g) || []).length;
    const imageSizeKb = Math.round(((base64Length * 3) / 4 - padding) / 1024);

    if (imageSizeKb < 3) {
      console.warn(`[AI] Image trop petite (${imageSizeKb} Ko) — rejetée`);
      return;
    }

    console.log(
      `[AI] Image stockée — poulailler ${poulaillerId} (${imageSizeKb} Ko)`,
    );

    // Stocker dans pendingImages pour que awaitCameraImage() la récupère
    pendingImages.set(poulaillerId.toString().trim(), {
      image: cleanBase64,
      receivedAt: Date.now(),
    });

    // Auto-expiration après 60 secondes
    setTimeout(() => {
      if (pendingImages.has(poulaillerId.toString().trim())) {
        pendingImages.delete(poulaillerId.toString().trim());
        console.warn(`[AI] Image expirée pour le poulailler ${poulaillerId}`);
      }
    }, 60_000);
  } catch (err) {
    console.error("[AI] Erreur handleCameraImage:", err.message);
  }
}

//  Publier commande capture MQTT
async function publishCaptureTrigger(poulaillerId) {
  const { publishCameraCommand } = require("./mqttService");

  const success = await publishCameraCommand(poulaillerId);
  if (!success) {
    throw new Error("Échec envoi commande MQTT caméra");
  }

  return true;
}

function buildSystemPrompt(context) {
  const sensors = [
    context.temperature != null
      ? `Température : ${context.temperature}°C`
      : null,
    context.humidity != null ? `Humidité : ${context.humidity}%` : null,
    context.airQuality != null ? `Qualité air : ${context.airQuality}%` : null,
    context.waterLevel != null ? `Niveau eau : ${context.waterLevel}%` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `
Tu es un assistant vétérinaire expert en élevage de volailles.
Réponds en français, de manière claire et concise (maximum 3 phrases).
Réponds directement sans te présenter.
Ne génère jamais de JSON ni de markdown.

POULAILLER : ${context.poulaillerName} — ${context.animalCount} volailles
CAPTEURS : ${sensors || "Aucune donnée disponible"}
SCORE SANTÉ : ${context.lastScore != null ? `${context.lastScore}/100` : "Non disponible"}
URGENCE : ${context.lastUrgency ?? "Non disponible"}
DIAGNOSTIC : ${context.lastDiagnostic ?? "Aucune analyse disponible"}
CONSEILS : ${context.lastAdvices ?? "Aucun conseil disponible"}
`.trim();
}

module.exports = {
  analyzeWithCloudflareAI,
  chatWithGemma,
  publishCaptureTrigger,
  INTER_ANALYSIS_DELAY_MS,
  handleCameraImage,
};
