const Alert = require("../models/Alert");

// In-memory cache for alert deduplication (30 min TTL)
const alertCache = new Map();

const getCacheKey = (poultryId, type, key, severity) => {
  return `${poultryId}:${type}:${key}:${severity}`;
};

const clearExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of alertCache.entries()) {
    if (now - value.timestamp > 30 * 60 * 1000) {
      alertCache.delete(key);
    }
  }
};

/**
 * Check if an alert should be created (anti-spam)
 * Returns: { shouldCreate: boolean, existingAlertId?: ObjectId }
 */
const shouldCreateAlert = (poultryId, type, key, severity) => {
  clearExpiredCache();
  const cacheKey = getCacheKey(poultryId, type, key, severity);
  const cached = alertCache.get(cacheKey);

  if (cached) {
    return { shouldCreate: false, existingAlertId: cached.alertId };
  }

  return { shouldCreate: true };
};

/**
 * Create an alert and update cache
 */
const createAlertFromSensor = async (
  poultryId,
  parameter,
  value,
  threshold,
  thresholdLevel,
) => {
  try {
    const severity = thresholdLevel === "danger" ? "danger" : "warn";
    const direction = value > threshold ? "above" : "below";

    // Check cache first
    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "sensor",
      parameter,
      severity,
    );

    if (!shouldCreate) {
      console.log(
        `[ALERT] Duplicate sensor alert blocked (${parameter}, ${severity})`,
      );
      return existingAlertId;
    }

    // Create new alert
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

    const icon = severity === "danger" ? "🔴" : "⚠️";
    const message = `${PARAM_LABELS[parameter]}: ${value.toFixed(1)}${PARAM_UNITS[parameter]} (seuil: ${threshold}${PARAM_UNITS[parameter]})`;

    const alert = new Alert({
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

    await alert.save();

    // Update cache
    const cacheKey = getCacheKey(poultryId, "sensor", parameter, severity);
    alertCache.set(cacheKey, {
      alertId: alert._id,
      timestamp: Date.now(),
    });

    console.log(`[ALERT] Created: ${parameter} (${severity})`);
    return alert._id;
  } catch (error) {
    console.error("[ALERT] Error creating sensor alert:", error.message);
    return null;
  }
};

/**
 * Check sensor thresholds and create alerts
 * thresholds = Poulailler.thresholds object
 */
const checkSensorThresholds = async (
  poultryId,
  measurementData,
  thresholds,
) => {
  const alerts = [];

  // Temperature
  if (measurementData.temperature !== undefined) {
    const temp = measurementData.temperature;
    if (temp >= (thresholds.temperatureMax || 28)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "temperature",
        temp,
        thresholds.temperatureMax || 28,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (temp >= (thresholds.temperatureMax * 0.9 || 25)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "temperature",
        temp,
        thresholds.temperatureMax * 0.9 || 25,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  // Humidity
  if (measurementData.humidity !== undefined) {
    const humidity = measurementData.humidity;
    if (humidity >= (thresholds.humidityMax || 70)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "humidity",
        humidity,
        thresholds.humidityMax || 70,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (humidity >= (thresholds.humidityMax * 0.9 || 63)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "humidity",
        humidity,
        thresholds.humidityMax * 0.9 || 63,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  // CO2
  if (measurementData.co2 !== undefined) {
    const co2 = measurementData.co2;
    if (co2 >= (thresholds.co2Max || 1500)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "co2",
        co2,
        thresholds.co2Max || 1500,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (co2 >= (thresholds.co2Max * 0.8 || 1200)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "co2",
        co2,
        thresholds.co2Max * 0.8 || 1200,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  // NH3
  if (measurementData.nh3 !== undefined) {
    const nh3 = measurementData.nh3;
    if (nh3 >= (thresholds.nh3Max || 25)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "nh3",
        nh3,
        thresholds.nh3Max || 25,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (nh3 >= (thresholds.nh3Max * 0.8 || 20)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "nh3",
        nh3,
        thresholds.nh3Max * 0.8 || 20,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  // Dust
  if (measurementData.dust !== undefined) {
    const dust = measurementData.dust;
    if (dust >= (thresholds.dustMax || 150)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "dust",
        dust,
        thresholds.dustMax || 150,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (dust >= (thresholds.dustMax * 0.8 || 120)) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "dust",
        dust,
        thresholds.dustMax * 0.8 || 120,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  // Water Level - INVERTED LOGIC (danger if LOW)
  if (measurementData.waterLevel !== undefined) {
    const waterLevel = measurementData.waterLevel;
    const waterMin = thresholds.waterLevelMin || 20;
    if (waterLevel <= waterMin) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "waterLevel",
        waterLevel,
        waterMin,
        "danger",
      );
      if (alertId) alerts.push(alertId);
    } else if (waterLevel <= waterMin * 1.5) {
      const alertId = await createAlertFromSensor(
        poultryId,
        "waterLevel",
        waterLevel,
        waterMin * 1.5,
        "warn",
      );
      if (alertId) alerts.push(alertId);
    }
  }

  return alerts;
};

/**
 * Create door alert (scheduled event or timeout)
 */
const createDoorAlert = async (poultryId, key, severity, message) => {
  try {
    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "door",
      key,
      severity,
    );

    if (!shouldCreate) {
      console.log(`[ALERT] Duplicate door alert blocked (${key})`);
      return existingAlertId;
    }

    const iconMap = {
      info: "✅",
      warn: "⚠️",
      danger: "🔴",
    };

    const alert = new Alert({
      poulailler: poultryId,
      type: "door",
      key,
      severity,
      icon: iconMap[severity] || "✅",
      message,
      read: false,
    });

    await alert.save();

    // Update cache
    const cacheKey = getCacheKey(poultryId, "door", key, severity);
    alertCache.set(cacheKey, {
      alertId: alert._id,
      timestamp: Date.now(),
    });

    console.log(`[ALERT] Door event: ${key} (${severity})`);
    return alert._id;
  } catch (error) {
    console.error("[ALERT] Error creating door alert:", error.message);
    return null;
  }
};

/**
 * Create MQTT connection alert
 */
const createMqttAlert = async (poultryId, eventType) => {
  try {
    const severity = eventType === "disconnect" ? "danger" : "info";
    const key = `mqtt_${eventType}`;
    const messages = {
      mqtt_disconnect: "Connexion MQTT perdue",
      mqtt_reconnect: "Reconnexion MQTT établie",
    };

    const { shouldCreate, existingAlertId } = shouldCreateAlert(
      poultryId,
      "mqtt",
      key,
      severity,
    );

    if (!shouldCreate) {
      return existingAlertId;
    }

    const iconMap = {
      disconnect: "🔴",
      reconnect: "✅",
    };

    const alert = new Alert({
      poulailler: poultryId,
      type: "mqtt",
      key,
      severity,
      icon: iconMap[eventType] || "✅",
      message: messages[key] || "Événement MQTT",
      read: false,
    });

    await alert.save();

    // Update cache (shorter TTL for reconnect: 3s)
    const cacheKey = getCacheKey(poultryId, "mqtt", key, severity);
    const ttl = eventType === "reconnect" ? 3000 : 30 * 60 * 1000;
    alertCache.set(cacheKey, {
      alertId: alert._id,
      timestamp: Date.now(),
      ttl,
    });

    console.log(`[ALERT] MQTT event: ${eventType}`);
    return alert._id;
  } catch (error) {
    console.error("[ALERT] Error creating MQTT alert:", error.message);
    return null;
  }
};

module.exports = {
  checkSensorThresholds,
  createDoorAlert,
  createMqttAlert,
  shouldCreateAlert,
};
