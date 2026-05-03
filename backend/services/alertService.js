/**
 * AlertService — Smart Poultry
 *
 * Gère la création d'alertes pour tous les événements du système :
 *   • Capteurs (température, humidité, CO₂, NH₃, poussière, niveau d'eau)
 *   • Porte (ouverture / fermeture manuelle ou planifiée)
 *   • Actionneurs (ventilateur, lampe)
 *   • MQTT (connexion / déconnexion)
 *
 * ✅ Comparaison intelligente : ignore les décimales pour éviter les doublons
 *    Ex: 54.2 puis 54.5 = pas de nouvelle alerte (même entier 54)
 *    Ex: 54.9 puis 55.1 = nouvelle alerte (entier différent 54 vs 55)
 */

const Alert = require("../models/Alert");

// ─── Icônes techniques ────────────────────────────────────────────────────────
const ICONS = {
  // Sévérité
  danger: "alert-circle",
  warn: "alert-triangle",
  info: "info",

  // Capteurs
  temperature: "thermometer",
  humidity: "droplets",
  co2: "wind",
  nh3: "flask-conical",
  dust: "cloud-fog",
  waterLevel: "cup-soda",

  // Porte
  door_open: "door-open",
  door_close: "door-closed",
  door_warn: "alert-triangle",

  // Actionneurs
  fan_on: "fan",
  fan_off: "fan-off",
  lamp_on: "lightbulb",
  lamp_off: "lightbulb-off",

  // MQTT / Réseau
  mqtt_ok: "wifi",
  mqtt_lost: "wifi-off",

  // Générique
  check: "circle-check",
  unknown: "circle-help",
};

// ─── Labels et unités ────────────────────────────────────────────────────────
const PARAM_LABELS = {
  temperature: "Température du poulailler",
  humidity: "Humidité dans le poulailler",
  co2: "Qualité de l'air (CO₂)",
  nh3: "Odeur d'ammoniaque (NH₃)",
  dust: "Poussière dans l'air",
  waterLevel: "Niveau d'eau dans l'abreuvoir",
};

const PARAM_UNITS = {
  temperature: "°C",
  humidity: "%",
  co2: "ppm",
  nh3: "ppm",
  dust: "µg/m³",
  waterLevel: "%",
};

// ─── Messages simples pour capteurs ─────────────────────────────────────────
const SENSOR_MESSAGES = {
  temperature: {
    danger_above: (val, threshold) =>
      `Il fait trop chaud dans le poulailler ! ${val}°C (maximum toléré : ${threshold}°C). Vérifiez la ventilation immédiatement.`,
    warn_above: (val, threshold) =>
      `La température commence à monter : ${val}°C. Surveillez le poulailler (seuil d'alerte : ${threshold}°C).`,
    danger_below: (val, threshold) =>
      `Il fait trop froid dans le poulailler ! ${val}°C (minimum toléré : ${threshold}°C). Vérifiez le chauffage immédiatement.`,
    warn_below: (val, threshold) =>
      `La température baisse : ${val}°C. Surveillez le chauffage (seuil d'alerte : ${threshold}°C).`,
  },
  humidity: {
    danger_above: (val, threshold) =>
      `L'air est trop humide dans le poulailler : ${val}% (maximum toléré : ${threshold}%). Risque de maladies pour les volailles.`,
    warn_above: (val, threshold) =>
      `L'humidité monte : ${val}%. Pensez à aérer le poulailler (seuil d'alerte : ${threshold}%).`,
    danger_below: (val, threshold) =>
      `L'air est trop sec dans le poulailler : ${val}% (minimum toléré : ${threshold}%). Les volailles peuvent souffrir.`,
    warn_below: (val, threshold) =>
      `L'humidité baisse : ${val}%. Surveillez le confort des volailles (seuil d'alerte : ${threshold}%).`,
  },
  co2: {
    danger_above: (val, threshold) =>
      `L'air du poulailler est dangereux — trop de CO₂ : ${val} ppm (limite : ${threshold} ppm). Ouvrez les fenêtres ou activez la ventilation tout de suite !`,
    warn_above: (val, threshold) =>
      `L'air commence à se saturer en CO₂ : ${val} ppm. Pensez à aérer le poulailler (seuil d'alerte : ${threshold} ppm).`,
  },
  nh3: {
    danger_above: (val, threshold) =>
      `Forte odeur d'ammoniaque dans le poulailler : ${val} ppm (limite : ${threshold} ppm). C'est dangereux pour les volailles et pour vous. Aérez immédiatement !`,
    warn_above: (val, threshold) =>
      `L'ammoniaque commence à sentir fort : ${val} ppm. Pensez à nettoyer la litière et à aérer (seuil d'alerte : ${threshold} ppm).`,
  },
  dust: {
    danger_above: (val, threshold) =>
      `Trop de poussière dans le poulailler : ${val} µg/m³ (limite : ${threshold} µg/m³). Risque pour les voies respiratoires des volailles.`,
    warn_above: (val, threshold) =>
      `La poussière augmente dans le poulailler : ${val} µg/m³. Surveillez la litière et la ventilation (seuil : ${threshold} µg/m³).`,
  },
  waterLevel: {
    danger_below: (val, threshold) =>
      `L'abreuvoir est presque vide : ${val}% seulement (minimum : ${threshold}%). Remplissez-le tout de suite, les volailles ont soif !`,
    warn_below: (val, threshold) =>
      `Le niveau d'eau baisse dans l'abreuvoir : ${val}%. Pensez à le remplir bientôt (seuil d'alerte : ${threshold}%).`,
  },
};

