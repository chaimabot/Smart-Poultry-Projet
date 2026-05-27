// services/aiService.js
// Smart Poultry — Service IA principal
// Gemma 3 12B Vision (Cloudflare Workers AI)
// Fonctionnalités : santé globale, mortalité, maladie suspectée,
//                   comptage approximatif, chat vétérinaire, alertes

"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const sharp = require("sharp");

// ─── Config Cloudflare ───────────────────────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const USE_CLOUDFLARE = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

const CF_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run`;

// ─── Modèles ─────────────────────────────────────────────────────────────────
const MODEL_VISION = "@cf/google/gemma-3-12b-it"; // Vision + texte
const MODEL_CHAT = "@cf/google/gemma-3-12b-it"; // Chat vétérinaire

// ─── Timeouts ────────────────────────────────────────────────────────────────
const TIMEOUT_VISION = 25000; // 25s — analyse image
const TIMEOUT_CHAT = 20000; // 20s — chat vétérinaire

// ─── Qualité image ────────────────────────────────────────────────────────────
const IMG_MIN_BRIGHTNESS = 20;
const IMG_MAX_BRIGHTNESS = 235;
const IMG_TARGET_KB = 400; // Taille cible après compression
const IMG_MAX_WIDTH = 1024; // Largeur max envoyée à Gemma

// ─── Fraîcheur capteurs ───────────────────────────────────────────────────────
const SENSOR_STALE_MS = 10 * 60 * 1000; // 10 minutes

// ─── Délai inter-analyses (cron) ──────────────────────────────────────────────
const INTER_ANALYSIS_DELAY_MS = 5000;

// ─── Images en attente (cron ESP32) ──────────────────────────────────────────
const pendingImages = new Map();

// ─── Maladies connues ─────────────────────────────────────────────────────────
const KNOWN_DISEASES = [
  "Coccidiose",
  "Newcastle",
  "Gumboro",
  "Marek",
  "Bronchite infectieuse",
  "Mycoplasmose",
  "Salmonellose",
  "Choléra aviaire",
  "Laryngotrachéite",
  "Variole aviaire",
];

// ─── Mots-clés mortalité ──────────────────────────────────────────────────────
const DEATH_KEYWORDS = [
  "décédé",
  "décès",
  "mort",
  "morte",
  "morts",
  "mortes",
  "mortalité",
  "cadavre",
  "dead",
  "death",
  "mortality",
  "deceased",
];

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1 — UTILITAIRES
// ════════════════════════════════════════════════════════════════════════════════

function cleanBase64(raw) {
  if (!raw) return null;
  return raw.includes(",") ? raw.split(",")[1] : raw;
}

function sizeKb(b64) {
  return Math.round((b64.length * 3) / 4 / 1024);
}

function isValid(value, min, max) {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  if (!isFinite(n) || isNaN(n)) return false;
  return n >= min && n <= max;
}

function mentionsDeath(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DEATH_KEYWORDS.some((kw) => lower.includes(kw));
}

function normalizeUrgency(val) {
  if (!val) return "normal";
  const v = val.toString().toLowerCase();
  if (v.includes("critique") || v.includes("critical") || v === "high")
    return "critique";
  if (v.includes("attention") || v.includes("warning") || v.includes("medium"))
    return "attention";
  return "normal";
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CAPTEURS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Extrait les capteurs frais du poulailler.
 * Retourne null pour chaque valeur si données > 10 min ou absentes.
 */
function extractFreshSensors(poulailler) {
  const monitoring = poulailler?.lastMonitoring;
  const timestamp = monitoring?.timestamp
    ? new Date(monitoring.timestamp).getTime()
    : 0;

  const isFresh = timestamp > 0 && Date.now() - timestamp < SENSOR_STALE_MS;

  if (!isFresh) {
    console.log(
      `[AI] Capteurs obsolètes (${timestamp ? new Date(timestamp).toISOString() : "jamais"}) — nullifiés`,
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

  const safe = (val, min, max) => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isFinite(n) && !isNaN(n) && n >= min && n <= max ? n : null;
  };

  console.log(`[AI] Capteurs frais ✓ (${new Date(timestamp).toISOString()})`);

  return {
    temperature: safe(monitoring.temperature, -10, 60),
    humidity: safe(monitoring.humidity, 0, 100),
    airQualityPercent: safe(monitoring.airQualityPercent, 0, 100),
    waterLevel: safe(monitoring.waterLevel, 1, 100), // 0 = capteur déconnecté
    animalCount: poulailler?.animalCount ?? null,
    surface: poulailler?.surface ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3 — QUALITÉ IMAGE
// ════════════════════════════════════════════════════════════════════════════════

async function assessImageQuality(b64) {
  try {
    const buffer = Buffer.from(b64, "base64");
    const { data } = await sharp(buffer)
      .resize(64, 64, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const n = pixels.length;
    const brightness = pixels.reduce((s, p) => s + p, 0) / n;
    const variance =
      pixels.reduce((s, p) => s + Math.pow(p - brightness, 2), 0) / n;

    console.log(
      `[AI] Image — luminosité: ${brightness.toFixed(1)}, variance: ${variance.toFixed(1)}`,
    );

    if (brightness < IMG_MIN_BRIGHTNESS)
      return { usable: false, reason: "image trop sombre" };
    if (brightness > IMG_MAX_BRIGHTNESS)
      return { usable: false, reason: "image surexposée" };

    return { usable: true, reason: "ok" };
  } catch (err) {
    console.warn("[AI] assessImageQuality:", err.message);
    return { usable: true, reason: "ok" }; // on tente quand même
  }
}

async function compressImage(b64) {
  const currentKb = sizeKb(b64);
  if (currentKb <= IMG_TARGET_KB) return b64;

  const buffer = Buffer.from(b64, "base64");
  const compressed = await sharp(buffer)
    .resize({ width: IMG_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();

  const finalKb = Math.round(compressed.length / 1024);
  console.log(`[AI] Image compressée : ${currentKb} Ko → ${finalKb} Ko`);
  return compressed.toString("base64");
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4 — PROMPTS
// ════════════════════════════════════════════════════════════════════════════════

function buildAnalysisPrompt(sensorData = {}) {
  const fmt = (val, min, max, unit) =>
    isValid(val, min, max) ? `${val}${unit}` : "N/A (capteur absent)";

  return `You are an expert poultry farm veterinarian and AI vision analyst.
