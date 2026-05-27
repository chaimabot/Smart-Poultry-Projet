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

const IMAGE_MIN_BRIGHTNESS = 20;
const IMAGE_MAX_BRIGHTNESS = 235;
const IMAGE_MIN_VARIANCE = 80;

// Fraîcheur capteurs : données ignorées si > 10 min
const SENSOR_STALE_MS = 10 * 60 * 1000;

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

const pendingImages = new Map();

// ─── Utilitaires base64 ─────────────────────────────────────────────────────

function cleanBase64(base64) {
  if (!base64) return null;
  return base64.includes(",") ? base64.split(",")[1] : base64;
}

function getImageSizeKb(base64) {
  return Math.round((base64.length * 3) / 4 / 1024);
}

// ─── Guard valeur capteur ─────────────────────────────────────────────────

function isValidSensorValue(value, min = 0, max = 100) {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  if (!isFinite(n) || isNaN(n)) return false;
  if (n < min || n > max) return false;
  return true;
}

// ─── Extraction capteurs frais ─────────────────────────────────────────────

function extractFreshSensors(poulailler) {
  const monitoring = poulailler?.lastMonitoring;
  const timestamp = monitoring?.timestamp
    ? new Date(monitoring.timestamp).getTime()
    : 0;
  const isFresh = timestamp > 0 && Date.now() - timestamp < SENSOR_STALE_MS;

  if (!isFresh) {
    console.log(
      `[AI] Capteurs obsolètes/absents (timestamp: ${
        timestamp ? new Date(timestamp).toISOString() : "jamais"
      }) — toutes valeurs nullifiées`,
    );
    return {
      temperature: null,
      humidity: null,
      airQualityPercent: null,
      waterLevel: null,
      animalCount: poulailler?.animalCount ?? null,
      surface: poulailler?.surface ?? null,
    };
  }

  const safeNumber = (val, min, max) => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    if (!isFinite(n) || isNaN(n)) return null;
    if (n < min || n > max) return null;
    return n;
  };

  console.log(
    `[AI] Capteurs frais ✓ (timestamp: ${new Date(timestamp).toISOString()})`,
  );

  return {
    temperature: safeNumber(monitoring.temperature, -10, 60),
    humidity: safeNumber(monitoring.humidity, 0, 100),
    airQualityPercent: safeNumber(monitoring.airQualityPercent, 0, 100),
    waterLevel: safeNumber(monitoring.waterLevel, 1, 100),
    animalCount: poulailler?.animalCount ?? null,
    surface: poulailler?.surface ?? null,
  };
}

// ─── Détection qualité image via sharp ─────────────────────────────────────

