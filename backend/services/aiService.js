const axios = require("axios");
const sharp = require("sharp");
const { publishCameraCommand } = require("./mqttService");

const _CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const _CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const USE_CLOUDFLARE = !!(_CF_ACCOUNT_ID && _CF_API_TOKEN);
const PRIMARY_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const FALLBACK_MODEL = "@cf/google/gemma-3-12b-it";
const GEMMA_TIMEOUT = 45000;
const CHAT_TIMEOUT = 20000;
const LLAVA_TIMEOUT = 10000;
const LLAVA_MAX_KB = 24;
const GEMMA_MAX_KB = 80;
const INTER_ANALYSIS_DELAY_MS = 5000;

const IMAGE_MIN_BRIGHTNESS = 20;
const IMAGE_MAX_BRIGHTNESS = 235;
const IMAGE_MIN_VARIANCE = 80;

const SENSOR_STALE_MS = 10 * 60 * 1000;

// ─── Validation Cloudflare au démarrage ──────────────────────────────────────

if (USE_CLOUDFLARE) {
  console.log(
    `[AI] Cloudflare ENABLED - Account: ${_CF_ACCOUNT_ID.substring(0, 8)}...`,
  );
  console.log(`[AI] Models: Llama Vision, Gemma 3`);
} else {
  console.warn(
    "[AI] ⚠️  Cloudflare DISABLED - Using sensor-only fallback mode",
  );
  console.warn(
    "[AI] Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env to enable AI",
  );
}

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

