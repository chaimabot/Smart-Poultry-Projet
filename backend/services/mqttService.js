// services/mqttService.js
// CORRIGÉ : rejectUnauthorized: false + mqtts:// port 8883 + reconnexion robuste

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
let isConnecting = false;
let reconnectTimer = null;
let lastMqttDisconnectTime = 0;
let mqttDisconnectAlertSent = false;
let doorTimeoutIntervalId = null;
let doorClockIntervalId = null;
let connectionAttempt = 0;

const resolvePoulaillerByMac = async (macAddress) => {
  const device = await Module.findOne({ macAddress });
  if (!device || !device.poulailler) return null;
  return await Poulailler.findById(device.poulailler);
};

const resolveMacByPoulaillerId = async (poulaillerId) => {
  const device = await Module.findOne({ poulailler: poulaillerId });
  if (!device || !device.macAddress) return null;
  return device.macAddress;
};

// ✅ NOUVEAU : Vérifie si connecté, reconnecte si besoin
async function ensureConnected(timeoutMs = 10000) {
  if (client && client.connected) return true;

  console.log("[MQTT] Client non connecté, tentative de connexion...");
  connectMqtt();

  // Attend la connexion
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    if (client && client.connected) return true;
  }

  return false;
}

const connectMqtt = () => {
  // Évite les connexions multiples
  if (isConnecting) {
    console.log("[MQTT] Connexion déjà en cours...");
    return client;
  }

  if (client && client.connected) {
    console.log("[MQTT] Déjà connecté");
    return client;
  }

  const host =
    process.env.MQTT_BROKER ||
    "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud";
  const username = process.env.MQTT_USER?.trim();
  const password = process.env.MQTT_PASS?.trim();

  // ✅ CORRECTION : Port 8883 par défaut (TLS natif), 8884 seulement si explicitement configuré
  let port = parseInt(process.env.MQTT_PORT) || 8883;

  // Force 8883 si pas explicitement 8884
  if (port !== 8884) port = 8883;

  if (!username || !password) {
    console.error(
      "[MQTT] ❌ Credentials manquants (MQTT_USER ou MQTT_PASS vide)",
    );
    return null;
  }

  // ✅ CORRECTION : ClientId COURT (HiveMQ gratuit peut rejeter les longs)
  const clientId = `spb_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36).substr(-4)}`;

  // ✅ CORRECTION : mqtts:// pour 8883 (MQTT natif TLS), wss:// pour 8884 (WebSocket)
  const isWebSocket = port === 8884;
  const protocol = isWebSocket ? "wss" : "mqtts";
  const brokerUrl = isWebSocket
    ? `${protocol}://${host}:${port}/mqtt`
    : `${protocol}://${host}:${port}`;

  connectionAttempt++;
  console.log(`[MQTT] Tentative #${connectionAttempt} → ${brokerUrl}`);
  console.log(
    `[MQTT] Protocole: ${protocol.toUpperCase()} | Port: ${port} | ClientId: ${clientId}`,
  );

  isConnecting = true;

  const options = {
    clientId: clientId,
    username: username,
    password: password,
    clean: true, // Session non persistante
    keepalive: 60,
    reconnectPeriod: 0, // ✅ Désactivé — on gère manuellement pour éviter les boucles
    connectTimeout: 15000, // 15 secondes
    // ✅ CORRECTION CRITIQUE : false pour accepter le certificat HiveMQ Cloud
    rejectUnauthorized: false,
  };

  // Options spécifiques WebSocket
  if (isWebSocket) {
    options.protocol = "mqtt";
    options.protocolVersion = 4;
  }

  try {
    client = mqtt.connect(brokerUrl, options);
  } catch (err) {
    console.error("[MQTT] ❌ Erreur création client:", err.message);
    isConnecting = false;
    scheduleReconnect();
    return null;
  }

  // ── ÉVÉNEMENTS ───────────────────────────────────────────────────────────

  client.on("connect", () => {
    isConnecting = false;
    connectionAttempt = 0;
    console.log(`[MQTT] ✅ CONNECTÉ au broker ! (ClientId: ${clientId})`);

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    mqttDisconnectAlertSent = false;

    const topics = [
      "poulailler/+/measures",
      "poulailler/+/status",
      "poulailler/+/camera/image",
      "smartpoultry/discovery",
      "smartpoultry/heartbeat",
    ];

    topics.forEach((topic) => {
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (!err) {
          console.log(`[MQTT] Souscrit: ${topic}`);
        } else {
          console.error(`[MQTT] Erreur souscription ${topic}:`, err.message);
        }
      });
    });

    startDoorMonitoring();
    startDoorClockSync();
  });

  client.on("message", async (topic, message) => {
    try {
      await handleMqttMessage(topic, message);
    } catch (error) {
      console.error(`[MQTT] Erreur traitement ${topic}:`, error.message);
    }
  });

  client.on("error", (error) => {
    isConnecting = false;
    console.error("[MQTT] ❌ Erreur:", error.message);

    if (error.code === "ECONNREFUSED") {
      console.error("[MQTT] → Connexion refusée — vérifiez le port et l'hôte");
    }
    if (error.code === "ENOTFOUND") {
      console.error("[MQTT] → Hôte introuvable — vérifiez MQTT_BROKER");
    }
    if (error.message.includes("connack timeout")) {
      console.error(
        "[MQTT] → CONNACK timeout — credentials incorrects ou cluster non actif",
      );
      console.error("[MQTT] → Vérifiez dans console.hivemq.cloud:");
      console.error("[MQTT] →   1. Cluster est 'Running'");
      console.error("[MQTT] →   2. Utilisateur existe avec ce mot de passe");
      console.error("[MQTT] →   3. Pas de restriction IP");
    }
    if (error.message.includes("Not authorized")) {
      console.error(
        "[MQTT] → NON AUTORISÉ — recréez l'utilisateur dans HiveMQ Cloud",
      );
    }
    if (error.message.includes("certificate")) {
      console.error(
        "[MQTT] → Erreur certificat — rejectUnauthorized:false devrait résoudre",
      );
    }
  });

  client.on("close", () => {
    isConnecting = false;
    console.log("[MQTT] 🔌 Connexion fermée");
    lastMqttDisconnectTime = Date.now();
    stopDoorClockSync();
    scheduleReconnect();
  });

  client.on("offline", () => {
    console.log("[MQTT] ⚠️ Client hors ligne");
  });

  client.on("reconnect", () => {
    console.log("[MQTT] 🔄 Reconnexion auto...");
  });

  client.on("end", () => {
    isConnecting = false;
    console.log("[MQTT] 🛑 Client terminé");
  });

  return client;
};

