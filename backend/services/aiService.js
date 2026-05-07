const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================================
// Récupère l'image depuis l'ESP32-CAM
// ============================================================
async function captureFromESP32(espIpAddress) {
  const url = `http://${espIpAddress}/capture`;
  console.log(`[AI SERVICE] Capture depuis ${url}`);

  const response = await axios.get(url, { timeout: 10000 });

  if (!response.data?.success || !response.data?.image) {
    throw new Error("ESP32-CAM n'a pas retourné d'image valide");
  }

  return response.data.image; // Base64 string
}

// ============================================================
// Analyse l'image avec Google Gemini Vision
// ============================================================
async function analyzeWithGemini(imageBase64, sensorData) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Tu es un expert vétérinaire spécialisé en aviculture avec 20 ans d'expérience.
Analyse cette image du poulailler avec les données capteurs suivantes :
- Température : ${sensorData.temperature ?? "N/A"}°C
- Humidité : ${sensorData.humidity ?? "N/A"}%
- CO2 : ${sensorData.co2 ?? "N/A"} ppm
- NH3 : ${sensorData.nh3 ?? "N/A"} ppm
- Nombre de volailles : ${sensorData.animalCount ?? "N/A"}
- Surface : ${sensorData.surface ?? "N/A"} m²

Détecte et évalue :
1. Le comportement des volailles (normal ou anormal)
2. Toute mortalité visible
3. La densité visuelle (trop dense ou acceptable)
4. La propreté générale du poulailler

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après, avec exactement cette structure :
{
  "healthScore": 85,
  "urgencyLevel": "normal",
  "diagnostic": "Texte court du diagnostic en français",
  "detections": {
    "behaviorNormal": true,
    "mortalityDetected": false,
    "densityOk": true,
    "cleanEnvironment": true
  },
  "advices": ["Conseil 1", "Conseil 2", "Conseil 3"]
}
urgencyLevel doit être exactement : normal, attention, ou critique.`;

  const imagePart = {
    inlineData: {
      data: imageBase64,
      mimeType: "image/jpeg",
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const text = result.response.text();

  // Nettoyer la réponse (enlever les backticks si présents)
  const clean = text.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error("[AI SERVICE] Réponse Gemini non parseable :", text);
    throw new Error("Gemini n'a pas retourné un JSON valide");
  }

  // Validation des champs obligatoires
  const required = [
    "healthScore",
    "urgencyLevel",
    "diagnostic",
    "detections",
    "advices",
  ];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Champ manquant dans la réponse Gemini : ${field}`);
    }
  }

  return parsed;
}

module.exports = { captureFromESP32, analyzeWithGemini };
