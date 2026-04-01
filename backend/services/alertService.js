/**
 * AlertService — Smart Poultry
 *
 * Gère la création d'alertes pour tous les événements du système :
 *   • Capteurs (température, humidité, CO₂, NH₃, poussière, niveau d'eau)
 *   • Porte (ouverture / fermeture manuelle ou planifiée)
 *   • Actionneurs (ventilateur, lampe)
 *   • MQTT (connexion / déconnexion)
 */

const Alert = require("../models/Alert");

// ─── Labels et unités par paramètre capteur ───────────────────────────────
const PARAM_LABELS = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

const PARAM_UNITS = {
  temperature: "°C",
  humidity: "%",
  co2: "ppm",
  nh3: "ppm",
  dust: "µg/m³",
  waterLevel: "%",
};

// ─── Cache anti-doublon (TTL configurable par type d'alerte) ──────────────
const alertCache = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes pour capteurs

const getCacheKey = (poultryId, type, key, severity) =>
  `${poultryId}:${type}:${key}:${severity}`;

const purgeExpiredCache = () => {
  const now = Date.now();
  for (const [k, v] of alertCache.entries()) {
    if (now - v.timestamp > (v.ttl ?? DEFAULT_TTL_MS)) alertCache.delete(k);
  }
};

const shouldCreateAlert = (poultryId, type, key, severity) => {
  purgeExpiredCache();
  const cacheKey = getCacheKey(poultryId, type, key, severity);
  const cached = alertCache.get(cacheKey);
  if (cached) return { shouldCreate: false, existingAlertId: cached.alertId };
  return { shouldCreate: true };
};

