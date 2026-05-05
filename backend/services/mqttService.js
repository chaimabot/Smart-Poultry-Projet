const mqtt = require("mqtt");
const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const Measure = require("../models/Measure");
const Module = require("../models/Module");
const DoorEvent = require("../models/DoorEvent");
const {
  checkSensorThresholds,
  resolveNormalValues,
  createMqttAlert,
  createActuatorAlert,
} = require("./alertService");

let client = null;
let lastMqttDisconnectTime = 0;
let mqttDisconnectAlertSent = false;
let doorTimeoutIntervalId = null;
let doorClockIntervalId = null;

// ============================================================================
// HELPER : résoudre poulailler depuis adresse MAC
// L'ESP32 publie sur poulailler/{MAC}/... — le topicParts[1] est la MAC
// ============================================================================
const resolvePoulaillerByMac = async (macAddress) => {
  // La MAC n'est pas un ObjectId MongoDB — on cherche via le modèle Module
  const device = await Module.findOne({ macAddress });
  if (!device || !device.poulailler) return null;
  return await Poulailler.findById(device.poulailler);
};

// ============================================================================
// CONFIGURATION ET CONNEXION MQTT
// ============================================================================
const connectMqtt = () => {
  const host =
    process.env.MQTT_BROKER ||
    "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud";
  const username = process.env.MQTT_USER?.trim();
  const password = process.env.MQTT_PASS?.trim();

  if (!username || !password) {
    console.error(
      "[MQTT] ❌ Erreur : MQTT_USER ou MQTT_PASS est vide dans le fichier .env",
    );
    return null;
  }

  const cleanHost = host.replace("wss://", "").split(":")[0];
  const brokerUrl = `wss://${cleanHost}:8884/mqtt`;
  const wsPort = 8884;

  console.log(
    `[MQTT Backend] WebSocket connect: wss://${cleanHost}:8884 (matches mobile)`,
  );

  const options = {
    keepalive: 60,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30 * 1000,
    username: username,
    password: password,
    port: wsPort,
    clientId: `backend_ws_${Math.random().toString(16).slice(2, 10)}`,
    protocolId: "MQTT",
    protocolVersion: 4,
    rejectUnauthorized: true,
  };

  client = mqtt.connect(brokerUrl, options);

  // ── ÉVÉNEMENTS DU CLIENT ──────────────────────────────────────────────────

  client.on("connect", () => {
    console.log(`[MQTT] ✅ Backend connecté avec succès au broker !`);
    mqttDisconnectAlertSent = false;

    const topics = [
      "poulailler/+/measures", // mesures capteurs ESP32
      "poulailler/+/status", // état actionneurs ESP32
      "smartpoultry/discovery",
      "smartpoultry/heartbeat",
    ];

    topics.forEach((topic) => {
      client.subscribe(topic, (err) => {
        if (!err) console.log(`[MQTT] Souscrit à : ${topic}`);
        else console.error(`[MQTT] Erreur souscription ${topic}:`, err.message);
      });
    });

    startDoorMonitoring();
    startDoorClockSync();
  });

  client.on("message", async (topic, message) => {
    try {
      await handleMqttMessage(topic, message);
    } catch (error) {
      console.error(`[MQTT] Erreur de traitement sur ${topic}:`, error.message);
    }
  });

  client.on("error", (error) => {
    console.error("[MQTT] ❌ Erreur de connexion:", error.message);
    if (error.message.includes("Not authorized")) {
      console.log(
        "👉 CONSEIL : Vérifiez que l'utilisateur MQTT existe dans la console HiveMQ.",
      );
    }
  });

  client.on("disconnect", () => {
    console.log("[MQTT] ❌ Déconnexion du broker MQTT");
    lastMqttDisconnectTime = Date.now();
    mqttDisconnectAlertSent = false;
    stopDoorClockSync();
  });

  client.on("reconnect", () => {
    console.log("[MQTT] Reconnexion en cours...");
  });

  client.on("offline", () => {
    console.log("[MQTT] Client hors ligne - tentative de reconnexion...");
    (async () => {
      if (
        Date.now() - lastMqttDisconnectTime > 30000 &&
        !mqttDisconnectAlertSent
      ) {
        try {
          const poulaillers = await Poulailler.find().select("_id").lean();
          for (const poule of poulaillers) {
            await createMqttAlert(poule._id.toString(), "disconnect");
          }
          mqttDisconnectAlertSent = true;
        } catch (error) {
          console.error("[MQTT] Error creating disconnect alerts:", error);
        }
      }
    })();
  });

  return client;
};