// ─── Liste complète des maladies aviaires détectables visuellement ──────────
const MALADIES_AVIAIRES = [
  "Maladie de Newcastle",
  "Grippe aviaire (H5N1 / H7N9)",
  "Maladie de Marek",
  "Bronchite infectieuse",
  "Laryngotrachéite infectieuse",
  "Mycoplasmose (Mycoplasma gallisepticum)",
  "Coccidiose",
  "Aspergillose",
  "Salmonellose",
  "Colibacillose (E. coli)",
  "Gumboro (Bursite infectieuse)",
  "Choléra aviaire (Pasteurellose)",
  "Typhose aviaire",
  "Pullorum (Bacillose blanche)",
  "Variole aviaire (Fowlpox)",
  "Leucose aviaire",
  "Anémie infectieuse du poulet",
  "Entérite hémorragique",
  "Syndrome de mort subite",
  "Parasites externes (gale, poux, acariens)",
  "Parasites internes (ascaris, ténia, capillaire)",
  "Candidose (Muguet)",
  "Trichomonose",
  "Histomonose (tête noire)",
  "Dermatite gangréneuse",
  "Syndrome ascitique (Hydropisie)",
  "Tendinite / Syndrome de boiterie",
  "Carence nutritionnelle (rachitisme, avitaminose)",
  "Stress thermique",
  "Plumage anormal / Mue prématurée",
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

// ─── Guard valeur capteur ────────────────────────────────────────────────────

function isValidSensorValue(value, min = 0, max = 100) {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  if (!isFinite(n) || isNaN(n)) return false;
  if (n < min || n > max) return false;
  return true;
}

// ─── Extraction capteurs frais ───────────────────────────────────────────────

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

// ─── Détection qualité image via sharp ──────────────────────────────────────

const IMAGE_MIN_EDGES = 12;

async function assessImageQuality(base64) {
  try {
    const buffer = Buffer.from(base64, "base64");

    const { data, info } = await sharp(buffer)
      .resize(128, 128, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = Array.from(data);
    const n = pixels.length;

    const brightness = pixels.reduce((sum, p) => sum + p, 0) / n;

    const variance =
      pixels.reduce((sum, p) => sum + Math.pow(p - brightness, 2), 0) / n;

    let edges = 0;

    for (let y = 1; y < info.height - 1; y++) {
      for (let x = 1; x < info.width - 1; x++) {
        const idx = y * info.width + x;

        const gx = Math.abs(pixels[idx - 1] - pixels[idx + 1]);

        const gy = Math.abs(
          pixels[idx - info.width] - pixels[idx + info.width],
        );

        if (gx + gy > 35) {
          edges++;
        }
      }
    }

    const edgePercent = (edges / n) * 100;

    console.log(
      `[AI] Qualité image — brightness=${brightness.toFixed(1)} variance=${variance.toFixed(1)} edges=${edgePercent.toFixed(1)}%`,
    );

    if (brightness < IMAGE_MIN_BRIGHTNESS) {
      return {
        usable: false,
        severity: "hard",
        reason: "image trop sombre",
      };
    }

    if (brightness > IMAGE_MAX_BRIGHTNESS) {
      return {
        usable: false,
        severity: "hard",
        reason: "image surexposée",
      };
    }

    // FIX FLOU
    // Variance seule = FAUX POSITIFS
    if (variance < IMAGE_MIN_VARIANCE && edgePercent < IMAGE_MIN_EDGES) {
      return {
        usable: true,
        severity: "soft",
        reason: "image probablement floue",
      };
    }

    return {
      usable: true,
      severity: "good",
      reason: "ok",
    };
  } catch (err) {
    console.warn("[AI] assessImageQuality erreur:", err.message);

    return {
      usable: true,
      severity: "unknown",
      reason: "analyse impossible",
    };
  }
}

// ─── Compression image ───────────────────────────────────────────────────────

async function compressImage(base64, maxKb = LLAVA_MAX_KB) {
  if (getImageSizeKb(base64) <= maxKb) {
    console.log("[AI] Image déjà dans les limites — pas de compression");
    return base64;
  }

  const buffer = Buffer.from(base64, "base64");

  let lastCompressed = buffer;

  for (let i = 0; i < 5; i++) {
    const quality = Math.max(30, 80 - i * 10);
    const width = Math.max(480, 800 - i * 80);

    try {
      const compressed = await sharp(buffer)
        .resize({ width })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      const kb = compressed.length / 1024;
      console.log(
        `[AI] Compression tentative ${i + 1} : ${Math.round(kb)} Ko (qualité ${quality}, largeur ${width})`,
      );

      if (kb <= maxKb) {
        console.log(`[AI] Image compressée OK : ${Math.round(kb)} Ko`);
        return compressed.toString("base64");
      }
      lastCompressed = compressed;
    } catch (err) {
      console.warn(
        `[AI] Compression tentative ${i + 1} échouée :`,
        err.message,
      );
    }
  }

  console.warn(
    "[AI] Limite de compression atteinte — envoi du meilleur résultat",
  );
  return lastCompressed.toString("base64");
}

// ─── Conseils capteurs ───────────────────────────────────────────────────────

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

// ─── Fallback capteurs uniquement ───────────────────────────────────────────

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

// ─── Résultat pour image inexploitable ──────────────────────────────────────

function buildPoorImageResult(sensorData = {}, reason = "image floue") {
  const sensorResult = analyzeWithSensorsOnly(sensorData);
  const hasAnyValid =
    isValidSensorValue(sensorData.temperature, -10, 60) ||
    isValidSensorValue(sensorData.humidity, 0, 100) ||
    isValidSensorValue(sensorData.airQualityPercent, 0, 100) ||
    isValidSensorValue(sensorData.waterLevel, 1, 100);

  const advices = hasAnyValid
    ? sensorResult.advices
    : [
        "Vérifiez l'éclairage du poulailler avant de relancer une analyse — une luminosité suffisante est nécessaire pour la caméra.",
        "Assurez-vous que la caméra ESP32 est correctement positionnée et que l'objectif est propre.",
        "Vérifiez la connexion du module de surveillance pour rétablir les données capteurs.",
      ];

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

function buildAnalysisPrompt(sensorData = {}) {
  const maladiesListe = MALADIES_AVIAIRES.join(" | ");

  return `You are an expert poultry veterinarian. Analyze this image NOW.

KNOWN POULTRY DISEASES — you MUST use one of these exact names for "maladie_probable" if you suspect a disease:
${maladiesListe}

RESPOND ONLY WITH VALID JSON - NO OTHER TEXT.
START WITH { AND END WITH }
 
ANALYZE THE IMAGE:
- Count ONLY birds VISIBLE in THIS image — do NOT estimate total flock size
- If you see 1 bird, estimation = 1. If you see 3 birds, estimation = 3.
- Count LIVE birds (standing, moving, sitting naturally)
- Count DEAD birds (lying flat, stiff, no breathing, not moving)
- Check for visible diseases
- Rate health 0-100
 
DEAD BIRD DETECTION:
- Is any bird lying completely flat? YES = DEAD
- Is any bird not moving and stiff? YES = DEAD
- If dead birds found: healthScore = 15, urgencyLevel = "critique"
 
HEALTH SCORING:
- 90-100: All healthy
- 70-89: Minor issues
- 50-69: Moderate issues
- 30-49: Serious
- 0-29: CRITICAL (dead birds, major outbreak)
 
OUTPUT THIS JSON EXACTLY:
{
  "healthScore": <number 0-100>,
  "urgencyLevel": "<normal or attention or critique>",
  "imageUsable": true,
  "diagnostic": "<2-3 sentences in French about what you see>",
  "detections": {
    "mortalityDetected": <true or false>,
    "behaviorNormal": <true or false>,
    "nombreMorts": <number of dead birds>
  },
  "comptage": {
    "estimation": <number of LIVE birds only>,
    "fiabilite": "<faible or moyenne or bonne>",
    "note": "<brief description>"
  },
// APRÈS
"maladie_suspectee": {
  "suspicion": <true or false>,
  "maladie_probable": <null or exact disease name from the list above>,
  "signes_observes": [<REQUIRED if suspicion=true: list every visible symptom you see, e.g. "plumes ébouriffées", "posture voûtée", "pattes jaunes", "tête baissée">],
  "urgence_veterinaire": <true or false>,
  "confiance": <null or "faible" or "moyenne" or "élevée">
},

DISEASE RULES:
- If suspicion=true, signes_observes MUST contain only symptoms CLEARLY VISIBLE in the image.
- If you cannot find 2 real visible symptoms → set suspicion=false instead of inventing them.
- Listing invented symptoms is a critical error. Zero symptoms = suspicion=false.- If suspicion=true, maladie_probable MUST be filled with a disease name from the list
- Match symptoms to the most likely disease from the KNOWN POULTRY DISEASES list
  "advices": [
    "<practical advice 1>",
    "<practical advice 2>",
    "<practical advice 3>"
  ]
}
 
SENSOR DATA (use for advice only, not for counting):
Temperature: ${isValidSensorValue(sensorData.temperature, -10, 60) ? sensorData.temperature + "°C" : "N/A"}
Humidity: ${isValidSensorValue(sensorData.humidity, 0, 100) ? sensorData.humidity + "%" : "N/A"}
Air Quality: ${isValidSensorValue(sensorData.airQualityPercent, 0, 100) ? sensorData.airQualityPercent + "%" : "N/A"}
Water Level: ${isValidSensorValue(sensorData.waterLevel, 1, 100) ? sensorData.waterLevel + "%" : "N/A"}
CRITICAL ANALYSIS RULES:
- This chicken shows: hunched posture, ruffled feathers, lowered head, yellow legs — these ARE symptoms
- If the bird is NOT standing straight and alert = behaviorNormal MUST be false
- If you write "semble malade" or "un peu malade" in diagnostic = suspicion MUST be true
- NEVER invent illness to match suspicion. If the bird looks healthy, write it and set suspicion=false.
- A bird that is standing, alert, moving normally IS healthy. Do NOT call it sick.
- Only set suspicion=true if you see CLEAR, UNAMBIGUOUS visual evidence in the image.- Be a veterinarian, not a reassurer — report what you SEE, not what you hope

// APRÈS — exige une observation certaine, interdit l'invention
VISIBLE SYMPTOMS — STRICT RULES:
- ONLY report symptoms you can CLEARLY and UNAMBIGUOUSLY see in THIS image.
- If a bird is standing upright and moving normally → behaviorNormal=true, posture is NOT voûtée.
- If feathers appear smooth and flat → they are NOT ébouriffées.
- NEVER invent symptoms to justify suspicion=true.
- If you are not 100% certain a symptom is present → do NOT list it.
- "posture voûtée" = bird body bent forward, head lower than chest, visibly drooping. Upright = NOT voûtée.
- "plumes ébouriffées" = feathers visibly puffed out, standing up, disheveled. Normal feathers = NOT ébouriffées.
- If no symptom is clearly visible → suspicion=false, signes_observes=[], maladie_probable=null.
NOW ANALYZE THE IMAGE AND RESPOND WITH JSON ONLY.`.trim();
}

// ─── Prompt chat vétérinaire ─────────────────────────────────────────────────

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
CONSEILS : ${context.lastAdvices ?? "Aucun conseil disponible"}`.trim();
}
// ─── Appel Cloudflare API ──────────────────────────────────────────────────

async function callCloudflare(model, payload, timeout) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${_CF_ACCOUNT_ID}/ai/run/${model}`;

  console.log(`\n[CF CALL] Model: ${model.substring(0, 40)}...`);
  console.log(`[CF CALL] Account ID: ${_CF_ACCOUNT_ID.substring(0, 8)}...`);
  console.log(`[CF CALL] Timeout: ${timeout}ms`);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${_CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout,
    });

    console.log("[CF CALL] ✓ Success");
    console.log(
      "[CF RESPONSE]",
      JSON.stringify(response.data).substring(0, 500),
    );

    // Extract response - may be object or string
    let result =
      response.data?.result?.response ||
      response.data?.result?.text ||
      response.data?.result;

    // If result is an object, stringify it
    if (typeof result === "object" && result !== null) {
      result = JSON.stringify(result);
    }

    return result || JSON.stringify(response.data?.result);
  } catch (err) {
    const status = err.response?.status;
    const statusText = err.response?.statusText;

    console.error(`\n[CF ERROR] Status: ${status} ${statusText}`);

    if (err.response?.data) {
      console.error(
        "[CF ERROR DATA]",
        JSON.stringify(err.response.data, null, 2),
      );
    } else {
      console.error("[CF ERROR]", err.message);
    }

    if (status === 401) {
      console.error("\n[CF ERROR] 🔑 AUTHENTICATION FAILED");
    }
    if (status === 403) {
      console.error("\n[CF ERROR] 🔒 FORBIDDEN");
    }
    if (status === 404) {
      console.error("\n[CF ERROR] 🔍 MODEL NOT FOUND");
    }
    if (status === 429) {
      console.error("\n[CF ERROR] ⏱️ RATE LIMITED");
    }

    throw err;
  }
}
async function acceptLlamaLicense() {
  if (!USE_CLOUDFLARE) return;
  const url = `https://api.cloudflare.com/client/v4/accounts/${_CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;

  try {
    console.log("[AI] Accepting Llama license...");

    const response = await axios.post(
      url,
      { prompt: "agree" }, // ← KEY FIX: Use 'prompt', not 'messages'
      {
        headers: {
          Authorization: `Bearer ${_CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    console.log("✅ Llama license accepted");
    return true;
  } catch (err) {
    if (err.response?.status === 403) {
      console.warn("⚠️  License must be accepted in Cloudflare dashboard:");
      console.warn(
        "   https://dash.cloudflare.com → Workers AI → Models → Llama 3.2",
      );
    }
    return false;
  }
}