Carefully analyze this poultry farm image and respond ONLY with valid JSON — no markdown, no text outside JSON.

═══════════════════════════════════════
SENSOR DATA (use for context):
═══════════════════════════════════════
Temperature    : ${fmt(sensorData.temperature, -10, 60, "°C")}  (optimal: 18–28°C)
Humidity       : ${fmt(sensorData.humidity, 0, 100, "%")}   (optimal: 40–70%)
Air Quality    : ${fmt(sensorData.airQualityPercent, 0, 100, "%")}   (critical if <20%)
Water Level    : ${fmt(sensorData.waterLevel, 1, 100, "%")}   (critical if <20%)
Animal Count   : ${sensorData.animalCount ?? "N/A"}
Surface        : ${sensorData.surface ?? "N/A"} m²

═══════════════════════════════════════
ANALYSIS RULES:
═══════════════════════════════════════
1. imageUsable = false if image is: blurry, too dark, overexposed, shows no animals, or is unrecognizable
2. If imageUsable = false → all vision fields must be null, score based ONLY on sensors
3. mortalityDetected = true ONLY with ≥90% certainty of visible dead birds on ground (sleeping ≠ dead)
4. Disease suspicion based ONLY on visible clinical signs
5. Count only clearly visible birds (estimate if partially hidden)
6. urgencyLevel must be exactly: "normal" | "attention" | "critique"
7. All French text. Diagnostic: max 2 sentences. Be precise, not generic.
8. NEVER include raw numeric sensor values in diagnostic or advices text
9. Only advise on sensors with real values (not N/A)
10. Known diseases: ${KNOWN_DISEASES.join(", ")}

