const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const { analyzeWithCloudflareAI } = require("../services/aiService");
const fs = require("fs");

// ← Change ce chemin vers ton image
const imagePath =
  "C:/Users/admin/OneDrive/Bureau/Smart-Poultry-Projet/backend/test/poults3.jpg";

async function run() {
  const imageBase64 = fs.readFileSync(imagePath, "base64");

  console.log(`Image chargée : ${Math.round(imageBase64.length / 1024)} Ko`);

  const sensorData = {
    temperature: 26,
    humidity: 55,
    airQualityPercent: 75,
    waterLevel: 60,
    animalCount: 120,
    surface: 50,
  };

  const result = await analyzeWithCloudflareAI(imageBase64, sensorData, {});

  console.log("\n=== RÉSULTAT ===");
  console.log("Score santé :", result.healthScore);
  console.log("Urgence :", result.urgencyLevel);
  console.log("Image usable :", result.imageUsable);
  console.log("Diagnostic :", result.diagnostic);

  console.log("Morts détectés :", result.detections?.nombreMorts);

  console.log("Comptage :", result.comptage?.estimation, "volailles");

  console.log("Fiabilité :", result.comptage?.fiabilite);

  console.log(
    "Maladie :",
    result.maladie_suspectee?.suspicion
      ? result.maladie_suspectee.maladie_probable
      : "aucune",
  );

  console.log("Conseils :", result.advices);
}

run().catch(console.error);