// ✅ NOUVEAU : Reconnexion manuelle avec backoff exponentiel
function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = Math.min(
    5000 * Math.pow(2, Math.min(connectionAttempt, 5)),
    60000,
  );
  console.log(`[MQTT] Reconnexion programmée dans ${delay}ms...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    console.log("[MQTT] Tentative reconnexion...");
    connectMqtt();
  }, delay);
}

const handleMqttMessage = async (topic, message) => {
  try {
    const topicParts = topic.split("/");
    const payload = message.toString();
    let data;

    try {
      data = JSON.parse(payload);
    } catch (e) {
      if (topic.includes("/camera/image")) {
        data = { imageBase64: payload };
      } else {
        return;
      }
    }

    if (
      topic === "smartpoultry/discovery" ||
      topic === "smartpoultry/heartbeat"
    ) {
      const mac = data.mac || data.macAddress || data.deviceId;
      if (!mac) return;
      await Module.findOneAndUpdate(
        { macAddress: mac },
        { lastPing: new Date() },
      );
      return;
    }

    if (topic.includes("/camera/image") && topicParts.length >= 3) {
      const macAddress = topicParts[1];
      const poulailler = await resolvePoulaillerByMac(macAddress);
      if (!poulailler) {
        console.warn(`[MQTT] Aucun poulailler pour MAC caméra: ${macAddress}`);
        return;
      }

      const imageBase64 = data.imageBase64 || payload;
      if (!imageBase64 || imageBase64.length < 100) {
        console.warn(`[MQTT] Image invalide (${imageBase64?.length} bytes)`);
        return;
      }

      const { handleCameraImage } = require("./aiService");
      await handleCameraImage(
        poulailler._id.toString(),
        macAddress,
        imageBase64,
      );

      console.log(
        `[MQTT] ✅ Image traitée: ${poulailler._id} (${Math.round(imageBase64.length / 1024)}Ko)`,
      );
      return;
    }

    if (topicParts[0] !== "poulailler" || topicParts.length < 3) return;

    const macAddress = topicParts[1];
    const messageType = topicParts[2];
    const poulailler = await resolvePoulaillerByMac(macAddress);
    if (!poulailler) {
      console.warn(`[MQTT] Aucun poulailler pour MAC: ${macAddress}`);
      return;
    }

    const poulaillerId = poulailler._id.toString();

    if (messageType === "measures") {
      await Measure.create({
        poulailler: poulailler._id,
        temperature: data.temperature ?? null,
        humidity: data.humidity ?? null,
        co2: data.co2 ?? null,
        nh3: data.nh3 ?? null,
        waterLevel: data.waterLevel ?? null,
        timestamp: new Date(),
      });

      poulailler.lastMonitoring = {
        temperature: data.temperature ?? poulailler.lastMonitoring?.temperature,
        humidity: data.humidity ?? poulailler.lastMonitoring?.humidity,
        co2: data.co2 ?? poulailler.lastMonitoring?.co2,
        nh3: data.nh3 ?? poulailler.lastMonitoring?.nh3,
        waterLevel: data.waterLevel ?? poulailler.lastMonitoring?.waterLevel,
        timestamp: new Date(),
      };

      await Module.findOneAndUpdate(
        { macAddress },
        { lastPing: new Date(), status: "associated" },
      );
      if (poulailler.status !== "connecte") poulailler.status = "connecte";
      await poulailler.save();

      await checkSensorThresholds(poulaillerId, data, poulailler.thresholds);
      await resolveNormalValues(poulaillerId, data, poulailler.thresholds);
      return;
    }

    if (messageType === "status") {
      if (data.fanOn !== undefined)
        poulailler.actuatorStates.ventilation.status = data.fanOn
          ? "on"
          : "off";
      if (data.lampOn !== undefined)
        poulailler.actuatorStates.lamp.status = data.lampOn ? "on" : "off";
      if (data.pumpOn !== undefined)
        poulailler.actuatorStates.pump.status = data.pumpOn ? "on" : "off";

      publishConfig(macAddress, poulailler);

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

        if (prevDoorStatus !== newDoorStatus) {
          await DoorEvent.create({
            poulailler: poulailler._id,
            action: newDoorStatus === "open" ? "open" : "close",
            source: "esp32",
            doorState: data.doorState,
            timestamp: new Date(),
          });
        }

        if (data.doorState === "BLOCKED") {
          try {
            const doorController = require("../controllers/doorController");
            await doorController.checkDoorTimeout(poulaillerId);
          } catch (err) {}
        }
      }

      await poulailler.save();
      return;
    }
  } catch (error) {
    console.error("[MQTT] handleMessage ERROR:", error.message);
  }
};

const publishConfig = (macAddress, poulailler) => {
  if (!client || !client.connected) return;
  const config = {
    tempMin: poulailler.thresholds.temperatureMin,
    tempMax: poulailler.thresholds.temperatureMax,
    waterMin: poulailler.thresholds.waterLevelMin,
    co2Max: poulailler.thresholds.co2Max,
  };
  client.publish(`poulailler/${macAddress}/config`, JSON.stringify(config), {
    qos: 0,
  });
};

// ✅ CORRECTION : Attend connexion avant de publier
const publishCameraCommand = async (poulaillerId) => {
  const connected = await ensureConnected(10000);
  if (!connected) {
    console.error("[MQTT] ❌ Impossible de se connecter au broker");
    return false;
  }

  const macAddress = await resolveMacByPoulaillerId(poulaillerId);
  if (!macAddress) {
    console.error(`[MQTT] Aucune MAC pour poulailler ${poulaillerId}`);
    return false;
  }

  const topic = `poulailler/${macAddress}/cmd/camera`;
  const payload = JSON.stringify({
    command: "capture_photo",
    requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  });

  return new Promise((resolve) => {
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error("[MQTT] Erreur publish:", err.message);
        resolve(false);
      } else {
        console.log(`[MQTT] 📷 Commande envoyée: ${topic}`);
        resolve(true);
      }
    });
  });
};

const publishCommand = (macAddressOrId, command, value) => {
  if (!client || !client.connected) {
    console.error("[MQTT] Client déconnecté");
    return false;
  }
  const topic = `poulailler/${macAddressOrId}/commands`;
  client.publish(
    topic,
    JSON.stringify({ command, value, timestamp: new Date().toISOString() }),
    { qos: 0 },
  );
  return true;
};

const disconnectMqtt = () => {
  stopDoorMonitoring();
  stopDoorClockSync();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (client) client.end(true);
};

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
      console.error("[DOOR-MONITOR] Erreur:", error.message);
    }
  }, 10000);
  console.log("[MQTT] Door monitoring started");
};

const startDoorClockSync = () => {
  if (doorClockIntervalId) return;
  const syncAllDoorClocks = async () => {
    try {
      const { syncDoorClock } = require("./porteService");
      const devices = await Module.find({
        macAddress: { $exists: true, $ne: null },
        poulailler: { $exists: true, $ne: null },
        status: "associated",
      }).lean();
      for (const device of devices) {
        if (device.macAddress && device.poulailler) {
          await syncDoorClock(device.poulailler.toString(), device.macAddress);
        }
      }
    } catch (error) {
      console.error("[DOOR-CLOCK] Erreur:", error.message);
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
    console.log("[MQTT] Door monitoring stopped");
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
  publishCameraCommand,
  resolveMacByPoulaillerId,
  disconnectMqtt,
  getMqttClient: () => client,
  ensureConnected,
  startDoorMonitoring,
  stopDoorMonitoring,
  startDoorClockSync,
  stopDoorClockSync,
};