const cacheAlert = (poultryId, type, key, severity, alertId, ttl) => {
  const cacheKey = getCacheKey(poultryId, type, key, severity);
  alertCache.set(cacheKey, {
    alertId,
    timestamp: Date.now(),
    ttl: ttl ?? DEFAULT_TTL_MS,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. ALERTES CAPTEURS
// ─────────────────────────────────────────────────────────────────────────────
const createSensorAlert = async (
  poultryId,
  parameter,
  value,
  threshold,
  severity,
) => {
  try {
    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "sensor",
      parameter,
      severity,
    );

    if (!shouldCreate) {
      console.log(`[AlertService] Doublon bloqué — ${parameter} (${severity})`);
      return existingAlertId;
    }

    const label = PARAM_LABELS[parameter] || parameter;
    const unit = PARAM_UNITS[parameter] || "";
    const icon = severity === "danger" ? "🔴" : "⚠️";
    const direction = value > threshold ? "above" : "below";
    const dirLabel =
      direction === "above" ? "dépasse le seuil" : "est en dessous du seuil";

    const valStr = typeof value === "number" ? value.toFixed(1) : "?";
    const thresStr = typeof threshold === "number" ? threshold.toFixed(1) : "?";
    const message = `${label} ${dirLabel} : ${valStr}${unit} (seuil : ${thresStr}${unit})`;

    const alert = await Alert.create({
      poulailler: poultryId,
      type: "sensor",
      key: parameter,
      parameter,
      value,
      threshold,
      direction,
      severity,
      icon,
      message,
      read: false,
    });

    cacheAlert(poultryId, "sensor", parameter, severity, alert._id);
    console.log(`[AlertService] ✅ Capteur — ${message}`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createSensorAlert :", err.message);
    return null;
  }
};

const checkSensorThresholds = async (
  poultryId,
  measurementData,
  thresholds,
) => {
  const createdAlerts = [];
  const t = thresholds || {};

  if (measurementData.temperature != null) {
    const val = measurementData.temperature;
    const max = t.temperatureMax ?? 35;
    const min = t.temperatureMin ?? 15;
    const warnMax = t.temperatureWarnMax ?? max * 0.9;
    const warnMin = t.temperatureWarnMin ?? min * 1.15;

    if (val >= max) {
      const id = await createSensorAlert(
        poultryId,
        "temperature",
        val,
        max,
        "danger",
      );
      if (id) createdAlerts.push(id);
    } else if (val >= warnMax) {
      const id = await createSensorAlert(
        poultryId,
        "temperature",
        val,
        warnMax,
        "warn",
      );
      if (id) createdAlerts.push(id);
    } else if (val <= min) {
      const id = await createSensorAlert(
        poultryId,
        "temperature",
        val,
        min,
        "danger",
      );
      if (id) createdAlerts.push(id);
    } else if (val <= warnMin) {
      const id = await createSensorAlert(
        poultryId,
        "temperature",
        val,
        warnMin,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  if (measurementData.humidity != null) {
    const val = measurementData.humidity;
    const max = t.humidityMax ?? 80;
    const min = t.humidityMin ?? 40;
    const warnMax = t.humidityWarnMax ?? max * 0.9;
    const warnMin = t.humidityWarnMin ?? min * 1.1;

    if (val >= max) {
      const id = await createSensorAlert(
        poultryId,
        "humidity",
        val,
        max,
        "danger",
      );
      if (id) createdAlerts.push(id);
    } else if (val >= warnMax) {
      const id = await createSensorAlert(
        poultryId,
        "humidity",
        val,
        warnMax,
        "warn",
      );
      if (id) createdAlerts.push(id);
    } else if (val <= min) {
      const id = await createSensorAlert(
        poultryId,
        "humidity",
        val,
        min,
        "danger",
      );
      if (id) createdAlerts.push(id);
    } else if (val <= warnMin) {
      const id = await createSensorAlert(
        poultryId,
        "humidity",
        val,
        warnMin,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  if (measurementData.co2 != null) {
    const val = measurementData.co2;
    const max = t.co2Max ?? 2000;
    const warnMax = t.co2WarnMax ?? 1000;

    if (val >= max) {
      const id = await createSensorAlert(poultryId, "co2", val, max, "danger");
      if (id) createdAlerts.push(id);
    } else if (val >= warnMax) {
      const id = await createSensorAlert(
        poultryId,
        "co2",
        val,
        warnMax,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  if (measurementData.nh3 != null) {
    const val = measurementData.nh3;
    const max = t.nh3Max ?? 35;
    const warnMax = t.nh3WarnMax ?? 20;

    if (val >= max) {
      const id = await createSensorAlert(poultryId, "nh3", val, max, "danger");
      if (id) createdAlerts.push(id);
    } else if (val >= warnMax) {
      const id = await createSensorAlert(
        poultryId,
        "nh3",
        val,
        warnMax,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  if (measurementData.dust != null) {
    const val = measurementData.dust;
    const max = t.dustMax ?? 250;
    const warnMax = t.dustWarnMax ?? 150;

    if (val >= max) {
      const id = await createSensorAlert(poultryId, "dust", val, max, "danger");
      if (id) createdAlerts.push(id);
    } else if (val >= warnMax) {
      const id = await createSensorAlert(
        poultryId,
        "dust",
        val,
        warnMax,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  if (measurementData.waterLevel != null) {
    const val = measurementData.waterLevel;
    const min = t.waterLevelMin ?? 20;
    const warnMin = t.waterLevelWarnMin ?? 35;

    if (val <= min) {
      const id = await createSensorAlert(
        poultryId,
        "waterLevel",
        val,
        min,
        "danger",
      );
      if (id) createdAlerts.push(id);
    } else if (val <= warnMin) {
      const id = await createSensorAlert(
        poultryId,
        "waterLevel",
        val,
        warnMin,
        "warn",
      );
      if (id) createdAlerts.push(id);
    }
  }

  return createdAlerts;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ALERTES PORTE
// ─────────────────────────────────────────────────────────────────────────────
const createDoorAlert = async (poultryId, eventKey, triggeredBy = "manual") => {
  try {
    const severityMap = {
      manual_open: "info",
      manual_close: "info",
      scheduled_open: "info",
      scheduled_close: "info",
      timeout: "warn",
      forced_open: "warn",
    };

    const messageMap = {
      manual_open: "Porte ouverte manuellement",
      manual_close: "Porte fermée manuellement",
      scheduled_open: "Porte ouverte automatiquement (horaire)",
      scheduled_close: "Porte fermée automatiquement (horaire)",
      timeout: "La porte n'a pas répondu à la commande (timeout)",
      forced_open: "Porte restée ouverte hors horaire — vérification requise",
    };

    const iconMap = {
      manual_open: "✅",
      manual_close: "✅",
      scheduled_open: "✅",
      scheduled_close: "✅",
      timeout: "⚠️",
      forced_open: "⚠️",
    };

    const severity = severityMap[eventKey] || "info";
    const message = messageMap[eventKey] || `Événement porte : ${eventKey}`;
    const icon = iconMap[eventKey] || "✅";
    const ttl = severity === "info" ? 5 * 60 * 1000 : DEFAULT_TTL_MS;

    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "door",
      eventKey,
      severity,
    );

    if (!shouldCreate) {
      console.log(`[AlertService] Doublon porte bloqué — ${eventKey}`);
      return existingAlertId;
    }

    const alert = await Alert.create({
      poulailler: poultryId,
      type: "door",
      key: eventKey,
      severity,
      icon,
      message,
      read: false,
    });

    cacheAlert(poultryId, "door", eventKey, severity, alert._id, ttl);
    console.log(`[AlertService] 🚪 Porte — ${message}`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createDoorAlert :", err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ALERTES ACTIONNEURS
// ✅ PAS de cache anti-doublon — chaque changement d'état est unique
// ─────────────────────────────────────────────────────────────────────────────
const createActuatorAlert = async (
  poultryId,
  actuator,
  state,
  triggeredBy = "auto",
) => {
  try {
    const key = `${actuator}_${state}`;

    const labels = { fan: "Ventilateur", lamp: "Lampe chauffante" };
    const stateLabels = { on: "activé", off: "désactivé" };
    const triggerLabels = {
      auto: "automatiquement",
      manual: "manuellement",
      scheduled: "selon horaire",
    };

    const label = labels[actuator] || actuator;
    const stateLabel = stateLabels[state] || state;
    const triggerLabel = triggerLabels[triggeredBy] || triggeredBy;

    const severity = triggeredBy === "auto" && state === "on" ? "warn" : "info";
    const icon = severity === "warn" ? "⚠️" : "✅";
    const message = `${label} ${stateLabel} ${triggerLabel}`;

    const alert = await Alert.create({
      poulailler: poultryId,
      type: "actuator",
      key,
      severity,
      icon,
      message,
      read: false,
    });

    console.log(`[AlertService] ⚙️ Actionneur — ${message}`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createActuatorAlert :", err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ALERTES MQTT
// ✅ CORRIGÉ — UNE SEULE alerte pour "disconnect"
// NE JAMAIS créer d'alerte pour "connect" ou "reconnect"
// ─────────────────────────────────────────────────────────────────────────────
const createMqttAlert = async (poultryId, eventType) => {
  try {
    // ✅ CORRIGÉ — NE PAS créer d'alerte pour connect/reconnect
    if (eventType === "connect" || eventType === "reconnect") {
      console.log(
        `[AlertService] 🔌 MQTT — ${eventType} (pas d'alerte — bruit utilisateur)`,
      );
      return null;
    }

    const key = `mqtt_${eventType}`;

    const messageMap = {
      disconnect: "Connexion MQTT perdue — module hors ligne",
    };

    const iconMap = {
      disconnect: "🔴",
    };

    const severity = "danger";

    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "mqtt",
      key,
      severity,
    );

    if (!shouldCreate) {
      console.log(`[AlertService] Doublon MQTT bloqué — ${key}`);
      return existingAlertId;
    }

    const alert = await Alert.create({
      poulailler: poultryId,
      type: "mqtt",
      key,
      severity,
      icon: iconMap[eventType] || "🔴",
      message: messageMap[eventType] || `Événement MQTT : ${eventType}`,
      read: false,
    });

    cacheAlert(poultryId, "mqtt", key, severity, alert._id, DEFAULT_TTL_MS);
    console.log(`[AlertService] 🔴 MQTT Disconnect créée`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createMqttAlert :", err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. RÉSOLUTION D'ALERTES
// ─────────────────────────────────────────────────────────────────────────────
const resolveAlerts = async (poultryId, parameter) => {
  try {
    const result = await Alert.updateMany(
      {
        poulailler: poultryId,
        type: "sensor",
        parameter,
        resolvedAt: null,
        read: false,
      },
      { resolvedAt: new Date(), read: true },
    );

    for (const sev of ["warn", "danger"]) {
      const cacheKey = getCacheKey(poultryId, "sensor", parameter, sev);
      alertCache.delete(cacheKey);
    }

    if (result.modifiedCount > 0) {
      console.log(
        `[AlertService] ✅ ${result.modifiedCount} alerte(s) résolue(s) — ${parameter}`,
      );
    }
  } catch (err) {
    console.error("[AlertService] resolveAlerts :", err.message);
  }
};

const resolveNormalValues = async (poultryId, measurementData, thresholds) => {
  const t = thresholds || {};

  const checks = [
    {
      param: "temperature",
      val: measurementData.temperature,
      isNormal: (v) =>
        v < (t.temperatureMax ?? 35) && v > (t.temperatureMin ?? 15),
    },
    {
      param: "humidity",
      val: measurementData.humidity,
      isNormal: (v) => v < (t.humidityMax ?? 80) && v > (t.humidityMin ?? 40),
    },
    {
      param: "co2",
      val: measurementData.co2,
      isNormal: (v) => v < (t.co2WarnMax ?? 1000),
    },
    {
      param: "nh3",
      val: measurementData.nh3,
      isNormal: (v) => v < (t.nh3WarnMax ?? 20),
    },
    {
      param: "dust",
      val: measurementData.dust,
      isNormal: (v) => v < (t.dustWarnMax ?? 150),
    },
    {
      param: "waterLevel",
      val: measurementData.waterLevel,
      isNormal: (v) => v > (t.waterLevelWarnMin ?? 35),
    },
  ];

  for (const check of checks) {
    if (check.val != null && check.isNormal(check.val)) {
      await resolveAlerts(poultryId, check.param);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  checkSensorThresholds,
  resolveNormalValues,
  resolveAlerts,
  createDoorAlert,
  createActuatorAlert,
  createMqttAlert,
  shouldCreateAlert,
  createSensorAlert,
};
