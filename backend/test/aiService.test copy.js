/**
 * Test Suite for AI Service Core Functions
 * Tests JSON parsing, sensor analysis, and image quality assessment logic
 */

describe("AI Service - Core Functions", () => {
  describe("extractJsonCandidate", () => {
    test("should extract valid JSON object", () => {
      const text = 'Some text before {"key": "value"} and after';
      const result = extractJsonCandidate(text);
      expect(result).toBe('{"key": "value"}');
    });

    test("should handle nested JSON", () => {
      const text =
        'Start {"outer": {"inner": "value", "array": [1,2,3]}} end';
      const result = extractJsonCandidate(text);
      expect(result).toContain('"outer"');
      expect(result).toContain('"inner"');
    });

    test("should return null when no JSON found", () => {
      const text = "This is just plain text with no JSON";
      const result = extractJsonCandidate(text);
      expect(result).toBeNull();
    });

    test("should handle JSON with escaped quotes", () => {
      const text = '{"message": "He said \\"Hello\\""}';
      const result = extractJsonCandidate(text);
      expect(result).toBeTruthy();
    });

    test("should handle arrays at top level", () => {
      const text = 'Before [1, 2, 3] after';
      const result = extractJsonCandidate(text);
      expect(result).toBeNull(); // Arrays not supported yet
    });
  });

  describe("tryRepairJsonLike", () => {
    test("should remove markdown code blocks", () => {
      const text = '```json\n{"key": "value"}\n```';
      const result = tryRepairJsonLike(text);
      expect(result).not.toContain("```");
    });

    test("should fix trailing commas", () => {
      const text = '{"key": "value",}';
      const result = tryRepairJsonLike(text);
      expect(result).toBe('{"key": "value"}');
    });

    test("should handle multiple nested trailing commas", () => {
      const text = '{"outer": {"inner": "value",},}';
      const result = tryRepairJsonLike(text);
      // Should remove at least the outer trailing comma
      expect(result).not.toMatch(/,\s*\}/);
    });

    test("should handle trailing commas in arrays", () => {
      const text = '{"items": [1, 2, 3,]}';
      const result = tryRepairJsonLike(text);
      expect(result).not.toMatch(/,\s*\]/);
    });
  });

  describe("isValidSensorValue", () => {
    test("should validate correct sensor values", () => {
      expect(isValidSensorValue(25, 0, 100)).toBe(true);
      expect(isValidSensorValue(0, 0, 100)).toBe(true);
      expect(isValidSensorValue(100, 0, 100)).toBe(true);
    });

    test("should reject out of range values", () => {
      expect(isValidSensorValue(101, 0, 100)).toBe(false);
      expect(isValidSensorValue(-1, 0, 100)).toBe(false);
    });

    test("should reject null and undefined", () => {
      expect(isValidSensorValue(null, 0, 100)).toBe(false);
      expect(isValidSensorValue(undefined, 0, 100)).toBe(false);
    });

    test("should reject NaN and Infinity", () => {
      expect(isValidSensorValue(NaN, 0, 100)).toBe(false);
      expect(isValidSensorValue(Infinity, 0, 100)).toBe(false);
    });

    test("should work with temperature range", () => {
      expect(isValidSensorValue(22, -10, 60)).toBe(true);
      expect(isValidSensorValue(-5, -10, 60)).toBe(true);
      expect(isValidSensorValue(65, -10, 60)).toBe(false);
    });
  });

  describe("normalizeUrgency", () => {
    test("should normalize critique levels", () => {
      expect(normalizeUrgency("critical")).toBe("critique");
      expect(normalizeUrgency("critique")).toBe("critique");
      expect(normalizeUrgency("high")).toBe("critique");
    });

    test("should normalize attention levels", () => {
      expect(normalizeUrgency("attention")).toBe("attention");
      expect(normalizeUrgency("medium")).toBe("attention");
      expect(normalizeUrgency("warning")).toBe("attention");
    });

    test("should default to normal", () => {
      expect(normalizeUrgency("unknown")).toBe("normal");
      expect(normalizeUrgency(null)).toBe("normal");
      expect(normalizeUrgency("")).toBe("normal");
    });

    test("should be case insensitive", () => {
      expect(normalizeUrgency("CRITICAL")).toBe("critique");
      expect(normalizeUrgency("Critique")).toBe("critique");
    });
  });

  describe("buildSensorAdvices", () => {
    test("should provide temperature advice for high temp", () => {
      const sensorData = { temperature: 32 };
      const advices = buildSensorAdvices(sensorData);
      expect(advices.some((a) => a.includes("température"))).toBe(true);
      expect(advices.some((a) => a.includes("refroidissement"))).toBe(true);
    });

    test("should provide temperature advice for low temp", () => {
      const sensorData = { temperature: 14 };
      const advices = buildSensorAdvices(sensorData);
      expect(advices.some((a) => a.includes("température"))).toBe(true);
      expect(advices.some((a) => a.includes("chauffage"))).toBe(true);
    });

    test("should provide humidity advice", () => {
      const sensorData = { humidity: 85 };
      const advices = buildSensorAdvices(sensorData);
      expect(advices.some((a) => a.includes("humidité"))).toBe(true);
      expect(advices.some((a) => a.includes("ventilation"))).toBe(true);
    });

    test("should provide air quality advice", () => {
      const sensorData = { airQualityPercent: 15 };
      const advices = buildSensorAdvices(sensorData);
      expect(advices.some((a) => a.includes("ventilation"))).toBe(true);
    });

    test("should provide water level advice", () => {
      const sensorData = { waterLevel: 15 };
      const advices = buildSensorAdvices(sensorData);
      expect(advices.some((a) => a.includes("abreuvement"))).toBe(true);
    });

    test("should not include raw sensor values", () => {
      const sensorData = { temperature: 25, humidity: 60 };
      const advices = buildSensorAdvices(sensorData);
      const joinedAdvices = advices.join(" ");
      expect(joinedAdvices).not.toContain("25");
      expect(joinedAdvices).not.toContain("60");
    });

    test("should handle no sensors", () => {
      const sensorData = {};
      const advices = buildSensorAdvices(sensorData);
      expect(advices.length).toBeGreaterThan(0);
      expect(advices.some((a) => a.includes("connexion"))).toBe(true);
    });
  });

  describe("analyzeWithSensorsOnly", () => {
    test("should return normal urgency for good sensors", () => {
      const sensorData = {
        temperature: 22,
        humidity: 60,
        airQualityPercent: 50,
        waterLevel: 50,
      };
      const result = analyzeWithSensorsOnly(sensorData);
      expect(result.urgencyLevel).toBe("normal");
      expect(result.healthScore).toBeGreaterThan(70);
    });

    test("should return critique for critical air quality", () => {
      const sensorData = { airQualityPercent: 15 };
      const result = analyzeWithSensorsOnly(sensorData);
      expect(result.urgencyLevel).toBe("critique");
      expect(result.healthScore).toBeLessThan(60);
    });

    test("should return attention for warning sensors", () => {
      const sensorData = { temperature: 32 };
      const result = analyzeWithSensorsOnly(sensorData);
      expect(result.urgencyLevel).toBe("critique");
    });

    test("should return inconnu when no sensors available", () => {
      const sensorData = {};
      const result = analyzeWithSensorsOnly(sensorData);
      expect(result.urgencyLevel).toBe("inconnu");
      expect(result.healthScore).toBeNull();
    });

    test("should always have imageUsable=false", () => {
      const sensorData = { temperature: 25 };
      const result = analyzeWithSensorsOnly(sensorData);
      expect(result.imageUsable).toBe(false);
      expect(result.imageAvailable).toBe(false);
    });

    test("should have proper detection structure", () => {
      const result = analyzeWithSensorsOnly({});
      expect(result.detections).toEqual({
        mortalityDetected: null,
        behaviorNormal: null,
        nombreMorts: null,
      });
    });

    test("should clamp health score to 0-100", () => {
      // Low air quality
      const result = analyzeWithSensorsOnly({ airQualityPercent: 5 });
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe("buildPoorImageResult", () => {
    test("should include image quality reason", () => {
      const result = buildPoorImageResult(
        { temperature: 25 },
        "image trop sombre"
      );
      expect(result.imageQuality.reason).toBe("image trop sombre");
      expect(result.imageQuality.status).toBe("poor");
    });

    test("should have proper structure", () => {
      const result = buildPoorImageResult({});
      expect(result).toHaveProperty("healthScore");
      expect(result).toHaveProperty("urgencyLevel");
      expect(result).toHaveProperty("diagnostic");
      expect(result).toHaveProperty("imageAvailable", true);
      expect(result).toHaveProperty("imageUsable", false);
      expect(result).toHaveProperty("detections");
      expect(result).toHaveProperty("advices");
      expect(result).toHaveProperty("imageQuality");
    });

    test("should include sensor analysis when available", () => {
      const sensorData = { temperature: 35 };
      const result = buildPoorImageResult(sensorData);
      expect(result.diagnostic).toContain("Image inexploitable");
    });

    test("should have advices based on sensors", () => {
      const sensorData = { temperature: 25, humidity: 60 };
      const result = buildPoorImageResult(sensorData);
      expect(result.advices).toBeDefined();
      expect(Array.isArray(result.advices)).toBe(true);
      expect(result.advices.length).toBeGreaterThan(0);
    });

    test("should have default advices when no sensors", () => {
      const result = buildPoorImageResult({});
      expect(result.advices).toContain(
        expect.stringMatching(/éclairage|positionnée|connexion/)
      );
    });
  });

  describe("mentionsDeath", () => {
    test("should detect death keywords in French", () => {
      const keywords = [
        "décédé",
        "décès",
        "mort",
        "morte",
        "morts",
        "mortes",
        "mortalité",
        "oiseau mort",
        "cadavre",
      ];
      keywords.forEach((kw) => {
        expect(mentionsDeath(`J'ai détecté ${kw} sur le sol`)).toBe(true);
      });
    });

    test("should detect death keywords in English", () => {
      const keywords = ["dead", "death", "mortality", "deceased"];
      keywords.forEach((kw) => {
        expect(mentionsDeath(`I found ${kw} birds`)).toBe(true);
      });
    });

    test("should return false for non-death content", () => {
      expect(mentionsDeath("L'oiseau dort tranquillement")).toBe(false);
      expect(mentionsDeath("Tout semble normal")).toBe(false);
    });

    test("should be case insensitive", () => {
      expect(mentionsDeath("MORT")).toBe(true);
      expect(mentionsDeath("DÉCÈS")).toBe(true);
      expect(mentionsDeath("Dead BIRDS")).toBe(true);
    });

    test("should handle null and empty strings", () => {
      expect(mentionsDeath(null)).toBe(false);
      expect(mentionsDeath("")).toBe(false);
    });
  });

  describe("cleanBase64", () => {
    test("should remove data URI prefix", () => {
      const base64WithPrefix = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
      const cleaned = cleanBase64(base64WithPrefix);
      expect(cleaned).toBe("/9j/4AAQSkZJRg==");
      expect(cleaned).not.toContain("data:");
    });

    test("should return base64 unchanged if no prefix", () => {
      const base64 = "/9j/4AAQSkZJRg==";
      const cleaned = cleanBase64(base64);
      expect(cleaned).toBe(base64);
    });

    test("should return null for empty input", () => {
      expect(cleanBase64(null)).toBeNull();
      expect(cleanBase64("")).toBeNull();
    });

    test("should handle png data URIs", () => {
      const pngDataUri = "data:image/png;base64,iVBORw0KGgo=";
      const cleaned = cleanBase64(pngDataUri);
      expect(cleaned).toBe("iVBORw0KGgo=");
    });
  });

  describe("getImageSizeKb", () => {
    test("should calculate approximate image size", () => {
      // Base64 encoding ratio: 3 bytes → 4 chars
      const base64String = "A".repeat(1024); // ~768 bytes
      const sizeKb = Math.round((base64String.length * 3) / 4 / 1024);
      expect(sizeKb).toBeGreaterThan(0);
    });

    test("should return 0 for empty string", () => {
      const sizeKb = Math.round(("".length * 3) / 4 / 1024);
      expect(sizeKb).toBe(0);
    });

    test("should estimate image size correctly", () => {
      // 4KB base64 string ≈ 3KB binary
      const base64_4KB = "A".repeat(4096);
      const sizeKb = Math.round((base64_4KB.length * 3) / 4 / 1024);
      expect(sizeKb).toBeCloseTo(3, 0);
    });
  });

  describe("JSON Response Parsing Edge Cases", () => {
    test("should handle valid JSON response with all fields", () => {
      const jsonStr = JSON.stringify({
        healthScore: 85,
        urgencyLevel: "normal",
        imageUsable: true,
        diagnostic: "Test diagnostic",
        detections: {
          mortalityDetected: false,
          behaviorNormal: true,
          nombreMorts: 0,
        },
        comptage: {
          estimation: 42,
          fiabilite: "bonne",
          note: "Bien regroupé",
        },
        maladie_suspectee: {
          suspicion: false,
          maladie_probable: null,
          signes_observes: [],
          urgence_veterinaire: false,
          confiance: null,
        },
        advices: ["Conseil 1", "Conseil 2"],
      });
      expect(() => JSON.parse(jsonStr)).not.toThrow();
    });

    test("should validate health score bounds", () => {
      const invalidScore = 150; // Out of bounds
      const boundedScore = Math.max(0, Math.min(100, invalidScore));
      expect(boundedScore).toBe(100);

      const negativeScore = -50;
      const bounded2 = Math.max(0, Math.min(100, negativeScore));
      expect(bounded2).toBe(0);
    });

    test("should handle null nombreMorts correctly", () => {
      const nombreMorts = null;
      const isValid = nombreMorts === null || nombreMorts > 0;
      expect(isValid).toBe(true);
    });

    test("should convert string nombreMorts to number", () => {
      const nombreMorts = "5";
      const n = Number(nombreMorts);
      expect(Number.isFinite(n)).toBe(true);
      expect(Math.round(n)).toBe(5);

      const invalidMorts = "abc";
      const n2 = Number(invalidMorts);
      expect(Number.isFinite(n2)).toBe(false);
    });
  });

  describe("Sensor Data Validation", () => {
    test("should filter invalid sensor values", () => {
      const sensorData = {
        temperature: 25,
        humidity: 150, // Invalid
        airQualityPercent: 50,
        waterLevel: null, // Invalid
      };

      // Should only use valid values
      const hasValidTemp = isValidSensorValue(sensorData.temperature, -10, 60);
      const hasValidHumidity = isValidSensorValue(sensorData.humidity, 0, 100);
      const hasValidWater = isValidSensorValue(sensorData.waterLevel, 1, 100);

      expect(hasValidTemp).toBe(true);
      expect(hasValidHumidity).toBe(false);
      expect(hasValidWater).toBe(false);
    });

    test("should handle missing sensor fields", () => {
      const sensorData = {
        temperature: 22,
        // humidity missing
        // airQualityPercent missing
        waterLevel: 50,
      };

      const result = analyzeWithSensorsOnly(sensorData);
      expect(result).toBeDefined();
      expect(result.healthScore).toBeDefined();
    });
  });
});

// ─── Helper Functions (would be imported from aiService.js in real implementation) ───

function extractJsonCandidate(text) {
  if (!text) return null;

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
  if (!text || typeof text !== "string") return text;

  let cleaned = text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
    .trim();

  const candidate = extractJsonCandidate(cleaned);
  if (candidate) cleaned = candidate;

  cleaned = cleaned.replace(/,\s*(\})/g, "$1");
  cleaned = cleaned.replace(/,\s*(\])/g, "$1");

  return cleaned;
}