// ─── Normalisation urgence ───────────────────────────────────────────────────

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

// ─── Extraction JSON robuste ─────────────────────────────────────────────────

function extractJsonCandidate(text) {
  if (!text) return null;

  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const firstBrace = stripped.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escape = false;

  for (let i = firstBrace; i < stripped.length; i++) {
    const ch = stripped[i];

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
    if (ch === "[") arrayDepth++;
    if (ch === "]") arrayDepth--;
    if (ch === "}") {
      depth--;
      if (depth === 0) return stripped.slice(firstBrace, i + 1);
    }
  }

  if (depth > 0) {
    console.warn(
      `[AI] JSON tronqué détecté (profondeur objet: ${depth}, tableau: ${arrayDepth}) — tentative de réparation`,
    );
    const lines = stripped.slice(firstBrace).split("\n");

    while (lines.length > 1) {
      const last = lines[lines.length - 1].trim();
      const isComplete =
        last.endsWith(",") ||
        last.endsWith('"') ||
        last.endsWith("}") ||
        last.endsWith("]") ||
        last === "";
      if (!isComplete) {
        lines.pop();
      } else {
        break;
      }
    }

    let rebuilt = lines.join("\n").replace(/,\s*$/, "");
    rebuilt += "\n" + "]".repeat(Math.max(0, arrayDepth));
    rebuilt += "\n" + "}".repeat(Math.max(0, depth));
    return rebuilt;
  }

  return null;
}

