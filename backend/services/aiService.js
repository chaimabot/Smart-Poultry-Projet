// services/aiService.js
// CORRECTIONS :
//   1. Détection qualité image via sharp (variance pixel) AVANT d'envoyer à Gemma
//      → images floues/sombres détectées côté serveur, pas via le texte du diagnostic
//   2. analyzeWithSensorsOnly retourne detections: null (non évalué) et non des true par défaut
//   3. parseAIResponse : fallback null pour les détections si valeur absente (pas ?? true)
//   4. imageQuality.status propagé correctement dans le résultat final

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const sharp = require("sharp");

const { publishCameraCommand } = require("./mqttService");

const _CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const _CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const USE_CLOUDFLARE = !!(_CF_ACCOUNT_ID && _CF_API_TOKEN);

const PRIMARY_MODEL = "@cf/google/gemma-3-12b-it";
const FALLBACK_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

const GEMMA_TIMEOUT = 12000;
const CHAT_TIMEOUT = 20000;
const LLAVA_TIMEOUT = 10000;
const LLAVA_MAX_KB = 24;
const INTER_ANALYSIS_DELAY_MS = 5000;

// ✅ Seuils de qualité image (via analyse sharp)
const IMAGE_MIN_BRIGHTNESS = 20; // en dessous = trop sombre (0-255)
const IMAGE_MAX_BRIGHTNESS = 235; // au dessus = surexposé
const IMAGE_MIN_VARIANCE = 80; // en dessous = flou / image uniforme (0-65025)

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

// ✅ Stockage local des images en attente (utilisé par le cron)
const pendingImages = new Map();

// ─── Utilitaires base64 ─────────────────────────────────────────────────────

function cleanBase64(base64) {
  if (!base64) return null;
  return base64.includes(",") ? base64.split(",")[1] : base64;
}

function getImageSizeKb(base64) {
  return Math.round((base64.length * 3) / 4 / 1024);
}

// ─── Détection qualité image via sharp ─────────────────────────────────────
// Retourne { usable: bool, reason: string, brightness: number, variance: number }
// Méthode : on analyse les stats pixel (luminosité moyenne + variance)
// Une image floue a une faible variance (peu de contraste/détails)
// Une image sombre a une faible luminosité moyenne

async function assessImageQuality(base64) {
  try {
    const buffer = Buffer.from(base64, "base64");

    // Redimensionner à 64x64 pour accélérer l'analyse
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const n = pixels.length;

    // Luminosité moyenne
    const brightness = pixels.reduce((sum, p) => sum + p, 0) / n;

    // Variance (mesure de contraste / netteté)
    const variance =
      pixels.reduce((sum, p) => sum + Math.pow(p - brightness, 2), 0) / n;

    console.log(
      `[AI] Qualité image — Luminosité: ${brightness.toFixed(1)}/255, Variance: ${variance.toFixed(1)}`,
    );

    if (brightness < IMAGE_MIN_BRIGHTNESS) {
      return {
        usable: false,
        reason: "image trop sombre",
        brightness,
        variance,
      };
    }
    if (brightness > IMAGE_MAX_BRIGHTNESS) {
      return {
        usable: false,
        reason: "image surexposée",
        brightness,
        variance,
      };
    }
    if (variance < IMAGE_MIN_VARIANCE) {
      return {
        usable: false,
        reason: "image floue ou uniforme",
        brightness,
        variance,
      };
    }

    return { usable: true, reason: "ok", brightness, variance };
  } catch (err) {
    console.warn("[AI] assessImageQuality erreur:", err.message);
    // En cas d'erreur d'analyse, on laisse passer (ne pas bloquer)
    return {
      usable: true,
      reason: "analyse impossible",
      brightness: null,
      variance: null,
    };
  }
}

// ─── Compression image ──────────────────────────────────────────────────────

async function compressImage(base64) {
  if (getImageSizeKb(base64) <= LLAVA_MAX_KB) {
    console.log("[AI] Image déjà dans les limites — pas de compression");
    return base64;
  }

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

  console.warn(
    "[AI] Limite de compression atteinte — envoi du meilleur résultat",
  );
  return lastCompressed.toString("base64");
}

// ─── Fallback capteurs uniquement ──────────────────────────────────────────
// ✅ detections toutes à null : non évaluées (pas de vision)