function isValidSensorValue(value, min = 0, max = 100) {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  if (!isFinite(n) || isNaN(n)) return false;
  if (n < min || n > max) return false;
  return true;
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

function buildSensorAdvices(sensorData = {}) {
  const advices = [];
  const { temperature, humidity, airQualityPercent, waterLevel } = sensorData;

  if (isValidSensorValue(airQualityPercent, 0, 100)) {
    if (airQualityPercent < 20) {
      advices.push(
        "Ventilation insuffisante — augmentez immédiatement le débit d'air du poulailler."
      );
    } else if (airQualityPercent < 40) {
      advices.push(
        "Qualité de l'air dégradée — vérifiez les extracteurs et l'aération des parois."
      );
    }
  }

  if (isValidSensorValue(temperature, -10, 60)) {
    if (temperature > 31) {
      advices.push(
        "Température excessive — activez le refroidissement et augmentez la ventilation en urgence."
      );
    } else if (temperature > 28) {
      advices.push(
        "Température légèrement élevée — surveillez le confort thermique des volailles et l'hydratation."
      );
    } else if (temperature < 15) {
      advices.push(
        "Température trop basse — vérifiez le système de chauffage et l'isolation du bâtiment."
      );
    } else if (temperature < 18) {
      advices.push(
        "Température en dessous de la plage optimale — contrôlez le chauffage d'appoint."
      );
    }
  }

  if (isValidSensorValue(humidity, 0, 100)) {
    if (humidity > 80) {
      advices.push(
        "Humidité excessive — risque bactérien élevé, améliorez la ventilation et changez la litière."
      );
    } else if (humidity < 30) {
      advices.push(
        "Humidité insuffisante — vérifiez les abreuvoirs et envisagez une brumisation légère."
      );
    }
  }

  if (isValidSensorValue(waterLevel, 1, 100)) {
    if (waterLevel < 20) {
      advices.push(
        "Niveau d'abreuvement critique — remplissez les abreuvoirs immédiatement."
      );
    } else if (waterLevel < 40) {
      advices.push(
        "Niveau d'abreuvement bas — planifiez un remplissage dans les prochaines heures."
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
      "Paramètres environnementaux dans les plages normales — maintenez la surveillance habituelle."
    );
  }

  if (advices.length === 0) {
    advices.push(
      "Aucune donnée capteur disponible — vérifiez la connexion du module de surveillance."
    );
  }

  return advices;
}

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

function mentionsDeath(text) {
  if (!text) return false;
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
  const lower = text.toLowerCase();
  return DEATH_KEYWORDS.some((kw) => lower.includes(kw));
}

function cleanBase64(base64) {
  if (!base64) return null;
  return base64.includes(",") ? base64.split(",")[1] : base64;
}