// ============================================================================
// LOGIQUE DE TRAITEMENT DES MESSAGES
// ============================================================================
const handleMqttMessage = async (topic, message) => {
  try {
    const topicParts = topic.split("/");
    const payload = message.toString();
    let data;

    try {
      data = JSON.parse(payload);
    } catch (e) {
      if (process.env.DEBUG_MQTT) console.debug("[MQTT] non-JSON skip:", topic);
      return;
    }

    // ── 1. DISCOVERY / HEARTBEAT ─────────────────────────────────────────────
    if (
      topic === "smartpoultry/discovery" ||
      topic === "smartpoultry/heartbeat"
    ) {
      // Un ESP32 annonce sa présence avec sa MAC
      const mac = data.mac || data.macAddress || data.deviceId;
      if (!mac) return;

      console.log(`[MQTT] Discovery/Heartbeat — MAC: ${mac}`);

      // Mettre à jour lastPing du device
      await Module.findOneAndUpdate(
        { macAddress: mac },
        { lastPing: new Date() },
      );
      return;
    }

    // Pour les topics poulailler/+/measures et poulailler/+/status
    if (topicParts[0] !== "poulailler" || topicParts.length < 3) return;

    // ✅ topicParts[1] est maintenant la MAC (ex: "142B2FC7D704")
    // PAS un ObjectId MongoDB
    const macAddress = topicParts[1];
    const messageType = topicParts[2]; // "measures" ou "status"

    // Résoudre MAC → poulailler via le modèle Module
    const poulailler = await resolvePoulaillerByMac(macAddress);
    if (!poulailler) {
      console.warn(`[MQTT] Aucun poulailler trouvé pour MAC: ${macAddress}`);
      return;
    }

    const poulaillerId = poulailler._id.toString();

    // ── 2. MESURES CAPTEURS ───────────────────────────────────────────────────
    if (messageType === "measures") {
      console.log(
        `[MQTT] Mesures reçues — MAC: ${macAddress} | poulailler: ${poulaillerId}`,
      );

      // Sauvegarder la mesure en base
      await Measure.create({
        poulailler: poulailler._id,
        temperature: data.temperature ?? null,
        humidity: data.humidity ?? null,
        co2: data.co2 ?? null,
        nh3: data.nh3 ?? null,
        waterLevel: data.waterLevel ?? null,
        timestamp: new Date(),
      });

      // Mettre à jour lastMonitoring sur le poulailler
      poulailler.lastMonitoring = {
        temperature: data.temperature ?? poulailler.lastMonitoring?.temperature,
        humidity: data.humidity ?? poulailler.lastMonitoring?.humidity,
        co2: data.co2 ?? poulailler.lastMonitoring?.co2,
        nh3: data.nh3 ?? poulailler.lastMonitoring?.nh3,
        waterLevel: data.waterLevel ?? poulailler.lastMonitoring?.waterLevel,
        timestamp: new Date(),
      };

      // Mettre à jour le status du device (lastPing)
      await Module.findOneAndUpdate(
        { macAddress },
        { lastPing: new Date(), status: "associated" },
      );

      // Mettre à jour le statut du poulailler
      if (poulailler.status !== "connecte") {
        poulailler.status = "connecte";
      }
      await poulailler.save();

      // Vérifier les seuils et créer des alertes si nécessaire
      await checkSensorThresholds(poulaillerId, data, poulailler.thresholds);

      // Résoudre les alertes pour les valeurs revenues à la normale
      await resolveNormalValues(poulaillerId, data, poulailler.thresholds);

      console.log(
        `[MQTT] ✅ Mesures enregistrées — T:${data.temperature}°C H:${data.humidity}% CO2:${data.co2}ppm Eau:${data.waterLevel}%`,
      );
      return;
    }

    // ── 3. STATUS ACTIONNEURS ─────────────────────────────────────────────────
    if (messageType === "status") {
      console.log(
        `[MQTT] Status reçu — MAC: ${macAddress} | poulailler: ${poulaillerId}`,
      );
      console.log(`[MQTT] Payload status:`, data);

      // Mettre à jour les états actionneurs depuis l'ESP32
      // ⚠️ On met à jour SEULEMENT le status (on/off), PAS le mode (auto/manual)
      // Le mode est la source de vérité de la BD — l'ESP32 ne doit pas l'écraser

      if (data.fanOn !== undefined) {
        poulailler.actuatorStates.ventilation.status = data.fanOn
          ? "on"
          : "off";
      }
      if (data.lampOn !== undefined) {
        poulailler.actuatorStates.lamp.status = data.lampOn ? "on" : "off";
      }
      if (data.pumpOn !== undefined) {
        poulailler.actuatorStates.pump.status = data.pumpOn ? "on" : "off";
      }

      // ✅ Envoyer la config (modes) à l'ESP32 à chaque status reçu
      // Comme ça si l'ESP32 redémarre, il récupère les bons modes depuis la BD
      publishConfig(macAddress, poulailler);

      // Traitement spécial pour la porte (état riche)
      if (data.doorState !== undefined) {
        const doorStateMap = {
          OPEN: "open",
          CLOSED: "closed",
          OPENING: "open",
          CLOSING: "closed",
          BLOCKED: "closed",
          UNKNOWN: "closed",
        };
        const newDoorStatus = doorStateMap[data.doorState] || "closed";
        const prevDoorStatus = poulailler.actuatorStates.door?.status;

        poulailler.actuatorStates.door.status = newDoorStatus;

        // Créer un DoorEvent si l'état a changé
        if (prevDoorStatus !== newDoorStatus) {
          try {
            await DoorEvent.create({
              poulailler: poulailler._id,
              action: newDoorStatus === "open" ? "open" : "close",
              source: "esp32",
              doorState: data.doorState,
              timestamp: new Date(),
            });
            console.log(
              `[DOOR] Événement enregistré: ${prevDoorStatus} → ${newDoorStatus}`,
            );
          } catch (doorErr) {
            console.error("[DOOR] Erreur création DoorEvent:", doorErr.message);
          }
        }

        // Vérifier le timeout porte via doorController
        if (data.doorState === "BLOCKED") {
          try {
            const doorController = require("../controllers/doorController");
            await doorController.checkDoorTimeout(poulaillerId);
          } catch (err) {
            console.error("[MQTT] doorController load fail:", err.message);
          }
        }
      }

      await poulailler.save();
      console.log(`[MQTT] ✅ Status actionneurs mis à jour`);
      return;
    }
  } catch (error) {
    console.error("[MQTT] handleMessage ERROR:", error.message, error.stack);
  }
};