function analyzeWithSensorsOnly(sensorData = {}) {
  let score = 85;
  let urgency = "normal";
  const issues = [];

  const airQuality = sensorData.airQualityPercent ?? null;
  const temperature = sensorData.temperature ?? null;
  const waterLevel = sensorData.waterLevel ?? null;

  if (airQuality !== null && airQuality < 20) {
    score -= 40;
    urgency = "critique";
    issues.push("qualité d'air critique");
  } else if (airQuality !== null && airQuality < 40) {
    score -= 20;
    if (urgency !== "critique") urgency = "attention";
    issues.push("qualité d'air dégradée");
  }

  if (temperature !== null && temperature > 31) {
    score -= 20;
    urgency = "critique";
    issues.push("surchauffe détectée");
  } else if (temperature !== null && temperature < 15) {
    score -= 15;
    if (urgency !== "critique") urgency = "attention";
    issues.push("température trop basse");
  }

  if (waterLevel !== null && waterLevel < 20) {
    score -= 15;
    if (urgency !== "critique") urgency = "attention";
    issues.push("niveau d'eau insuffisant");
  }

  score = Math.max(0, Math.min(100, score));

  let diagnostic;
  if (issues.length > 0) {
    diagnostic = `Alerte capteurs : ${issues.join(", ")}. Aucune image disponible pour l'évaluation visuelle.`;
  } else if (temperature === null && airQuality === null) {
    diagnostic =
      "Aucune donnée capteur ni image disponible. Vérifiez la connexion des équipements.";
  } else {
    diagnostic =
      "Capteurs dans les plages normales. Aucune image disponible pour l'évaluation visuelle.";
  }

  return {
    healthScore: score,
    urgencyLevel: urgency,
    diagnostic,
    confidence: 50,
    imageAvailable: false,
    imageUsable: false,
    // ✅ null = non évalué (pas true par défaut)
    detections: {
      mortalityDetected: null,
      behaviorNormal: null,
      densityOk: null,
      cleanEnvironment: null,
      ventilationAdequate: null,
    },
    advices: buildSensorAdvices(sensorData),
    imageQuality: { sizeKb: 0, status: "poor" },
  };
}

// ─── Résultat pour image inexploitable (floue/sombre) ─────────────────────
// Différent de analyzeWithSensorsOnly : l'image EXISTE mais est inutilisable

function buildPoorImageResult(sensorData = {}, reason = "image floue") {
  const sensorResult = analyzeWithSensorsOnly(sensorData);
  return {
    ...sensorResult,
    diagnostic: `Image inexploitable (${reason}). ${sensorResult.diagnostic}`,
    imageAvailable: true, // l'image existe physiquement
    imageUsable: false, // mais n'a pas pu être analysée
    imageQuality: { sizeKb: 0, status: "poor", reason },
  };
}

// ─── Conseils capteurs ──────────────────────────────────────────────────────

function buildSensorAdvices(sensorData = {}) {
  const advices = [];
  const { temperature, humidity, airQualityPercent, waterLevel } = sensorData;

  if (
    airQualityPercent !== null &&
    airQualityPercent !== undefined &&
    airQualityPercent < 40
  ) {
    advices.push(
      `Augmentez la ventilation — qualité d'air à ${airQualityPercent}% (seuil critique : 20%).`,
    );
  }
  if (temperature !== null && temperature !== undefined && temperature > 28) {
    advices.push(
      `Température élevée (${temperature}°C) — vérifiez la ventilation et l'hydratation des volailles.`,
    );
  } else if (
    temperature !== null &&
    temperature !== undefined &&
    temperature < 18
  ) {
    advices.push(
      `Température basse (${temperature}°C) — vérifiez le chauffage du poulailler.`,
    );
  }
  if (waterLevel !== null && waterLevel !== undefined && waterLevel < 30) {
    advices.push(
      `Niveau d'eau à ${waterLevel}% — remplissez les abreuvoirs rapidement.`,
    );
  }
  if (advices.length === 0) {
    advices.push(
      "Capteurs stables. Repositionnez la caméra ESP32 et relancez une analyse avec image.",
    );
  }
  return advices;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(sensorData = {}) {
  return `You are an expert poultry farm veterinarian. Analyze this farm image.

CRITICAL RULES:
- Look at the image carefully. If it is blurry, out of focus, overexposed, too dark, or shows no animals: set imageUsable=false
- If imageUsable=false: all detections must be null, healthScore must be based ONLY on sensors
- mortalityDetected=true ONLY with 90%+ certainty of visible dead birds on the ground
- Sleeping or resting birds are NOT dead
- urgencyLevel must be exactly one of: "normal" | "attention" | "critique"
- All text in French. Diagnostic max 2 sentences. Be specific, not generic.

Respond ONLY with this exact JSON format. No markdown, no text outside JSON:
{
  "healthScore": 85,
  "urgencyLevel": "normal",
  "imageUsable": true,
  "diagnostic": "Diagnostic précis en français.",
  "detections": {
    "mortalityDetected": false,
    "behaviorNormal": true,
    "densityOk": true,
    "cleanEnvironment": true,
    "ventilationAdequate": true
  },
  "advices": ["conseil précis 1", "conseil précis 2", "conseil précis 3"]
}

If imageUsable=false, respond with:
{
  "healthScore": <based only on sensors>,
  "urgencyLevel": "<based only on sensors>",
  "imageUsable": false,
  "diagnostic": "Image inexploitable — <raison précise>. <diagnostic capteurs>.",
  "detections": {
    "mortalityDetected": null,
    "behaviorNormal": null,
    "densityOk": null,
    "cleanEnvironment": null,
    "ventilationAdequate": null
  },
  "advices": ["<conseil basé uniquement sur capteurs>"]
}

Sensor readings (use these if image is unusable):
Temperature    = ${sensorData.temperature ?? "N/A"} °C   (normal: 18-28°C)
Humidity       = ${sensorData.humidity ?? "N/A"} %       (normal: 50-70%)
AirQuality     = ${sensorData.airQualityPercent ?? "N/A"} %   (critical if <20%)
WaterLevel     = ${sensorData.waterLevel ?? "N/A"} %     (critical if <20%)
AnimalCount    = ${sensorData.animalCount ?? "N/A"}
Surface        = ${sensorData.surface ?? "N/A"} m²
`.trim();
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

  return `Tu es un assistant vétérinaire expert en élevage de volailles.
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

// ─── Appel Cloudflare générique ─────────────────────────────────────────────

async function callCloudflare(model, payload, timeout) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${_CF_ACCOUNT_ID}/ai/run/${model}`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${_CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout,
  });

  return response.data.result.response;
}