function tryRepairJsonLike(text) {
  if (!text || typeof text !== "string") return text;

  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const candidate = extractJsonCandidate(cleaned);
  if (candidate) cleaned = candidate;

  // Fix trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*(\})/g, "$1");
  cleaned = cleaned.replace(/,\s*(\])/g, "$1");

  // FIX: Convert unquoted keys to quoted keys
  // Matches: {key: value, anotherKey: value}
  // Changes to: {"key": value, "anotherKey": value}
  // Regex explanation:
  //   ([{,]\s*)         = Opening brace or comma + whitespace
  //   ([a-zA-Z_$][a-zA-Z0-9_$]*)  = Valid JavaScript identifier (key name)
  //   \s*:              = Optional whitespace + colon
  // Replacement: $1"$2": = Keep the brace/comma, add quotes around key, keep colon
  cleaned = cleaned.replace(
    /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    '$1"$2":',
  );

  return cleaned;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONAL: Also improve the analysis prompt to force stricter JSON output
// ═══════════════════════════════════════════════════════════════════════════
//
// If you still get JSON errors, add this to buildAnalysisPrompt():
// (Find the section "CRITICAL OUTPUT RULES" and add this line)

/*
CRITICAL OUTPUT RULES (add this):
- YOUR RESPONSE MUST START WITH { AND END WITH } — NO markdown, NO \`\`\`json, NO text before or after.
- Do NOT wrap the JSON in code blocks. Output raw JSON only.
- ALL KEYS MUST BE QUOTED: "healthScore" not healthScore
- ALL STRING VALUES MUST BE QUOTED: "value" not value
- Use double quotes ONLY, never single quotes
- Output ONLY valid JSON, nothing else
*/

