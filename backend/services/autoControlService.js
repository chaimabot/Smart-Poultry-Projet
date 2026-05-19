// services/autoControlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Service de contrôle automatique des actionneurs
// Évalue les conditions et envoie les commandes MQTT à l'ESP32
// ─────────────────────────────────────────────────────────────────────────────

// ─── Logique AUTO ventilateur ────────────────────────────────────────────────
// Déclenche si : Température > tempMax OU Qualité d'air < airQualityMin
function shouldFanBeOn(measures, thresholds) {
  if (!thresholds)
    return { shouldBeOn: false, reason: "Seuils non configurés" };

  const temp =
    measures.temperature !== null && measures.temperature !== undefined
      ? Number(measures.temperature)
      : null;
  const air =
    measures.airQualityPercent !== null &&
    measures.airQualityPercent !== undefined
      ? Number(measures.airQualityPercent)
      : null;

  const tempMax =
    thresholds.temperatureMax != null
      ? Number(thresholds.temperatureMax)
      : null;
  const airMin =
    thresholds.airQualityMin != null ? Number(thresholds.airQualityMin) : null;

  if (temp !== null && tempMax !== null && temp > tempMax)
    return {
      shouldBeOn: true,
      reason: `Température > ${tempMax}°C (${temp}°C)`,
    };

  if (air !== null && airMin !== null && air < airMin)
    return {
      shouldBeOn: true,
      reason: `Qualité de l'air < ${airMin}% (${air}%)`,
    };

  return { shouldBeOn: false, reason: "Conditions normales" };
}

// ─── Logique AUTO lampe ──────────────────────────────────────────────────────
// Déclenche si : Température < tempMin
function shouldLampBeOn(measures, thresholds) {
  if (!thresholds)
    return { shouldBeOn: false, reason: "Seuils non configurés" };

  const temp =
    measures.temperature !== null && measures.temperature !== undefined
      ? Number(measures.temperature)
      : null;
  const tempMin =
    thresholds.temperatureMin != null
      ? Number(thresholds.temperatureMin)
      : null;

  if (temp !== null && tempMin !== null && temp < tempMin)
    return {
      shouldBeOn: true,
      reason: `Température < ${tempMin}°C (${temp}°C)`,
    };

  return { shouldBeOn: false, reason: "Conditions normales" };
}

// ─── Logique AUTO pompe ──────────────────────────────────────────────────────
// Déclenche si : Niveau d'eau < waterLevelMin (avec hystérésis 10%)
function shouldPumpBeOn(measures, thresholds, currentlyOn = false) {
  if (!thresholds)
    return { shouldBeOn: false, reason: "Seuils non configurés" };

  const water =
    measures.waterLevel !== null && measures.waterLevel !== undefined
      ? Number(measures.waterLevel)
      : null;
  const waterMin =
    thresholds.waterLevelMin != null ? Number(thresholds.waterLevelMin) : null;
  const hysteresis = 10;

  if (water !== null && waterMin !== null) {
    if (!currentlyOn && water < waterMin)
      return {
        shouldBeOn: true,
        reason: `Niveau d'eau < ${waterMin}% (${water}%)`,
      };
    if (currentlyOn && water < waterMin + hysteresis)
      return { shouldBeOn: true, reason: "Remplissage en cours..." };
  }

  return { shouldBeOn: false, reason: "Niveau d'eau normal" };
}