// ─── Normalisation ──────────────────────────────────────────────────────────

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

// ─── Parse réponse IA ───────────────────────────────────────────────────────

function parseAIResponse(text, sensorData = {}) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Aucun JSON trouvé dans la réponse IA");

    const parsed = JSON.parse(match[0]);

    // ✅ Si le modèle lui-même dit que l'image est inexploitable
    if (parsed.imageUsable === false) {
      console.warn(
        "[AI] Modèle signale image inexploitable via imageUsable=false",
      );
      return {
        ...analyzeWithSensorsOnly(sensorData),
        diagnostic:
          parsed.diagnostic || "Image inexploitable selon le modèle IA.",
        imageAvailable: true,
        imageUsable: false,
        imageQuality: {
          sizeKb: 0,
          status: "poor",
          reason: "signalé par le modèle",
        },
      };
    }

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

    // ✅ Bloque les faux positifs de mortalité si capteurs normaux
    let mortalityDetected = parsed.detections?.mortalityDetected ?? null;
    if (mortalityDetected === true && sensorsNormal) {
      const diagText = (parsed.diagnostic || "").toLowerCase();
      if (!mentionsDeath(diagText)) {
        console.warn(
          "[AI] Mortalité bloquée — capteurs normaux et diagnostic ne confirme pas",
        );
        mortalityDetected = false;
      }
    }

    // Ajuste urgence selon capteurs
    if (criticalSensors && urgencyLevel === "normal") urgencyLevel = "critique";
    else if (warningSensors && urgencyLevel === "normal")
      urgencyLevel = "attention";

    return {
      healthScore,
      urgencyLevel,
      diagnostic: parsed.diagnostic || "Analyse effectuée.",
      imageAvailable: true,
      imageUsable: true,
      detections: {
        mortalityDetected,
        // ✅ null si absent dans la réponse — pas true par défaut
        behaviorNormal: parsed.detections?.behaviorNormal ?? null,
        densityOk: parsed.detections?.densityOk ?? null,
        cleanEnvironment: parsed.detections?.cleanEnvironment ?? null,
        ventilationAdequate: parsed.detections?.ventilationAdequate ?? null,
      },
      advices:
        Array.isArray(parsed.advices) && parsed.advices.length > 0
          ? parsed.advices
          : buildSensorAdvices(sensorData),
    };
  } catch (err) {
    console.error("[AI] parseAIResponse error:", err.message);
    return analyzeWithSensorsOnly(sensorData);
  }
}

// ─── Appels modèles ─────────────────────────────────────────────────────────

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