// ─── Parse réponse IA ────────────────────────────────────────────────────────

function parseAIResponse(text, sensorData = {}) {
  try {
    const candidate0 = extractJsonCandidate(text);
    if (!candidate0) {
      console.warn(
        "[AI] Réponse IA non-JSON — fallback capteurs",
        text.substring(0, 150),
      );
      return buildPoorImageResult(sensorData, "modèle a renvoyé du texte");
    }

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

    if (!aiAdvices) {
      console.warn(
        "[AI] advices absents du JSON (probablement tronqué) — fallback capteurs",
      );
    }

    let comptage = null;
    if (parsed.comptage && typeof parsed.comptage === "object") {
      const est = Number(parsed.comptage.estimation);
      const fiabilite = ["bonne", "moyenne", "faible"].includes(
        parsed.comptage.fiabilite,
      )
        ? parsed.comptage.fiabilite
        : null;

      comptage = {
        estimation: Number.isFinite(est) ? est : null,
        fiabilite,
        note: parsed.comptage.note || null,
      };

      // Annule le comptage si fiabilité faible
      if (fiabilite === "faible") {
        console.warn("[AI] Comptage ignoré — fiabilité faible");
        comptage.estimation = null;
        comptage.note = "Comptage non fiable — image insuffisante";
      }
    }

    let maladie = null;
    if (
      parsed.maladie_suspectee &&
      typeof parsed.maladie_suspectee === "object"
    ) {
      const s = parsed.maladie_suspectee;

      let maladie_probable = s.maladie_probable || null;
      if (maladie_probable) {
        const known = MALADIES_AVIAIRES.some(
          (m) =>
            m.toLowerCase().includes(maladie_probable.toLowerCase()) ||
            maladie_probable
              .toLowerCase()
              .includes(m.toLowerCase().split(" ")[0]),
        );
        if (!known) {
          console.warn(`[AI] Maladie inconnue ignorée: ${maladie_probable}`);
          maladie_probable = null;
        }
      }

      maladie = {
        suspicion: s.suspicion === true,
        maladie_probable,
        signes_observes: Array.isArray(s.signes_observes)
          ? s.signes_observes.filter((x) => typeof x === "string").slice(0, 8)
          : [],
        urgence_veterinaire: s.urgence_veterinaire === true,
        confiance: ["faible", "moyenne", "élevée"].includes(s.confiance)
          ? s.confiance
          : null,
      };

      if (maladie.suspicion && maladie.signes_observes.length === 0) {
        console.warn(
          "[AI] Suspicion de maladie sans signes observés — annulée",
        );
        maladie.suspicion = false;
        maladie.maladie_probable = null;
        maladie.urgence_veterinaire = false;
        maladie.confiance = null;
      }

      if (
        maladie.suspicion &&
        maladie.urgence_veterinaire &&
        urgencyLevel === "normal"
      ) {
        urgencyLevel = "attention";
      }
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
    console.warn(
      "[AI] Erreur parsing JSON :",
      err.message,
      "— fallback capteurs",
    );
    return buildPoorImageResult(sensorData, "parsing JSON échoué");
  }
}

async function callLlamaVision(imageBase64, sensorData) {
  const response = await callCloudflare(
    PRIMARY_MODEL,
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: "text",
              text: buildAnalysisPrompt(sensorData),
            },
          ],
        },
      ],
      max_tokens: 1500,
    },
    GEMMA_TIMEOUT,
  );

  // FIX: Ensure response is a string before calling substring()
  const responseStr =
    typeof response === "string" ? response : JSON.stringify(response);

  console.log(
    "[AI] Réponse Llama Vision brute (premiers 500 chars):",
    responseStr.substring(0, 500),
  );

  return parseAIResponse(responseStr, sensorData);
}