async function assessImageQuality(base64) {
  try {
    const buffer = Buffer.from(base64, "base64");
    const { data } = await sharp(buffer)
      .resize(64, 64, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const n = pixels.length;
    const brightness = pixels.reduce((sum, p) => sum + p, 0) / n;
    const variance =
      pixels.reduce((sum, p) => sum + Math.pow(p - brightness, 2), 0) / n;

    console.log(
      `[AI] Qualité image — Luminosité: ${brightness.toFixed(1)}/255, Variance: ${variance.toFixed(1)}`,
    );

    if (brightness < IMAGE_MIN_BRIGHTNESS)
      return {
        usable: false,
        reason: "image trop sombre",
        brightness,
        variance,
      };
    if (brightness > IMAGE_MAX_BRIGHTNESS)
      return {
        usable: false,
        reason: "image surexposée",
        brightness,
        variance,
      };
    if (variance < IMAGE_MIN_VARIANCE)
      return {
        usable: false,
        reason: "image floue ou uniforme",
        brightness,
        variance,
      };

    return { usable: true, reason: "ok", brightness, variance };
  } catch (err) {
    console.warn("[AI] assessImageQuality erreur:", err.message);
    return {
      usable: true,
      reason: "analyse impossible",
      brightness: null,
      variance: null,
    };
  }
}

// ─── Compression image ─────────────────────────────────────────────────────

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

// ─── Conseils capteurs ─────────────────────────────────────────────────────

function buildSensorAdvices(sensorData = {}) {
  const advices = [];
  const { temperature, humidity, airQualityPercent, waterLevel } = sensorData;

  if (isValidSensorValue(airQualityPercent, 0, 100)) {
    if (airQualityPercent < 20) {
      advices.push(
        "Ventilation insuffisante — augmentez immédiatement le débit d'air du poulailler.",
      );
    } else if (airQualityPercent < 40) {
      advices.push(
        "Qualité de l'air dégradée — vérifiez les extracteurs et l'aération des parois.",
      );
    }
  }

  if (isValidSensorValue(temperature, -10, 60)) {
    if (temperature > 31) {
      advices.push(
        "Température excessive — activez le refroidissement et augmentez la ventilation en urgence.",
      );
    } else if (temperature > 28) {
      advices.push(
        "Température légèrement élevée — surveillez le confort thermique des volailles et l'hydratation.",
      );
    } else if (temperature < 15) {
      advices.push(
        "Température trop basse — vérifiez le système de chauffage et l'isolation du bâtiment.",
      );
    } else if (temperature < 18) {
      advices.push(
        "Température en dessous de la plage optimale — contrôlez le chauffage d'appoint.",
      );
    }
  }

  if (isValidSensorValue(humidity, 0, 100)) {
    if (humidity > 80) {
      advices.push(
        "Humidité excessive — risque bactérien élevé, améliorez la ventilation et changez la litière.",
      );
    } else if (humidity < 30) {
      advices.push(
        "Humidité insuffisante — vérifiez les abreuvoirs et envisagez une brumisation légère.",
      );
    }
  }

  if (isValidSensorValue(waterLevel, 1, 100)) {
    if (waterLevel < 20) {
      advices.push(
        "Niveau d'abreuvement critique — remplissez les abreuvoirs immédiatement.",
      );
    } else if (waterLevel < 40) {
      advices.push(
        "Niveau d'abreuvement bas — planifiez un remplissage dans les prochaines heures.",
      );
    }
  }

  const hasAnyValid =
    isValidSensorValue(temperature, -10, 60) ||
    isValidSensorValue(humidity, 0, 100) ||
    isValidSensorValue(airQualityPercent, 0, 100) ||
    isValidSensorValue(waterLevel, 1, 100);

  if (advices.length === 0 && hasAnyValid) {
    advices.push(
      "Paramètres environnementaux dans les plages normales — maintenez la surveillance habituelle.",
    );
  }

  if (advices.length === 0) {
    advices.push(
      "Aucune donnée capteur disponible — vérifiez la connexion du module de surveillance.",
    );
    advices.push(
      "Repositionnez la caméra ESP32 pour obtenir une image exploitable lors de la prochaine analyse.",
    );
  }

  return advices;
}

// ─── Fallback capteurs uniquement ─────────────────────────────────────────

function analyzeWithSensorsOnly(sensorData = {}) {
  const airQuality = sensorData.airQualityPercent ?? null;
  const temperature = sensorData.temperature ?? null;
  const waterLevel = sensorData.waterLevel ?? null;
  const humidity = sensorData.humidity ?? null;

  const hasAnyValid =
    isValidSensorValue(temperature, -10, 60) ||
    isValidSensorValue(humidity, 0, 100) ||
    isValidSensorValue(airQuality, 0, 100) ||
    isValidSensorValue(waterLevel, 1, 100);

  if (!hasAnyValid) {
    return {
      healthScore: null,
      urgencyLevel: "inconnu",
      diagnostic:
        "Aucune donnée capteur ni image disponible. Vérifiez la connexion du module de surveillance et de la caméra.",
      confidence: 0,
      imageAvailable: false,
      imageUsable: false,
      detections: {
        mortalityDetected: null,
        behaviorNormal: null,
        nombreMorts: null,
      },
      comptage: null,
      maladie_suspectee: null,
      advices: buildSensorAdvices(sensorData),
      imageQuality: { sizeKb: 0, status: "poor" },
    };
  }

  let score = 85;
  let urgency = "normal";
  const issues = [];

  if (isValidSensorValue(airQuality, 0, 100)) {
    if (airQuality < 20) {
      score -= 40;
      urgency = "critique";
      issues.push("qualité d'air critique");
    } else if (airQuality < 40) {
      score -= 20;
      if (urgency !== "critique") urgency = "attention";
      issues.push("qualité d'air dégradée");
    }
  }

  if (isValidSensorValue(temperature, -10, 60)) {
    if (temperature > 31) {
      score -= 20;
      urgency = "critique";
      issues.push("surchauffe détectée");
    } else if (temperature < 15) {
      score -= 15;
      if (urgency !== "critique") urgency = "attention";
      issues.push("température trop basse");
    }
  }

  if (isValidSensorValue(waterLevel, 1, 100)) {
    if (waterLevel < 20) {
      score -= 15;
      if (urgency !== "critique") urgency = "attention";
      issues.push("niveau d'abreuvement insuffisant");
    }
  }

  if (isValidSensorValue(humidity, 0, 100)) {
    if (humidity > 80) {
      score -= 10;
      if (urgency !== "critique") urgency = "attention";
      issues.push("humidité excessive");
    }
  }

  score = Math.max(0, Math.min(100, score));

  const diagnostic =
    issues.length > 0
      ? `Anomalies environnementales détectées : ${issues.join(", ")}. Évaluation visuelle indisponible — image absente ou inexploitable.`
      : "Paramètres environnementaux dans les plages normales. Évaluation visuelle indisponible — relancez une analyse avec image.";

  return {
    healthScore: score,
    urgencyLevel: urgency,
    diagnostic,
    confidence: 50,
    imageAvailable: false,
    imageUsable: false,
    detections: {
      mortalityDetected: null,
      behaviorNormal: null,
      nombreMorts: null,
    },
    comptage: null,
    maladie_suspectee: null,
    advices: buildSensorAdvices(sensorData),
    imageQuality: { sizeKb: 0, status: "poor" },
  };
}

// ─── Résultat pour image inexploitable ─────────────────────────────────────

function buildPoorImageResult(sensorData = {}, reason = "image floue") {
  const sensorResult = analyzeWithSensorsOnly(sensorData);
  const hasAnyValid =
    isValidSensorValue(sensorData.temperature, -10, 60) ||
    isValidSensorValue(sensorData.humidity, 0, 100) ||
    isValidSensorValue(sensorData.airQualityPercent, 0, 100) ||
    isValidSensorValue(sensorData.waterLevel, 1, 100);

  let advices;
  if (hasAnyValid) {
    advices = sensorResult.advices;
  } else {
    advices = [
      "Vérifiez l'éclairage du poulailler avant de relancer une analyse — une luminosité suffisante est nécessaire pour la caméra.",
      "Assurez-vous que la caméra ESP32 est correctement positionnée et que l'objectif est propre.",
      "Vérifiez la connexion du module de surveillance pour rétablir les données capteurs.",
    ];
  }

  return {
    ...sensorResult,
    diagnostic: sensorResult.diagnostic.startsWith("Aucune donnée")
      ? sensorResult.diagnostic
      : `Image inexploitable (${reason}). ${sensorResult.diagnostic}`,
    imageAvailable: true,
    imageUsable: false,
    imageQuality: { sizeKb: 0, status: "poor", reason },
    advices,
  };
}

// ─── Prompts ───────────────────────────────────────────────────────────────

function buildAnalysisPrompt(sensorData = {}) {
  return `You are an expert poultry farm veterinarian. Analyze this farm image.

CRITICAL RULES:
- Look at the image carefully. If it is blurry, out of focus, overexposed, too dark, or shows no animals: set imageUsable=false
- If imageUsable=false: all detections must be null, healthScore must be based ONLY on sensors, comptage and maladie_suspectee must be null/empty
- Count the EXACT number of dead birds visible on the ground. Set nombreMorts to this number (0 if none visible).
- Count the EXACT number of live birds visible. Set comptage.estimation to this number.
- Sleeping or resting birds are NOT dead — count them as live.
- mortalityDetected=true ONLY if nombreMorts > 0.
- Detect any visible clinical signs of disease (diarrhea, respiratory distress, swelling, abnormal feathers, etc.).
- urgencyLevel must be exactly one of: "normal" | "attention" | "critique"
- All text in French. Diagnostic max 2 sentences. Be specific, not generic.
- NEVER include raw numeric sensor values in diagnostic or advices text.
- Write advices as professional veterinary recommendations only.
- Only generate an advice about water level if WaterLevel sensor value is explicitly provided (not N/A).
- Only generate an advice about temperature if Temperature sensor value is explicitly provided (not N/A).

Respond ONLY with this exact JSON format. No markdown, no text outside JSON:
{
  "healthScore": 85,
  "urgencyLevel": "normal",
  "imageUsable": true,
  "diagnostic": "Diagnostic précis en français.",
  "detections": {
    "mortalityDetected": false,
    "behaviorNormal": true,
    "nombreMorts": 0
  },
  "comptage": {
    "estimation": 42,
    "fiabilite": "bonne",
    "note": "Troupeau bien regroupé, comptage fiable."
  },
  "maladie_suspectee": {
    "suspicion": false,
    "maladie_probable": null,
    "signes_observes": [],
    "urgence_veterinaire": false,
    "confiance": null
  },
  "advices": ["conseil vétérinaire professionnel 1", "conseil 2", "conseil 3"]
}

If imageUsable=false:
{
  "healthScore": <based only on available sensors>,
  "urgencyLevel": "<based only on available sensors>",
  "imageUsable": false,
  "diagnostic": "Image inexploitable — <raison précise>. <diagnostic capteurs professionnel>.",
  "detections": {
    "mortalityDetected": null,
    "behaviorNormal": null,
    "nombreMorts": null
  },
  "comptage": null,
  "maladie_suspectee": null,
  "advices": ["conseil professionnel basé uniquement sur capteurs disponibles"]
}

Sensor readings (N/A means sensor not connected — DO NOT generate advice for N/A sensors):
Temperature    = ${isValidSensorValue(sensorData.temperature, -10, 60) ? sensorData.temperature + " °C" : "N/A"}   (normal: 18-28°C)
Humidity       = ${isValidSensorValue(sensorData.humidity, 0, 100) ? sensorData.humidity + " %" : "N/A"}           (normal: 40-70%)
AirQuality     = ${isValidSensorValue(sensorData.airQualityPercent, 0, 100) ? sensorData.airQualityPercent + " %" : "N/A"}   (critical if <20%)
WaterLevel     = ${isValidSensorValue(sensorData.waterLevel, 1, 100) ? sensorData.waterLevel + " %" : "N/A"}       (critical if <20%)
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
Ne mentionne jamais de valeurs numériques brutes des capteurs — parle uniquement en termes qualitatifs (normal, élevé, bas, critique).
Ne génère jamais de conseil sur un capteur dont la valeur est absente.

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

function extractJsonCandidate(text) {
  if (!text) return null;

  // 1) Tente d'extraire un bloc JSON complet basé sur les accolades.
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(firstBrace, i + 1);
      }
    }
  }

  return null;
}

function tryRepairJsonLike(text) {
  // Réparation minimaliste : enlève du texte après le dernier '}' du candidat,
  // et nettoie quelques erreurs fréquentes (virgules en trop/trailling).
  if (!text || typeof text !== "string") return text;

  // Retire les backticks/markdown potentiels.
  let cleaned = text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .trim();

  // Si le texte contient plusieurs objets, garde le premier.
  const candidate = extractJsonCandidate(cleaned);
  if (candidate) cleaned = candidate;

  // Retire une éventuelle virgule avant une accolade/une liste (JSON trailing comma).
  cleaned = cleaned.replace(/,\s*(\})/g, "$1");
  cleaned = cleaned.replace(/,\s*(\])/g, "$1");

  return cleaned;
}

function parseAIResponse(text, sensorData = {}) {
  // Supporte les réponses JSON mal formatées (Gemma peut renvoyer ponctuation/texte parasite)
  // Objectif : extraire un objet JSON valide autant que possible.

  try {
    const candidate0 = extractJsonCandidate(text);
    if (!candidate0) throw new Error("Aucun JSON trouvé dans la réponse IA");

    const candidate = tryRepairJsonLike(candidate0);
    const parsed = JSON.parse(candidate);

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

    const temperature = sensorData.temperature ?? null;
    const airQuality = sensorData.airQualityPercent ?? null;
    const waterLevel = sensorData.waterLevel ?? null;

    const sensorsNormal =
      (!isValidSensorValue(temperature, -10, 60) ||
        (temperature >= 18 && temperature <= 28)) &&
      (!isValidSensorValue(airQuality, 0, 100) || airQuality >= 40) &&
      (!isValidSensorValue(waterLevel, 1, 100) || waterLevel >= 20);

    const criticalSensors =
      isValidSensorValue(airQuality, 0, 100) && airQuality < 20;
    const warningSensors =
      (isValidSensorValue(temperature, -10, 60) &&
        (temperature < 15 || temperature > 31)) ||
      (isValidSensorValue(waterLevel, 1, 100) && waterLevel < 20);

    let mortalityDetected = parsed.detections?.mortalityDetected ?? null;
    let nombreMorts = parsed.detections?.nombreMorts ?? null;

    if (nombreMorts !== null && nombreMorts !== undefined) {
      const n = Number(nombreMorts);
      if (Number.isFinite(n) && n >= 0) {
        nombreMorts = Math.round(n);
        if (mortalityDetected === null && nombreMorts > 0)
          mortalityDetected = true;
        if (mortalityDetected === true && nombreMorts === 0)
          mortalityDetected = false;
      } else {
        nombreMorts = null;
      }
    }

    if (mortalityDetected === true && sensorsNormal) {
      const diagText = (parsed.diagnostic || "").toLowerCase();
      if (
        !mentionsDeath(diagText) &&
        (nombreMorts === null || nombreMorts === 0)
      ) {
        console.warn(
          "[AI] Mortalité bloquée — capteurs normaux et aucun mort confirmé",
        );
        mortalityDetected = false;
        nombreMorts = 0;
      }
    }

    if (criticalSensors && urgencyLevel === "normal") urgencyLevel = "critique";
    else if (warningSensors && urgencyLevel === "normal")
      urgencyLevel = "attention";

    const aiAdvices =
      Array.isArray(parsed.advices) && parsed.advices.length > 0
        ? parsed.advices
        : null;

    let comptage = null;
    if (parsed.comptage && typeof parsed.comptage === "object") {
      const est = Number(parsed.comptage.estimation);
      comptage = {
        estimation: Number.isFinite(est) ? est : null,
        fiabilite: ["bonne", "moyenne", "faible"].includes(
          parsed.comptage.fiabilite,
        )
          ? parsed.comptage.fiabilite
          : null,
        note: parsed.comptage.note || null,
      };
    }

    let maladie = null;
    if (
      parsed.maladie_suspectee &&
      typeof parsed.maladie_suspectee === "object"
    ) {
      const s = parsed.maladie_suspectee;
      maladie = {
        suspicion: s.suspicion === true,
        maladie_probable: s.maladie_probable || null,
        signes_observes: Array.isArray(s.signes_observes)
          ? s.signes_observes.filter((x) => typeof x === "string")
          : [],
        urgence_veterinaire: s.urgence_veterinaire === true,
        confiance: ["faible", "moyenne", "élevée"].includes(s.confiance)
          ? s.confiance
          : null,
      };
    }

    return {
      healthScore,
      urgencyLevel,
      diagnostic: parsed.diagnostic || "Analyse effectuée.",
      imageAvailable: true,
      imageUsable: true,
      detections: {
        mortalityDetected,
        behaviorNormal: parsed.detections?.behaviorNormal ?? null,
        nombreMorts,
      },
      comptage,
      maladie_suspectee: maladie,
      advices: aiAdvices || buildSensorAdvices(sensorData),
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

    const compressed = await compressImage(clean);
    const sizeKb = getImageSizeKb(compressed);
    console.log(`[AI] Taille image finale : ${sizeKb} Ko`);

    try {
      console.log("[AI] Tentative Gemma 3...");
      const result = await callGemma(compressed, sensorData);
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
      return "La température est élevée. Activez la ventilation et vérifiez l'hydratation des volailles.";
    if (temp < 18)
      return "La température est basse. Vérifiez le système de chauffage et l'isolation du poulailler.";
    return "La température est dans la plage normale — entre 18 et 28°C.";
  }
  if (q.includes("eau") || q.includes("water")) {
    const wl = context.waterLevel;
    if (!wl) return "Aucune donnée de niveau d'eau disponible.";
    if (wl < 20)
      return "Le niveau d'abreuvement est critique — remplissez les abreuvoirs immédiatement.";
    return "Le niveau d'abreuvement est suffisant.";
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
  return publishCameraCommand(poulaillerId, requestId);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  analyzeWithCloudflareAI,
  chatWithGemma,
  publishCaptureTrigger,
  handleCameraImage,
  extractFreshSensors,
  pendingImages,
  INTER_ANALYSIS_DELAY_MS,
};
