// ─────────────────────────────────────────────────────────────
// sensors.js
// Calcul du status à partir des seuils de la BD (pas hardcodés)
// ─────────────────────────────────────────────────────────────

/**
 * Calcule le status d'un capteur en comparant sa valeur
 * aux seuils enregistrés dans la BD pour ce poulailler.
 *
 * @param {string} key          - clé du capteur (ex: "temperature")
 * @param {number|string} value - valeur actuelle du capteur
 * @param {object} dbThresholds - seuils venant de la BD, structure :
 *   {
 *     temperature: { min: 11, max: 12 },
 *     humidity:    { min: 30, max: 60 },
 *     co2:         { max: 1500 },
 *     nh3:         { max: 25 },
 *     waterLevel:  { min: 20 }
 *   }
 * @returns {"normal"|"warn"|"danger"}
 */
export function getSensorStatus(key, value, dbThresholds) {
  const t = dbThresholds?.[key];
  if (!t) return "normal";

  const val = Number(value);
  if (isNaN(val)) return "normal";

  const max = t.max !== undefined ? Number(t.max) : null;
  const min = t.min !== undefined ? Number(t.min) : null;

  // Dépassement max
  if (max !== null && val > max) {
    // danger si > max + marge (10% du max ou valeur fixe selon capteur)
    const dangerMargin = DANGER_MARGINS[key] ?? max * 0.1;
    return val > max + dangerMargin ? "danger" : "warn";
  }

  // En dessous du min
  if (min !== null && val < min) {
    const dangerMargin = DANGER_MARGINS[key] ?? Math.abs(min) * 0.1;
    return val < min - dangerMargin ? "danger" : "warn";
  }

  return "normal";
}

// Marge supplémentaire au-delà du seuil max/min pour passer en "danger"
// Ajuste ces valeurs selon les besoins zootechniques
const DANGER_MARGINS = {
  temperature: 3, // warn si > max, danger si > max + 3°C
  humidity: 10, // warn si > max, danger si > max + 10%
  co2: 500, // warn si > max, danger si > max + 500 ppm
  nh3: 10, // warn si > max, danger si > max + 10 ppm
  dust: 100, // warn si > max, danger si > max + 100 µg/m³
  waterLevel: 10, // warn si < min, danger si < min - 10%
};

/**
 * Construit le tableau de capteurs prêt pour OverviewTab,
 * en utilisant les seuils de la BD.
 *
 * @param {object} sensorValues  - valeurs en direct (MQTT/API)
 *   ex: { temperature: 20.5, humidity: 64.8, co2: 0, nh3: 0, waterLevel: 0 }
 * @param {object} dbThresholds  - seuils venant de la BD
 * @param {Array}  sensorConfig  - SENSOR_CONFIG depuis sensorsConfig.js
 * @returns {Array} sensors
 */
export function buildSensors(sensorValues, dbThresholds, sensorConfig) {
  return sensorConfig.map((config) => {
    const value = sensorValues?.[config.key] ?? 0;
    const status = getSensorStatus(config.key, value, dbThresholds);
    return {
      ...config,
      value,
      status,
    };
  });
}

/**
 * Construit l'objet thresholds attendu par OverviewTab
 * (pour afficher les labels warn/danger sur les cartes)
 * à partir des seuils BD + les marges danger.
 *
 * @param {object} dbThresholds
 * @returns {object}
 */
export function buildThresholds(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};
  for (const key of Object.keys(dbThresholds)) {
    const t = dbThresholds[key];
    const margin = DANGER_MARGINS[key] ?? 0;
    result[key] = {
      // Seuil d'avertissement = valeur max/min de la BD
      warn:
        t.max !== undefined
          ? `max ${t.max}`
          : t.min !== undefined
            ? `min ${t.min}`
            : null,
      // Seuil danger = max/min + marge
      danger:
        t.max !== undefined
          ? `max ${t.max + margin}`
          : t.min !== undefined
            ? `min ${t.min - margin}`
            : null,
    };
  }
  return result;
}