// ─── Résolution de l'icône capteur ─────────────────────────────────────────
const resolveSensorIcon = (parameter, severity) => {
  return ICONS[parameter] ?? ICONS[severity] ?? ICONS.unknown;
};

// ─── Cache anti-doublon ───────────────────────────────────────────────────
const alertCache = new Map();
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const getCacheKey = (poultryId, type, key, severity) =>
  `${poultryId}:${type}:${key}:${severity}`;

const purgeExpiredCache = () => {
  const now = Date.now();
  for (const [k, v] of alertCache.entries()) {
    if (now - v.timestamp > (v.ttl ?? DEFAULT_TTL_MS)) alertCache.delete(k);
  }
};

/**
 * ✅ MODIFIÉ : Vérifie si on doit créer une alerte
 * Pour les capteurs : compare les valeurs entières (ignore les décimales)
 */
const shouldCreateAlert = (poultryId, type, key, severity, newValue = null) => {
  purgeExpiredCache();
  const cacheKey = getCacheKey(poultryId, type, key, severity);
  const cached = alertCache.get(cacheKey);

  if (cached) {
    if (type === "sensor" && newValue != null && cached.lastValue != null) {
      const oldInt = Math.trunc(cached.lastValue);
      const newInt = Math.trunc(newValue);

      if (newInt === oldInt) {
        console.log(
          `[AlertService] Valeur stable (${oldInt}) — pas de nouvelle alerte pour ${key}`,
        );
        return { shouldCreate: false, existingAlertId: cached.alertId };
      } else {
        console.log(
          `[AlertService] Valeur changée (${oldInt} → ${newInt}) — nouvelle alerte pour ${key}`,
        );
        return { shouldCreate: true };
      }
    }

    return { shouldCreate: false, existingAlertId: cached.alertId };
  }

  return { shouldCreate: true };
};

/**
 * ✅ MODIFIÉ : Stocke l'alerte dans le cache avec sa valeur
 */