// ============================================================================
// ACTIONS SORTANTES
// ============================================================================

// ✅ Envoie la config complète (modes + seuils) à l'ESP32
// Appelé à chaque réception de status pour resynchroniser l'ESP32
// Dans mqttService.js — remplacer publishConfig par ceci :

const publishConfig = (macAddress, poulailler) => {
  if (!client || !client.connected) return;

  // ✅ On n'envoie QUE les seuils dans la config automatique.
  // Les modes (fanMode, lampMode, pumpMode) ne sont PAS envoyés ici.
  //
  // Pourquoi ? Parce que publishConfig est appelé à chaque /status reçu
  // de l'ESP32. Si on envoie lampMode:"auto" → l'ESP32 active le mode auto
  // → publie /status {lampAuto:true} → backend re-publie config → boucle infinie.
  //
  // Les modes sont envoyés UNIQUEMENT par les routes dédiées :
  //   - PATCH /lampe/:id/control       → cmd/lamp  {mode, on}
  //   - PATCH /ventilateur/:id/control → cmd/fan   {mode, on}
  //   - PATCH /pompe/:id/control       → cmd/pump  {mode, on}
  const config = {
    tempMin: poulailler.thresholds.temperatureMin,
    tempMax: poulailler.thresholds.temperatureMax,
    waterMin: poulailler.thresholds.waterLevelMin,
    co2Max: poulailler.thresholds.co2Max,
  };

  const topic = `poulailler/${macAddress}/config`;
  client.publish(topic, JSON.stringify(config), { qos: 1 });
  console.log(
    `[MQTT] Config seuils envoyée à ${macAddress} — tempMin:${config.tempMin} tempMax:${config.tempMax}`,
  );
};