═══════════════════════════════════════
REQUIRED JSON FORMAT:
═══════════════════════════════════════
{
  "imageUsable": true,
  "healthScore": 85,
  "urgencyLevel": "normal",
  "diagnostic": "Diagnostic précis en français en 2 phrases maximum.",

  "comptage": {
    "estimation": 45,
    "fiabilite": "faible|moyenne|bonne",
    "note": "Explication si estimation difficile"
  },

  "stade_croissance": "J1-J14|J14-J28|J28-J42|adulte|indéterminé",

  "detections": {
    "mortalityDetected": false,
    "behaviorNormal": true,
    "densityOk": true,
    "cleanEnvironment": true,
    "ventilationAdequate": true,
    "predateurDetecte": false
  },

  "maladie_suspectee": {
    "suspicion": false,
    "maladie_probable": null,
    "signes_observes": [],
    "urgence_veterinaire": false,
    "confiance": "faible|moyenne|élevée"
  },

  "advices": [
    "Conseil vétérinaire professionnel 1",
    "Conseil 2"
  ]
}

IF imageUsable = false, use this format instead:
{
  "imageUsable": false,
  "healthScore": <based only on sensors, null if no sensor data>,
  "urgencyLevel": "<based only on sensors>",
  "diagnostic": "Image inexploitable — <raison>. <diagnostic capteurs>.",
  "comptage": { "estimation": null, "fiabilite": null, "note": "Image inexploitable" },
  "stade_croissance": "indéterminé",
  "detections": {
    "mortalityDetected": null, "behaviorNormal": null, "densityOk": null,
    "cleanEnvironment": null, "ventilationAdequate": null, "predateurDetecte": null
  },
  "maladie_suspectee": {
    "suspicion": false, "maladie_probable": null, "signes_observes": [],
    "urgence_veterinaire": false, "confiance": "faible"
  },
  "advices": ["Conseil basé uniquement sur les capteurs disponibles"]
}`.trim();
}

function buildChatSystemPrompt(context) {
  const sensors = [
    isValid(context.temperature, -10, 60)
      ? `Température : ${context.temperature}°C`
      : null,
    isValid(context.humidity, 0, 100)
      ? `Humidité : ${context.humidity}%`
      : null,
    isValid(context.airQuality, 0, 100)
      ? `Qualité air : ${context.airQuality}%`
      : null,
    isValid(context.waterLevel, 1, 100)
      ? `Niveau eau : ${context.waterLevel}%`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const maladie = context.lastDisease
    ? `Maladie suspectée : ${context.lastDisease}`
    : "Aucune maladie suspectée";

  return `Tu es un assistant vétérinaire expert en aviculture (élevage de volailles).
Réponds en français, de manière claire, concise et professionnelle (maximum 3–4 phrases).
Réponds directement sans te présenter ni répéter la question.
N'utilise jamais de JSON ni de markdown dans tes réponses.
Ne mentionne jamais de valeurs numériques brutes des capteurs — utilise des termes qualitatifs (normal, élevé, bas, critique).
Ne génère jamais de conseil sur un capteur dont la valeur est absente.
Tu peux suspecter des maladies mais toujours recommander une consultation vétérinaire pour confirmation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTE POULAILLER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nom           : ${context.poulaillerName}
Volailles     : ${context.animalCount ?? "N/A"}
Capteurs      : ${sensors || "Aucune donnée disponible"}
Score santé   : ${context.lastScore != null ? `${context.lastScore}/100` : "Non disponible"}
Urgence       : ${context.lastUrgency ?? "Non disponible"}
${maladie}
Diagnostic    : ${context.lastDiagnostic ?? "Aucune analyse récente"}
Conseils      : ${context.lastAdvices ?? "Aucun conseil disponible"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5 — APPELS CLOUDFLARE
// ════════════════════════════════════════════════════════════════════════════════

async function callCF(model, payload, timeout) {
  const url = `${CF_BASE_URL}/${model}`;
  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout,
  });

  const result = response.data?.result;
  if (!result) throw new Error("Réponse Cloudflare vide");

  // Gemma retourne result.response
  return result.response ?? result;
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6 — PARSING RÉPONSE IA
// ════════════════════════════════════════════════════════════════════════════════