async function callLlava(imageBase64, sensorData) {
  const response = await callCloudflare(
    FALLBACK_MODEL,
    {
      image: imageBase64,
      prompt: buildAnalysisPrompt(sensorData),
      max_tokens: 1024,
    },
    GEMMA_TIMEOUT,
  );

  // FIX: Safely convert to string if needed
  const responseStr =
    typeof response === "string" ? response : JSON.stringify(response);

  console.log(
    "[AI] Réponse LLaVA brute (premiers 300 chars):",
    responseStr.substring(0, 300),
  );

  return parseAIResponse(responseStr, sensorData);
}
async function analyzeWithCloudflareAI(imageBase64, sensorData = {}) {
  try {
    if (!USE_CLOUDFLARE) {
      console.warn("[AI] Cloudflare désactivé — fallback capteurs");
      return analyzeWithSensorsOnly(sensorData);
    }

    // Certaines configurations exigent l'acceptation de licence avant le 1er run du modèle.
    // On tente une acceptation (non bloquante) avant d'appeler Llama Vision.
    try {
      await acceptLlamaLicense();
    } catch (e) {
      // acceptLlamaLicense gère déjà les erreurs, mais on sécurise ici.
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

    const compressed = await compressImage(clean, GEMMA_MAX_KB);
    const sizeKb = getImageSizeKb(compressed);
    console.log(`[AI] Taille image finale : ${sizeKb} Ko`);

    try {
      console.log("[AI] Tentative Llama Vision...");
      const result = await callLlamaVision(compressed, sensorData);
      if (!result.imageUsable) {
        return {
          ...result,
          confidence: 50,
          imageQuality: {
            sizeKb,
            status: "poor",
            reason: "signalé par Llama Vision",
          },
        };
      }
      return {
        ...result,
        confidence: 85,
        imageQuality: { sizeKb, status: "optimized" },
      };
    } catch (err) {
      console.warn("[AI] Llama Vision échoué :", err.message);
    }

    if (sizeKb <= LLAVA_MAX_KB) {
      try {
        console.log("[AI] Tentative fallback Gemma...");
        const result = await callLlava(compressed, sensorData);
        if (!result.imageUsable) {
          return {
            ...result,
            confidence: 50,
            imageQuality: {
              sizeKb,
              status: "poor",
              reason: "signalé par Gemma fallback",
            },
          };
        }
        return {
          ...result,
          confidence: 75,
          imageQuality: { sizeKb, status: "optimized" },
        };
      } catch (err) {
        console.warn("[AI] Gemma fallback échoué :", err.message);
      }
    }

    console.warn("[AI] Tous les modèles ont échoué — fallback capteurs");
    return analyzeWithSensorsOnly(sensorData);
  } catch (err) {
    console.error("[AI] Erreur fatale analyzeWithCloudflareAI :", err.message);
    return analyzeWithSensorsOnly(sensorData);
  }
}

// ─── Chat vétérinaire ────────────────────────────────────────────────────────

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
      FALLBACK_MODEL,
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
  const scoreDisplay =
    context.lastScore != null ? `${context.lastScore}/100` : "indisponible";

  if (q.includes("santé") || q.includes("état") || q.includes("etat")) {
    return `Le poulailler ${context.poulaillerName} affiche un score de santé de ${scoreDisplay} (niveau : ${context.lastUrgency ?? "inconnu"}). ${context.lastDiagnostic ?? ""}`.trim();
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
    q.includes("maladie") ||
    q.includes("symptôme") ||
    q.includes("symptome")
  ) {
    if (context.lastDiagnostic)
      return `Selon la dernière analyse : ${context.lastDiagnostic} Consultez un vétérinaire pour un diagnostic précis.`;
    return "Aucune analyse récente disponible. Lancez une analyse avec image pour détecter les signes de maladie.";
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
  if (q.includes("mort") || q.includes("dead") || q.includes("décès")) {
    return `Selon la dernière analyse : ${context.lastDiagnostic || "aucune mortalité détectée"}. Consultez un vétérinaire si vous observez des oiseaux morts.`;
  }

  return `Je suis l'assistant IA de Smart Poultry. ${context.poulaillerName} compte ${context.animalCount} volailles — score santé : ${scoreDisplay}. ${context.lastDiagnostic ?? ""}. Posez-moi une question sur la santé, les alertes, les maladies ou les conseils.`.trim();
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
    const receivedAt = Date.now();
    pendingImages.set(key, { image: cleanB64, receivedAt });

    setTimeout(() => {
      const current = pendingImages.get(key);
      if (current && current.receivedAt === receivedAt) {
        pendingImages.delete(key);
        console.warn(`[AI] Image expirée pour le poulailler ${poulaillerId}`);
      }
    }, 60_000);
  } catch (err) {
    console.error("[AI] Erreur handleCameraImage:", err.message);
  }
}

// ─── Déclenchement capture MQTT ──────────────────────────────────────────────

async function publishCaptureTrigger(poulaillerId, requestId) {
  if (!requestId)
    throw new Error("[AI] publishCaptureTrigger : requestId requis");
  const Camera = require("../models/Camera");
  const camera = await Camera.findOne({
    poulailler: poulaillerId,
    status: "associated",
  });
  if (!camera) throw new Error("Aucune caméra active associée à ce poulailler");
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
  MALADIES_AVIAIRES,
};