// ─── Analyse principale ─────────────────────────────────────────────────────

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

    // ✅ ÉTAPE 1 : Évaluation qualité image via sharp AVANT d'appeler Gemma
    const quality = await assessImageQuality(clean);
    console.log(
      `[AI] Qualité image : ${quality.usable ? "✓ exploitable" : `✗ ${quality.reason}`}`,
    );

    if (!quality.usable) {
      console.warn(
        `[AI] Image inexploitable (${quality.reason}) — pas d'envoi à Gemma`,
      );
      return buildPoorImageResult(sensorData, quality.reason);
    }

    // ✅ ÉTAPE 2 : Compression pour LLaVA si nécessaire
    const compressed = await compressImage(clean);
    const sizeKb = getImageSizeKb(compressed);
    console.log(`[AI] Taille image finale : ${sizeKb} Ko`);

    // ✅ ÉTAPE 3 : Envoi à Gemma
    try {
      console.log("[AI] Tentative Gemma 3...");
      const result = await callGemma(compressed, sensorData);

      // Si Gemma dit lui-même que l'image est inexploitable, on respecte son verdict
      if (!result.imageUsable) {
        return {
          ...result,
          confidence: 50,
          imageQuality: { sizeKb, status: "poor", reason: "signalé par Gemma" },
        };
      }

      return {
        ...result,
        confidence: 85,
        imageQuality: { sizeKb, status: "optimized" },
      };
    } catch (err) {
      console.warn("[AI] Gemma échoué :", err.message);
    }

    // ✅ ÉTAPE 4 : Fallback LLaVA
    if (sizeKb <= LLAVA_MAX_KB) {
      try {
        console.log("[AI] Tentative LLaVA...");
        const result = await callLlava(compressed, sensorData);

        if (!result.imageUsable) {
          return {
            ...result,
            confidence: 50,
            imageQuality: {
              sizeKb,
              status: "poor",
              reason: "signalé par LLaVA",
            },
          };
        }

        return {
          ...result,
          confidence: 75,
          imageQuality: { sizeKb, status: "optimized" },
        };
      } catch (err) {
        console.warn("[AI] LLaVA échoué :", err.message);
      }
    }

    console.warn("[AI] Tous les modèles ont échoué — fallback capteurs");
    return analyzeWithSensorsOnly(sensorData);
  } catch (err) {
    console.error("[AI] Erreur fatale analyzeWithCloudflareAI :", err.message);
    return analyzeWithSensorsOnly(sensorData);
  }
}

// ─── Chat vétérinaire ───────────────────────────────────────────────────────

async function chatWithGemma(question, context, history = []) {
  try {
    if (!USE_CLOUDFLARE) {
      console.warn("[AI] Cloudflare désactivé — fallback");
      return buildFallbackAnswer(question, context);
    }

    const messages = [
      { role: "system", content: buildSystemPrompt(context) },
      ...history
        .slice(-6)
        .map((msg) => ({ role: msg.role, content: msg.content })),
      { role: "user", content: question },
    ];

    const response = await callCloudflare(
      PRIMARY_MODEL,
      { messages },
      CHAT_TIMEOUT,
    );

    if (!response || response.trim().length < 5) {
      return buildFallbackAnswer(question, context);
    }

    const cleaned = response
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*?\}/g, "")
      .trim();

    return cleaned || buildFallbackAnswer(question, context);
  } catch (err) {
    console.error("[AI] Erreur chatWithGemma:", err.message);
    return buildFallbackAnswer(question, context);
  }
}

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

// ─── Gestion image caméra ────────────────────────────────────────────────────

async function handleCameraImage(poulaillerId, macAddress, imageBase64) {
  try {
    const cleanB64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const base64Length = cleanB64.length;
    const padding = (cleanB64.match(/=/g) || []).length;
    const imageSizeKb = Math.round(((base64Length * 3) / 4 - padding) / 1024);

    if (imageSizeKb < 3) {
      console.warn(`[AI] Image trop petite (${imageSizeKb} Ko) — rejetée`);
      return;
    }

    console.log(
      `[AI] Image stockée — poulailler ${poulaillerId} (${imageSizeKb} Ko)`,
    );

    const key = poulaillerId.toString().trim();
    pendingImages.set(key, { image: cleanB64, receivedAt: Date.now() });

    setTimeout(() => {
      if (pendingImages.has(key)) {
        pendingImages.delete(key);
        console.warn(`[AI] Image expirée pour le poulailler ${poulaillerId}`);
      }
    }, 60_000);
  } catch (err) {
    console.error("[AI] Erreur handleCameraImage:", err.message);
  }
}

// ─── Déclenchement capture MQTT ─────────────────────────────────────────────

async function publishCaptureTrigger(poulaillerId, requestId) {
  if (!requestId) {
    throw new Error("[AI] publishCaptureTrigger : requestId requis");
  }

  const Camera = require("../models/Camera");

  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: "associated",
  });

  if (!camera) {
    throw new Error("Aucune caméra active associée à ce poulailler");
  }

  const success = await publishCameraCommand(poulaillerId, requestId);
  return success;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  analyzeWithCloudflareAI,
  chatWithGemma,
  publishCaptureTrigger,
  handleCameraImage,
  pendingImages,
  INTER_ANALYSIS_DELAY_MS,
};