// Publie une commande générique (usage interne)
const publishCommand = (macAddressOrId, command, value) => {
  if (!client || !client.connected) {
    console.error("[MQTT] Publication impossible : client déconnecté.");
    return false;
  }
  const topic = `poulailler/${macAddressOrId}/commands`;
  const payload = JSON.stringify({
    command,
    value,
    timestamp: new Date().toISOString(),
  });

  client.publish(topic, payload, { qos: 1 });
  console.log(`[MQTT] Commande envoyée sur ${topic}`);
  return true;
};

const disconnectMqtt = () => {
  stopDoorMonitoring();
  stopDoorClockSync();
  if (client) client.end();
};

// ============================================================================
// SURVEILLANCE PORTE (timeout)
// ============================================================================
const startDoorMonitoring = () => {
  if (doorTimeoutIntervalId) return;

  doorTimeoutIntervalId = setInterval(async () => {
    try {
      const doorController = require("../controllers/doorController");
      const poulaillers = await Poulailler.find().select("_id").lean();

      if (!poulaillers?.length) return;

      for (const poule of poulaillers) {
        if (mongoose.Types.ObjectId.isValid(poule._id)) {
          await doorController.checkDoorTimeout(poule._id.toString());
        }
      }
    } catch (error) {
      console.error("[DOOR-MONITOR] Erreur timeout check:", error.message);
    }
  }, 10000);

  console.log("[MQTT] Door monitoring started (safe)");
};

// ============================================================================
// SYNC HORLOGE PORTE → ESP32
// ============================================================================
const startDoorClockSync = () => {
  if (doorClockIntervalId) return;

  const syncAllDoorClocks = async () => {
    try {
      const { syncDoorClock } = require("./porteService");

      // ✅ On itère sur les devices (Module) qui ont une MAC associée à un poulailler
      // pour passer la MAC à syncDoorClock
      const devices = await Module.find({
        macAddress: { $exists: true, $ne: null },
        poulailler: { $exists: true, $ne: null },
        status: "associated",
      }).lean();

      for (const device of devices) {
        if (device.macAddress && device.poulailler) {
          await syncDoorClock(
            device.poulailler.toString(),
            device.macAddress, // ✅ passer la MAC
          );
        }
      }
    } catch (error) {
      console.error("[DOOR-CLOCK] Erreur sync horloge:", error.message);
    }
  };

  syncAllDoorClocks();
  doorClockIntervalId = setInterval(syncAllDoorClocks, 60000);

  console.log("[MQTT] Door clock sync started");
};

const stopDoorMonitoring = () => {
  if (doorTimeoutIntervalId) {
    clearInterval(doorTimeoutIntervalId);
    doorTimeoutIntervalId = null;
    console.log("[MQTT] Door timeout monitoring stopped");
  }
};

const stopDoorClockSync = () => {
  if (doorClockIntervalId) {
    clearInterval(doorClockIntervalId);
    doorClockIntervalId = null;
    console.log("[MQTT] Door clock sync stopped");
  }
};

module.exports = {
  connectMqtt,
  publishCommand,
  publishConfig,
  disconnectMqtt,
  getMqttClient: () => client,
  startDoorMonitoring,
  stopDoorMonitoring,
  startDoorClockSync,
  stopDoorClockSync,
};