// ─── Évaluation principale ───────────────────────────────────────────────────
async function evaluateAutoControls(poulailler, macAddress, mqttClient) {
  if (!poulailler) {
    console.warn("[AUTO] Poulailler manquant");
    return;
  }
  if (!mqttClient?.connected) {
    console.warn("[AUTO] MQTT non connecté");
    return;
  }
  if (!macAddress) {
    console.warn("[AUTO] MAC manquante");
    return;
  }

  const measures = poulailler.lastMonitoring || {};
  const thresholds = poulailler.thresholds || {};
  const actuators = poulailler.actuatorStates || {};

  console.log(`[AUTO] Évaluation pour ${macAddress}`);
  console.log(
    `[AUTO] Modes: fan=${actuators.ventilation?.mode}, lamp=${actuators.lamp?.mode}, pump=${actuators.pump?.mode}`,
  );

  // Helper pour publier une commande MQTT
  const publishCmd = (type, on) => {
    return new Promise((resolve) => {
      const topic = `poulailler/${macAddress}/cmd/${type}`;
      const payload = JSON.stringify({ on, mode: "auto" });

      mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[AUTO ${type.toUpperCase()}] ❌ Erreur:`, err.message);
          resolve(false);
        } else {
          console.log(
            `[AUTO ${type.toUpperCase()}] ✅ ${on ? "ON" : "OFF"} → ${topic}`,
          );
          resolve(true);
        }
      });
    });
  };

  let stateChanged = false;

  // ════════════════════════════════════════════════════════════════════════
  // VENTILATEUR
  // ════════════════════════════════════════════════════════════════════════
  if (actuators.ventilation?.mode === "auto") {
    const result = shouldFanBeOn(measures, thresholds);
    const currentlyOn = actuators.ventilation?.status === "on";

    console.log(`[AUTO FAN] ${result.reason}`);
    console.log(
      `[AUTO FAN] État: ${currentlyOn ? "ON" : "OFF"} → Décision: ${result.shouldBeOn ? "ON" : "OFF"}`,
    );

    if (result.shouldBeOn !== currentlyOn) {
      const sent = await publishCmd("fan", result.shouldBeOn);
      if (sent) {
        poulailler.actuatorStates.ventilation.status = result.shouldBeOn
          ? "on"
          : "off";
        poulailler.actuatorStates.ventilation.lastAutoReason = result.reason;
        poulailler.actuatorStates.ventilation.lastAutoChange = new Date();
        stateChanged = true;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LAMPE
  // ════════════════════════════════════════════════════════════════════════
  if (actuators.lamp?.mode === "auto") {
    const result = shouldLampBeOn(measures, thresholds);
    const currentlyOn = actuators.lamp?.status === "on";

    console.log(`[AUTO LAMP] ${result.reason}`);
    console.log(
      `[AUTO LAMP] État: ${currentlyOn ? "ON" : "OFF"} → Décision: ${result.shouldBeOn ? "ON" : "OFF"}`,
    );

    if (result.shouldBeOn !== currentlyOn) {
      const sent = await publishCmd("lamp", result.shouldBeOn);
      if (sent) {
        poulailler.actuatorStates.lamp.status = result.shouldBeOn
          ? "on"
          : "off";
        poulailler.actuatorStates.lamp.lastAutoReason = result.reason;
        poulailler.actuatorStates.lamp.lastAutoChange = new Date();
        stateChanged = true;
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // POMPE
  // ════════════════════════════════════════════════════════════════════════
  if (actuators.pump?.mode === "auto") {
    const currentlyOn = actuators.pump?.status === "on";
    const result = shouldPumpBeOn(measures, thresholds, currentlyOn);

    console.log(`[AUTO PUMP] ${result.reason}`);
    console.log(
      `[AUTO PUMP] État: ${currentlyOn ? "ON" : "OFF"} → Décision: ${result.shouldBeOn ? "ON" : "OFF"}`,
    );

    if (result.shouldBeOn !== currentlyOn) {
      const sent = await publishCmd("pump", result.shouldBeOn);
      if (sent) {
        poulailler.actuatorStates.pump.status = result.shouldBeOn
          ? "on"
          : "off";
        poulailler.actuatorStates.pump.lastAutoReason = result.reason;
        poulailler.actuatorStates.pump.lastAutoChange = new Date();
        stateChanged = true;
      }
    }
  }

  // Sauvegarde si changements
  if (stateChanged) {
    await poulailler.save();
    console.log("[AUTO] ✅ États sauvegardés");
  }
}

module.exports = {
  evaluateAutoControls,
  shouldFanBeOn,
  shouldLampBeOn,
  shouldPumpBeOn,
};
