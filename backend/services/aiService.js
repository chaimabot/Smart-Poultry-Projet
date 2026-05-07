// services/aiService.js
// ============================================================
// Service IA — Cloudflare Workers AI (Llama 3.2 Vision)
// Gratuit, stable, sans cold start
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const mqtt = require("mqtt");

// ─── Configuration ────────────────────────────────────
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const USE_CLOUDFLARE = !!(CF_ACCOUNT_ID && CF_API_TOKEN);

if (!USE_CLOUDFLARE) {
  console.log(
    "[AI SERVICE] ⚠️ Cloudflare non configuré — mode analyse par capteurs uniquement",
  );
}

// Fallback : analyse basée uniquement sur les capteurs si pas d'IA cloud
const USE_SENSOR_ONLY = !USE_CLOUDFLARE;

// ============================================================
// Client MQTT — connexion unique partagée
// ============================================================
let mqttClient = null;

function getMqttClient() {
  if (mqttClient && mqttClient.connected) return mqttClient;

  mqttClient = mqtt.connect(
    `mqtts://${process.env.MQTT_BROKER}:${process.env.MQTT_PORT}`,
    {
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      rejectUnauthorized: false,
      reconnectPeriod: 3000,
    },
  );

  mqttClient.on("connect", () => {
    console.log("[MQTT SERVICE] Connecté au broker HiveMQ");
  });

  mqttClient.on("error", (err) => {
    console.error("[MQTT SERVICE] Erreur broker :", err.message);
  });

  mqttClient.on("offline", () => {
    console.warn("[MQTT SERVICE] Broker hors ligne, reconnexion en cours...");
  });

  return mqttClient;
}

// ============================================================
// Publie un ordre de capture vers l'ESP32 via MQTT
// ============================================================
async function publishCaptureTrigger(poulaillerId) {
  return new Promise((resolve, reject) => {
    const client = getMqttClient();

    const message = JSON.stringify({
      command: "capture",
      poulaillerId: poulaillerId.toString(),
    });

    const timeout = setTimeout(() => {
      reject(new Error("[MQTT SERVICE] Timeout publication message capture"));
    }, 5000);

    client.publish(
      "poulailler/capture",
      message,
      { qos: 1, retain: false },
      (err) => {
        clearTimeout(timeout);
        if (err) {
          console.error("[MQTT SERVICE] Erreur publication :", err.message);
          return reject(err);
        }
        console.log(
          `[MQTT SERVICE] Trigger capture envoyé pour poulailler ${poulaillerId}`,
        );
        resolve();
      },
    );
  });
}

// ============================================================
// Récupère l'image depuis l'ESP32-CAM (mode HTTP pull — legacy)
// ============================================================
async function captureFromESP32(espIpAddress) {
  const url = `http://${espIpAddress}/capture`;
  console.log(`[AI SERVICE] Capture HTTP depuis ${url}`);

  const response = await axios.get(url, {
    timeout: 10000,
    responseType: "json",
  });

  if (!response.data?.success || !response.data?.image) {
    throw new Error("ESP32-CAM n'a pas retourné d'image valide");
  }

  return response.data.image;
}