function parseAnalysisResponse(text, sensorData = {}, isTestImage = false) {
  try {
    // Extrait le bloc JSON de la réponse
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Aucun JSON trouvé dans la réponse IA");

    const p = JSON.parse(match[0]);

    // ── Image inexploitable signalée par le modèle ──────────────────────────
    // ACCEPTER QUAND MÊME les détections — ne rejeter que si aucune donnée
    const hasVisionData =
      p.comptage?.estimation != null ||
      p.detections?.mortalityDetected != null ||
      p.maladie_suspectee?.suspicion != null;

    if (p.imageUsable === false && !hasVisionData) {
      console.warn("[AI] Modèle → image inexploitable (no vision data)");
      const fallback = buildSensorOnlyResult(sensorData);
      return {
        ...fallback,
        diagnostic: p.diagnostic || fallback.diagnostic,
        imageAvailable: true,
        imageUsable: false,
        imageQuality: { status: "poor", reason: "signalé par le modèle" },
      };
    }

    if (p.imageUsable === false && hasVisionData) {
      console.warn(
        "[AI] Image marquée inexploitable MAIS données vision présentes — accepter",
      );
    }

    // ── Score & urgence ─────────────────────────────────────────────────────
    let healthScore =
      typeof p.healthScore === "number"
        ? Math.max(0, Math.min(100, p.healthScore))
        : 70;
    let urgencyLevel = normalizeUrgency(p.urgencyLevel);

    // ── Override urgence si capteurs critiques ──────────────────────────────
    const aq = sensorData.airQualityPercent;
    const temp = sensorData.temperature;
    const wl = sensorData.waterLevel;

    if (isValid(aq, 0, 100) && aq < 20) urgencyLevel = "critique";
    else if (
      (isValid(temp, -10, 60) && (temp < 15 || temp > 31)) ||
      (isValid(wl, 1, 100) && wl < 20)
    ) {
      if (urgencyLevel === "normal") urgencyLevel = "attention";
    }

    // ── Mortalité — double vérification ────────────────────────────────────
    let mortalityDetected = p.detections?.mortalityDetected ?? null;
    if (mortalityDetected === true) {
      const diagText = (p.diagnostic || "").toLowerCase();
      if (!mentionsDeath(diagText)) {
        console.warn("[AI] Mortalité bloquée — diagnostic ne confirme pas");
        mortalityDetected = false;
      }
    }

    // ── Comptage ────────────────────────────────────────────────────────────
    const comptage = {
      estimation: p.comptage?.estimation ?? null,
      fiabilite: p.comptage?.fiabilite ?? "faible",
      note: p.comptage?.note ?? null,
    };

    // ── Maladie suspectée ───────────────────────────────────────────────────
    const maladie = {
      suspicion: p.maladie_suspectee?.suspicion ?? false,
      maladie_probable: p.maladie_suspectee?.maladie_probable ?? null,
      signes_observes: Array.isArray(p.maladie_suspectee?.signes_observes)
        ? p.maladie_suspectee.signes_observes
        : [],
      urgence_veterinaire: p.maladie_suspectee?.urgence_veterinaire ?? false,
      confiance: p.maladie_suspectee?.confiance ?? "faible",
    };

    // ── Conseils ────────────────────────────────────────────────────────────
    const advices =
      Array.isArray(p.advices) && p.advices.length > 0
        ? p.advices
        : buildSensorAdvices(sensorData);

    // ── CORRECTION : forcer imageUsable: true si on a des données vision ────
    const forceImageUsable =
      comptage.estimation != null ||
      mortalityDetected != null ||
      maladie.suspicion != null;

    return {
      healthScore,
      urgencyLevel,
      diagnostic: p.diagnostic || "Analyse effectuée.",
      imageAvailable: true,
      imageUsable: forceImageUsable ? true : (p.imageUsable ?? true),
      stade_croissance: p.stade_croissance ?? "indéterminé",
      comptage,
      maladie_suspectee: maladie,
      detections: {
        mortalityDetected,
        behaviorNormal: p.detections?.behaviorNormal ?? null,
        densityOk: p.detections?.densityOk ?? null,
        cleanEnvironment: p.detections?.cleanEnvironment ?? null,
        ventilationAdequate: p.detections?.ventilationAdequate ?? null,
        predateurDetecte: p.detections?.predateurDetecte ?? null,
      },
      advices,
    };
  } catch (err) {
    console.error("[AI] parseAnalysisResponse:", err.message);
    return buildSensorOnlyResult(sensorData);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7 — FALLBACK CAPTEURS UNIQUEMENT
// ════════════════════════════════════════════════════════════════════════════════

function buildSensorAdvices(s = {}) {
  const advices = [];

  if (isValid(s.airQualityPercent, 0, 100)) {
    if (s.airQualityPercent < 20)
      advices.push(
        "Ventilation insuffisante — augmentez immédiatement le débit d'air.",
      );
    else if (s.airQualityPercent < 40)
      advices.push("Qualité de l'air dégradée — vérifiez les extracteurs.");
  }
  if (isValid(s.temperature, -10, 60)) {
    if (s.temperature > 31)
      advices.push(
        "Température excessive — activez le refroidissement en urgence.",
      );
    else if (s.temperature > 28)
      advices.push(
        "Température légèrement élevée — surveillez l'hydratation des volailles.",
      );
    else if (s.temperature < 15)
      advices.push(
        "Température trop basse — vérifiez le chauffage et l'isolation.",
      );
    else if (s.temperature < 18)
      advices.push(
        "Température en dessous de l'optimale — contrôlez le chauffage d'appoint.",
      );
  }
  if (isValid(s.humidity, 0, 100)) {
    if (s.humidity > 80)
      advices.push(
        "Humidité excessive — risque bactérien, améliorez la ventilation et changez la litière.",
      );
    else if (s.humidity < 30)
      advices.push("Humidité insuffisante — vérifiez les abreuvoirs.");
  }
  if (isValid(s.waterLevel, 1, 100)) {
    if (s.waterLevel < 20)
      advices.push(
        "Niveau d'abreuvement critique — remplissez les abreuvoirs immédiatement.",
      );
    else if (s.waterLevel < 40)
      advices.push("Niveau d'abreuvement bas — planifiez un remplissage.");
  }

  const hasData =
    isValid(s.temperature, -10, 60) ||
    isValid(s.humidity, 0, 100) ||
    isValid(s.airQualityPercent, 0, 100) ||
    isValid(s.waterLevel, 1, 100);

  if (advices.length === 0 && hasData)
    advices.push(
      "Paramètres environnementaux dans les plages normales — maintenez la surveillance habituelle.",
    );

  if (advices.length === 0) {
    advices.push(
      "Aucune donnée capteur disponible — vérifiez la connexion du module de surveillance.",
    );
    advices.push(
      "Relancez une analyse avec image pour une évaluation complète.",
    );
  }

  return advices;
}

function buildSensorOnlyResult(sensorData = {}) {
  const s = sensorData;
  const aq = s.airQualityPercent ?? null;
  const t = s.temperature ?? null;
  const wl = s.waterLevel ?? null;
  const h = s.humidity ?? null;

  const hasData =
    isValid(t, -10, 60) ||
    isValid(h, 0, 100) ||
    isValid(aq, 0, 100) ||
    isValid(wl, 1, 100);

  if (!hasData) {
    return {
      healthScore: null,
      urgencyLevel: "inconnu",
      diagnostic:
        "Aucune donnée capteur ni image disponible. Vérifiez la connexion du module de surveillance et de la caméra.",
      confidence: 0,
      imageAvailable: false,
      imageUsable: false,
      stade_croissance: "indéterminé",
      comptage: { estimation: null, fiabilite: null, note: "Aucune donnée" },
      maladie_suspectee: {
        suspicion: false,
        maladie_probable: null,
        signes_observes: [],
        urgence_veterinaire: false,
        confiance: "faible",
      },
      detections: {
        mortalityDetected: null,
        behaviorNormal: null,
        densityOk: null,
        cleanEnvironment: null,
        ventilationAdequate: null,
        predateurDetecte: null,
      },
      advices: buildSensorAdvices(sensorData),
      imageQuality: { status: "poor" },
    };
  }

  let score = 85;
  let urgency = "normal";
  const issues = [];

  if (isValid(aq, 0, 100)) {
    if (aq < 20) {
      score -= 40;
      urgency = "critique";
      issues.push("qualité d'air critique");
    } else if (aq < 40) {
      score -= 20;
      if (urgency !== "critique") urgency = "attention";
      issues.push("qualité d'air dégradée");
    }
  }
  if (isValid(t, -10, 60)) {
    if (t > 31) {
      score -= 20;
      urgency = "critique";
      issues.push("surchauffe détectée");
    } else if (t < 15) {
      score -= 15;
      if (urgency !== "critique") urgency = "attention";
      issues.push("température trop basse");
    }
  }
  if (isValid(wl, 1, 100)) {
    if (wl < 20) {
      score -= 15;
      if (urgency !== "critique") urgency = "attention";
      issues.push("abreuvement insuffisant");
    }
  }
  if (isValid(h, 0, 100)) {
    if (h > 80) {
      score -= 10;
      if (urgency !== "critique") urgency = "attention";
      issues.push("humidité excessive");
    }
  }

  score = Math.max(0, Math.min(100, score));

  const diagnostic =
    issues.length > 0
      ? `Anomalies détectées : ${issues.join(", ")}. Évaluation visuelle indisponible.`
      : "Paramètres environnementaux normaux. Relancez une analyse avec image pour évaluation complète.";

  return {
    healthScore: score,
    urgencyLevel: urgency,
    diagnostic,
    confidence: 50,
    imageAvailable: false,
    imageUsable: false,
    stade_croissance: "indéterminé",
    comptage: { estimation: null, fiabilite: null, note: "Image indisponible" },
    maladie_suspectee: {
      suspicion: false,
      maladie_probable: null,
      signes_observes: [],
      urgence_veterinaire: false,
      confiance: "faible",
    },
    detections: {
      mortalityDetected: null,
      behaviorNormal: null,
      densityOk: null,
      cleanEnvironment: null,
      ventilationAdequate: null,
      predateurDetecte: null,
    },
    advices: buildSensorAdvices(sensorData),
    imageQuality: { status: "poor" },
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 8 — ANALYSE PRINCIPALE
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Analyse une image de poulailler avec Gemma 3 Vision.
 * Retourne un objet structuré avec : santé, mortalité, maladie, comptage, conseils.
 */
async function analyzeWithCloudflareAI(
  imageBase64,
  sensorData = {},
  thresholds = {},
  isTestImage = false,
) {
  try {
    if (!USE_CLOUDFLARE) {
      console.warn("[AI] Cloudflare désactivé — fallback capteurs");
      return buildSensorOnlyResult(sensorData);
    }

    const clean = cleanBase64(imageBase64);

    // ── Pas d'image ──────────────────────────────────────────────────────────
    if (!clean || clean.length < 100) {
      console.warn("[AI] Image absente — fallback capteurs");
      return buildSensorOnlyResult(sensorData);
    }

    // ── Qualité image ────────────────────────────────────────────────────────
    // En mode test (upload galerie), on bypass les checks de qualité flou/sombre.
    // Objectif: permettre de récupérer un résultat cohérent même sur une image non optimale.
    const quality = isTestImage
      ? { usable: true, reason: "bypass" }
      : await assessImageQuality(clean);
    if (!quality.usable) {
      console.warn(
        `[AI] Image inexploitable (${quality.reason}) — fallback capteurs`,
      );
      const fallback = buildSensorOnlyResult(sensorData);
      return {
        ...fallback,
        diagnostic: `Image inexploitable (${quality.reason}). ${fallback.diagnostic}`,
        imageAvailable: true,
        imageUsable: false,
        imageQuality: { status: "poor", reason: quality.reason },
      };
    }

    // ── Compression ──────────────────────────────────────────────────────────
    const compressed = await compressImage(clean);
    const kb = sizeKb(compressed);
    console.log(`[AI] Image envoyée à Gemma : ${kb} Ko`);

    // ── Appel Gemma 3 Vision ─────────────────────────────────────────────────
    console.log("[AI] Appel Gemma 3 Vision...");
    const rawResponse = await callCF(
      MODEL_VISION,
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildAnalysisPrompt(sensorData) },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${compressed}` },
              },
            ],
          },
        ],
      },
      TIMEOUT_VISION,
    );

    console.log("[AI] Réponse Gemma reçue ✓");
    const result = parseAnalysisResponse(rawResponse, sensorData, isTestImage);

    return {
      ...result,
      confidence: 85,
      imageQuality: { status: "ok", sizeKb: kb },
    };
  } catch (err) {
    console.error("[AI] analyzeWithCloudflareAI:", err.message);
    return buildSensorOnlyResult(sensorData);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 9 — CHAT VÉTÉRINAIRE
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Chat vétérinaire IA avec contexte poulailler + historique conversation.
 */
async function chatWithGemma(question, context, history = []) {
  try {
    if (!USE_CLOUDFLARE) {
      console.warn("[AI] Cloudflare désactivé — réponse générique");
      return "Service IA temporairement indisponible. Vérifiez votre connexion.";
    }

    const messages = [
      { role: "system", content: buildChatSystemPrompt(context) },
      ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];

    const response = await callCF(MODEL_CHAT, { messages }, TIMEOUT_CHAT);

    if (!response || response.trim().length < 5) {
      return "Je n'ai pas pu générer une réponse. Veuillez reformuler votre question.";
    }

    // Nettoie les éventuels blocs JSON ou markdown dans la réponse
    return response
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\{[\s\S]*?\}/g, "")
      .trim();
  } catch (err) {
    console.error("[AI] chatWithGemma:", err.message);
    return "Service IA temporairement indisponible. Veuillez réessayer dans quelques instants.";
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 10 — GESTION IMAGE ESP32 (pendingImages)
// ════════════════════════════════════════════════════════════════════════════════

async function handleCameraImage(poulaillerId, macAddress, imageBase64) {
  try {
    const clean = cleanBase64(imageBase64);
    if (!clean) return;

    const kb = sizeKb(clean);
    if (kb < 3) {
      console.warn(`[AI] Image trop petite (${kb} Ko) — rejetée`);
      return;
    }

    const key = poulaillerId.toString().trim();
    pendingImages.set(key, { image: clean, receivedAt: Date.now() });
    console.log(`[AI] Image stockée pour ${poulaillerId} (${kb} Ko)`);

    // Expire après 60s si non consommée
    setTimeout(() => {
      if (pendingImages.has(key)) {
        pendingImages.delete(key);
        console.warn(`[AI] Image expirée pour ${poulaillerId}`);
      }
    }, 60_000);
  } catch (err) {
    console.error("[AI] handleCameraImage:", err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 11 — MQTT CAPTURE
// ════════════════════════════════════════════════════════════════════════════════

async function publishCaptureTrigger(poulaillerId, requestId) {
  if (!requestId) throw new Error("publishCaptureTrigger : requestId requis");

  const Camera = require("../models/Camera");
  const { publishCameraCommand } = require("./mqttService");

  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: "associated",
  });
  if (!camera) throw new Error("Aucune caméra active associée à ce poulailler");

  return publishCameraCommand(poulaillerId, requestId);
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Analyse principale
  analyzeWithCloudflareAI,
  // Chat vétérinaire
  chatWithGemma,
  // Capteurs
  extractFreshSensors,
  // Helpers
  buildSensorAdvices,
  buildSensorOnlyResult,
  // Image ESP32
  handleCameraImage,
  pendingImages,
  // MQTT
  publishCaptureTrigger,
  // Config
  INTER_ANALYSIS_DELAY_MS,
};