const cacheAlert = (
  poultryId,
  type,
  key,
  severity,
  alertId,
  ttl,
  value = null,
) => {
  const cacheKey = getCacheKey(poultryId, type, key, severity);
  alertCache.set(cacheKey, {
    alertId,
    timestamp: Date.now(),
    ttl: ttl ?? DEFAULT_TTL_MS,
    lastValue: value,
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
      value,
    );

    if (!shouldCreate) {
      console.log(
        `[AlertService] Doublon bloqué (valeur stable) — ${parameter} (${severity})`,
      );
      return existingAlertId;
    }

    const direction = value > threshold ? "above" : "below";
    const valStr = typeof value === "number" ? value.toFixed(1) : "?";
    const thresStr = typeof threshold === "number" ? threshold.toFixed(1) : "?";

    const msgKey = `${severity}_${direction}`;
    const paramMsgs = SENSOR_MESSAGES[parameter];
    let message;

    if (paramMsgs && paramMsgs[msgKey]) {
      message = paramMsgs[msgKey](valStr, thresStr);
    } else {
      const label = PARAM_LABELS[parameter] || parameter;
      const unit = PARAM_UNITS[parameter] || "";
      const dirLabel =
        direction === "above" ? "trop élevé(e)" : "trop bas / basse";
      message = `${label} ${dirLabel} : ${valStr}${unit} (seuil : ${thresStr}${unit}). Vérifiez le poulailler.`;
    }

    const icon = resolveSensorIcon(parameter, severity);

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

    cacheAlert(
      poultryId,
      "sensor",
      parameter,
      severity,
      alert._id,
      DEFAULT_TTL_MS,
      value,
    );

    console.log(`[AlertService] Capteur — ${message}`);
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
      manual_open: "La porte du poulailler a été ouverte à la main.",
      manual_close: "La porte du poulailler a été fermée à la main.",
      scheduled_open:
        "La porte du poulailler s'est ouverte automatiquement à l'heure prévue.",
      scheduled_close:
        "La porte du poulailler s'est fermée automatiquement à l'heure prévue.",
      timeout:
        "La porte du poulailler n'a pas répondu à la commande. Vérifiez si elle est bloquée ou si le moteur fonctionne bien.",
      forced_open:
        "La porte du poulailler est restée ouverte en dehors des heures prévues. Vérifiez que tout va bien.",
    };

    const iconMap = {
      manual_open: ICONS.door_open,
      manual_close: ICONS.door_close,
      scheduled_open: ICONS.door_open,
      scheduled_close: ICONS.door_close,
      timeout: ICONS.door_warn,
      forced_open: ICONS.door_warn,
    };

    const severity = severityMap[eventKey] || "info";
    const message =
      messageMap[eventKey] ||
      `Événement porte inconnu : ${eventKey}. Vérifiez le poulailler.`;
    const icon = iconMap[eventKey] || ICONS.unknown;
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
    console.log(`[AlertService] Porte — ${message}`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createDoorAlert :", err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ALERTES ACTIONNEURS
// ✅ MODIFIÉ : Accepte un paramètre `reason` pour enregistrer pourquoi l'action a eu lieu
// ─────────────────────────────────────────────────────────────────────────────
const createActuatorAlert = async (
  poultryId,
  actuator,
  state,
  triggeredBy = "auto",
  reason = null,
) => {
  try {
    const normalizedActuator = actuator === "ventilation" ? "fan" : actuator;
    const normalizedState =
      state === true ? "on" : state === false ? "off" : state;

    const key = `${normalizedActuator}_${normalizedState}`;

    const reasonText = reason ? ` car ${reason}` : "";

    const ACTUATOR_MESSAGES = {
      fan: {
        on: {
          auto: `Action : Ventilateur démarré automatiquement${reasonText}.`,
          manual: "Action : Ventilateur démarré manuellement.",
          scheduled: "Action : Ventilateur démarré selon l'horaire programmé.",
        },
        off: {
          auto: "Action : Ventilateur arrêté automatiquement car les conditions sont revenues à la normale.",
          manual: "Action : Ventilateur arrêté manuellement.",
          scheduled: "Action : Ventilateur arrêté selon l'horaire programmé.",
        },
      },

      lamp: {
        on: {
          auto: `Action : Lampe chauffante allumée automatiquement${reasonText}.`,
          manual: "Action : Lampe chauffante allumée manuellement.",
          scheduled:
            "Action : Lampe chauffante allumée selon l'horaire programmé.",
        },
        off: {
          auto: "Action : Lampe chauffante éteinte automatiquement car la température est revenue à la normale.",
          manual: "Action : Lampe chauffante éteinte manuellement.",
          scheduled:
            "Action : Lampe chauffante éteinte selon l'horaire programmé.",
        },
      },

      door: {
        open: {
          auto: "Action : Porte ouverte automatiquement.",
          manual: "Action : Porte ouverte manuellement.",
          scheduled: "Action : Porte ouverte selon l'horaire programmé.",
        },
        closed: {
          auto: "Action : Porte fermée automatiquement.",
          manual: "Action : Porte fermée manuellement.",
          scheduled: "Action : Porte fermée selon l'horaire programmé.",
        },
      },

      pump: {
        on: {
          auto: `Action : Pompe démarrée automatiquement${reasonText}.`,
          manual: "Action : Pompe démarrée manuellement.",
          scheduled: "Action : Pompe démarrée selon l'horaire programmé.",
        },
        off: {
          auto: "Action : Pompe arrêtée automatiquement.",
          manual: "Action : Pompe arrêtée manuellement.",
          scheduled: "Action : Pompe arrêtée selon l'horaire programmé.",
        },
      },
    };

    const ACTUATOR_ICONS = {
      fan: { on: ICONS.fan_on, off: ICONS.fan_off },
      lamp: { on: ICONS.lamp_on, off: ICONS.lamp_off },
      door: { open: ICONS.door_open, closed: ICONS.door_close },
      pump: { on: "water", off: "water-off" },
    };

    const fallbackAction =
      normalizedState === "on" || normalizedState === "open"
        ? "activé"
        : "désactivé";

    const message =
      ACTUATOR_MESSAGES[normalizedActuator]?.[normalizedState]?.[triggeredBy] ??
      `Action : ${normalizedActuator} ${fallbackAction} ${triggeredBy === "auto" ? "automatiquement" : "manuellement"}.`;

    const icon =
      ACTUATOR_ICONS[normalizedActuator]?.[normalizedState] ?? ICONS.unknown;

    const severity = "info";

    const alert = await Alert.create({
      poulailler: poultryId,
      type: "actuator",
      key,
      severity,
      icon,
      message,
      read: false,
    });

    console.log(`[AlertService] Actionneur — ${message}`);
    return alert._id;
  } catch (err) {
    console.error("[AlertService] createActuatorAlert :", err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. ALERTES MQTT
// ─────────────────────────────────────────────────────────────────────────────
const createMqttAlert = async (poultryId, eventType) => {
  try {
    if (eventType === "connect" || eventType === "reconnect") {
      console.log(`[AlertService] MQTT — ${eventType} (pas d'alerte)`);
      return null;
    }

    const key = `mqtt_${eventType}`;
    const severity = "danger";

    const messageMap = {
      disconnect:
        "Le boîtier du poulailler ne répond plus. Vérifiez qu'il est bien branché et que votre connexion internet fonctionne.",
    };

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
      icon: ICONS.mqtt_lost,
      message:
        messageMap[eventType] ??
        `Problème de connexion avec le boîtier du poulailler (${eventType}).`,
      read: false,
    });

    cacheAlert(poultryId, "mqtt", key, severity, alert._id, DEFAULT_TTL_MS);
    console.log(`[AlertService] MQTT Disconnect — alerte créée`);
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

    // ✅ Nettoyer le cache pour ce paramètre
    for (const sev of ["warn", "danger"]) {
      alertCache.delete(getCacheKey(poultryId, "sensor", parameter, sev));
    }

    if (result.modifiedCount > 0) {
      console.log(
        `[AlertService] ${result.modifiedCount} alerte(s) résolue(s) — ${parameter}`,
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