// ============================================================
// Analyse IA — Cloudflare Workers AI (Llama 3.2 Vision)
// ============================================================
async function analyzeWithCloudflare(imageBase64, sensorData, thresholds = {}) {
  console.log(
    "[AI SERVICE] 🧠 Analyse via Cloudflare AI (Llama 3.2 Vision)...",
  );

  const t = {
    temperatureMin: 18,
    temperatureMax: 28,
    humidityMin: 40,
    humidityMax: 70,
    airQualityMin: 20,
    waterLevelMin: 20,
    ...thresholds,
  };

  const prompt = `You are a poultry farm expert. Analyze this chicken coop image.

SENSOR DATA:
- Temperature: ${sensorData.temperature ?? "N/A"}°C (threshold: ${t.temperatureMin}-${t.temperatureMax}°C)
- Humidity: ${sensorData.humidity ?? "N/A"}% (threshold: ${t.humidityMin}-${t.humidityMax}%)
- Air Quality: ${sensorData.airQualityPercent ?? "N/A"}% (min: ${t.airQualityMin}%)
- Water Level: ${sensorData.waterLevel ?? "N/A"}% (min: ${t.waterLevelMin}%)
- Animals: ${sensorData.animalCount ?? "N/A"} | Surface: ${sensorData.surface ?? "N/A"} m²

TASK: Analyze the image and respond ONLY in strict JSON:
{
  "healthScore": <number 0-100>,
  "urgencyLevel": "<normal|attention|critique>",
  "diagnostic": "<short text in French>",
  "detections": {
    "behaviorNormal": <true|false>,
    "mortalityDetected": <true|false>,
    "densityOk": <true|false>,
    "cleanEnvironment": <true|false>
  },
  "advices": ["<advice1>", "<advice2>", "<advice3>"]
}

RULES:
- Air quality < 20% OR suffocating chickens = "critique"
- Dead animals visible = "critique"
- Dark/blurry image = healthScore ≤ 50, "attention"
- NO text outside JSON.`;

  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image",
                image: { format: "jpeg", base64: imageBase64 },
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    const result = response.data.result;
    const generatedText = result.response;

    // Extraire JSON
    const jsonMatch = generatedText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error("Pas de JSON dans la réponse");
    }

    let parsed = JSON.parse(jsonMatch[0]);

    // Validation
    const validated = {
      healthScore:
        typeof parsed.healthScore === "number" &&
        parsed.healthScore >= 0 &&
        parsed.healthScore <= 100
          ? Math.round(parsed.healthScore)
          : 70,
      urgencyLevel: ["normal", "attention", "critique"].includes(
        parsed.urgencyLevel,
      )
        ? parsed.urgencyLevel
        : "normal",
      diagnostic: parsed.diagnostic || "Analyse effectuée. État à surveiller.",
      detections: {
        behaviorNormal: parsed.detections?.behaviorNormal ?? true,
        mortalityDetected: parsed.detections?.mortalityDetected ?? false,
        mortalityCount: null,
        densityOk: parsed.detections?.densityOk ?? true,
        cleanEnvironment: parsed.detections?.cleanEnvironment ?? true,
        ventilationAdequate: true,
      },
      airQualityAssessment: {
        visualConsistency: "matches_sensor",
        estimatedRisk:
          parsed.urgencyLevel === "critique"
            ? "high"
            : parsed.urgencyLevel === "attention"
              ? "medium"
              : "none",
        observedSigns: [],
      },
      sensorCorrelation: {
        temperatureConsistent:
          (sensorData.temperature ?? 22) >= t.temperatureMin &&
          (sensorData.temperature ?? 22) <= t.temperatureMax,
        humidityConsistent:
          (sensorData.humidity ?? 55) >= t.humidityMin &&
          (sensorData.humidity ?? 55) <= t.humidityMax,
        airQualityConsistent:
          (sensorData.airQualityPercent ?? 50) >= t.airQualityMin,
        alertLevel:
          parsed.urgencyLevel === "critique"
            ? "high"
            : parsed.urgencyLevel === "attention"
              ? "medium"
              : "none",
      },
      advices:
        Array.isArray(parsed.advices) && parsed.advices.length > 0
          ? parsed.advices.slice(0, 3)
          : [
              "Surveillance continue",
              "Vérifier capteurs",
              "Maintenance préventive",
            ],
    };

    const imageSizeKb = Math.round((imageBase64.length * 3) / 4 / 1024);

    return {
      ...validated,
      confidence: 85,
      imageQuality: {
        sizeKb: imageSizeKb,
        status:
          imageSizeKb < 10 ? "poor" : imageSizeKb < 25 ? "acceptable" : "good",
      },
    };
  } catch (err) {
    console.error(
      "[AI SERVICE] Erreur Cloudflare :",
      err.response?.data?.errors?.[0]?.message || err.message,
    );
    throw new Error(`Cloudflare AI échoué : ${err.message}`);
  }
}

// ============================================================
// Analyse par capteurs uniquement (fallback gratuit)
// ============================================================
function analyzeWithSensorsOnly(imageBase64, sensorData, thresholds = {}) {
  console.log("[AI SERVICE] 📊 Analyse par capteurs (sans cloud IA)...");

  const t = {
    temperatureMin: 18,
    temperatureMax: 28,
    humidityMin: 40,
    humidityMax: 70,
    airQualityMin: 20,
    waterLevelMin: 20,
    ...thresholds,
  };

  let healthScore = 85;
  let urgencyLevel = "normal";
  let diagnostic = "Analyse basée sur les capteurs. ";
  let alertLevel = "none";

  // Air Quality
  if (sensorData.airQualityPercent !== null) {
    if (sensorData.airQualityPercent < 20) {
      healthScore -= 35;
      urgencyLevel = "critique";
      diagnostic += "Qualité de l'air CRITIQUE. ";
      alertLevel = "high";
    } else if (sensorData.airQualityPercent < 40) {
      healthScore -= 20;
      urgencyLevel = "attention";
      diagnostic += "Qualité de l'air dégradée. ";
      alertLevel = "medium";
    }
  }

  // Temperature
  if (sensorData.temperature !== null) {
    if (sensorData.temperature > t.temperatureMax + 3) {
      healthScore -= 20;
      urgencyLevel = urgencyLevel === "critique" ? "critique" : "attention";
      diagnostic += `Température élevée (${sensorData.temperature}°C). `;
      alertLevel = alertLevel === "high" ? "high" : "medium";
    } else if (sensorData.temperature < t.temperatureMin - 3) {
      healthScore -= 15;
      urgencyLevel = urgencyLevel === "critique" ? "critique" : "attention";
      diagnostic += `Température basse (${sensorData.temperature}°C). `;
      alertLevel = alertLevel === "high" ? "high" : "medium";
    }
  }

  // Humidity
  if (sensorData.humidity !== null) {
    if (sensorData.humidity > t.humidityMax + 10) {
      healthScore -= 10;
      diagnostic += "Humidité excessive. ";
    } else if (sensorData.humidity < t.humidityMin - 10) {
      healthScore -= 5;
      diagnostic += "Air trop sec. ";
    }
  }

  // Water
  if (
    sensorData.waterLevel !== null &&
    sensorData.waterLevel < t.waterLevelMin
  ) {
    healthScore -= 15;
    urgencyLevel = urgencyLevel === "critique" ? "critique" : "attention";
    diagnostic += "Niveau d'eau bas. ";
    alertLevel = alertLevel === "high" ? "high" : "medium";
  }

  // Density
  if (sensorData.animalCount && sensorData.surface) {
    const density = sensorData.animalCount / sensorData.surface;
    if (density > 15) {
      healthScore -= 10;
      diagnostic += "Densité élevée. ";
    }
  }

  healthScore = Math.max(0, Math.min(100, healthScore));
  if (healthScore < 30) urgencyLevel = "critique";
  else if (healthScore < 50 && urgencyLevel === "normal")
    urgencyLevel = "attention";

  if (urgencyLevel === "normal") diagnostic += "État général satisfaisant.";
  else if (urgencyLevel === "attention")
    diagnostic += "Surveillance recommandée.";
  else diagnostic += "ACTION IMMÉDIATE REQUISE.";

  const advices = [];
  if (urgencyLevel === "critique") {
    advices.push("🚨 Activer ventilation d'urgence");
    advices.push("🚨 Vérifier système de refroidissement");
    advices.push("🚨 Inspection immédiate");
  } else if (urgencyLevel === "attention") {
    advices.push("⚠️ Surveiller les prochaines 2 heures");
    advices.push("⚠️ Vérifier capteurs et ventilation");
    advices.push("⚠️ Préparer intervention");
  } else {
    advices.push("✅ Continuer surveillance régulière");
    advices.push("📊 Vérifier tendances sur 24h");
    advices.push("🔧 Maintenance préventive");
  }

  const imageSizeKb = Math.round((imageBase64.length * 3) / 4 / 1024);

  return {
    healthScore,
    urgencyLevel,
    diagnostic,
    detections: {
      behaviorNormal: healthScore > 60,
      mortalityDetected: false,
      mortalityCount: null,
      densityOk: true,
      cleanEnvironment: healthScore > 50,
      ventilationAdequate: sensorData.airQualityPercent >= 40,
    },
    airQualityAssessment: {
      visualConsistency: "matches_sensor",
      estimatedRisk: alertLevel,
      observedSigns: [],
    },
    sensorCorrelation: {
      temperatureConsistent:
        (sensorData.temperature ?? 22) >= t.temperatureMin &&
        (sensorData.temperature ?? 22) <= t.temperatureMax,
      humidityConsistent:
        (sensorData.humidity ?? 55) >= t.humidityMin &&
        (sensorData.humidity ?? 55) <= t.humidityMax,
      airQualityConsistent:
        (sensorData.airQualityPercent ?? 50) >= t.airQualityMin,
      alertLevel,
    },
    advices,
    confidence: 70,
    imageQuality: {
      sizeKb: imageSizeKb,
      status:
        imageSizeKb < 10 ? "poor" : imageSizeKb < 25 ? "acceptable" : "good",
    },
  };
}

// ============================================================
// Fonction principale — Auto-switch Cloudflare / Capteurs
// ============================================================
async function analyzeWithGemini(imageBase64, sensorData, thresholds) {
  if (USE_CLOUDFLARE) {
    try {
      return await analyzeWithCloudflare(imageBase64, sensorData, thresholds);
    } catch (err) {
      console.warn(
        "[AI SERVICE] Cloudflare échoué, fallback capteurs :",
        err.message,
      );
      return analyzeWithSensorsOnly(imageBase64, sensorData, thresholds);
    }
  }
  return analyzeWithSensorsOnly(imageBase64, sensorData, thresholds);
}

module.exports = {
  publishCaptureTrigger,
  analyzeWithGemini,
  captureFromESP32,
};
