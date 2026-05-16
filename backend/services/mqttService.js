// services/mqttService.js
// CORRIGÉ : Port 8883 (TLS direct), rejectUnauthorized: false, config robuste

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

const connectMqtt = () => {
  const host =
    process.env.MQTT_BROKER ||
    "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud";
  const username = process.env.MQTT_USER?.trim();
  const password = process.env.MQTT_PASS?.trim();
  // ✅ CORRECTION : Port 8883 par défaut (TLS direct), pas 8884
  const port = parseInt(process.env.MQTT_PORT) || 8883;

  if (!username || !password) {
    console.error(
      "[MQTT] ❌ Erreur : MQTT_USER ou MQTT_PASS est vide dans le fichier .env",
    );
    return null;
  }

  // ✅ CORRECTION : URL mqtts:// pour TLS direct sur port 8883
  const brokerUrl = `mqtts://${host}:${port}`;

  console.log(`[MQTT Backend] Connexion à ${brokerUrl}`);
  console.log(`[MQTT Backend] User: ${username} | Port: ${port}`);

  const options = {
    keepalive: 60,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    username: username,
    password: password,
    clientId: `backend_${Math.random().toString(16).slice(2, 10)}_${Date.now()}`,
    rejectUnauthorized: false, // ✅ CRITIQUE : Accepte certificat HiveMQ Cloud
  };

  client = mqtt.connect(brokerUrl, options);

  client.on("connect", () => {
    console.log(`[MQTT] ✅ Backend connecté avec succès au broker !`);
    mqttDisconnectAlertSent = false;

    const topics = [
      "poulailler/+/measures",
      "poulailler/+/status",
      "poulailler/+/camera/image",
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
    if (error.message.includes("connack timeout")) {
      console.log(
        "👉 CONSEIL : Vérifiez le port (8883 pour TLS, 8884 pour WebSocket) et les credentials.",
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
        if (process.env.DEBUG_MQTT)
          console.debug("[MQTT] non-JSON skip:", topic);
        return;
      }
    }

    if (
      topic === "smartpoultry/discovery" ||
      topic === "smartpoultry/heartbeat"
    ) {
      const mac = data.mac || data.macAddress || data.deviceId;
      if (!mac) return;

      console.log(`[MQTT] Discovery/Heartbeat — MAC: ${mac}`);
      await Module.findOneAndUpdate(
        { macAddress: mac },
        { lastPing: new Date() },
      );
      return;
    }

    if (topic.includes("/camera/image") && topicParts.length >= 3) {
      const macAddress = topicParts[1];

      console.log(`[MQTT] 📷 Image reçue depuis MAC: ${macAddress}`);

      const poulailler = await resolvePoulaillerByMac(macAddress);
      if (!poulailler) {
        console.warn(
          `[MQTT] Aucun poulailler trouvé pour MAC caméra: ${macAddress}`,
        );
        return;
      }

      const imageBase64 = data.imageBase64 || payload;

      if (!imageBase64 || imageBase64.length < 100) {
        console.warn(
          `[MQTT] Image invalide ou trop petite (${imageBase64?.length} bytes)`,
        );
        return;
      }

      const { handleCameraImage } = require("./aiService");
      await handleCameraImage(
        poulailler._id.toString(),
        macAddress,
        imageBase64,
      );

      console.log(
        `[MQTT] ✅ Image traitée — poulailler: ${poulailler._id} (${Math.round(imageBase64.length / 1024)}Ko)`,
      );
      return;
    }

    if (topicParts[0] !== "poulailler" || topicParts.length < 3) return;

    const macAddress = topicParts[1];
    const messageType = topicParts[2];

    const poulailler = await resolvePoulaillerByMac(macAddress);
    if (!poulailler) {
      console.warn(`[MQTT] Aucun poulailler trouvé pour MAC: ${macAddress}`);
      return;
    }

    const poulaillerId = poulailler._id.toString();

    if (messageType === "measures") {
      console.log(
        `[MQTT] Mesures reçues — MAC: ${macAddress} | poulailler: ${poulaillerId}`,
      );

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

      if (poulailler.status !== "connecte") {
        poulailler.status = "connecte";
      }
      await poulailler.save();

      await checkSensorThresholds(poulaillerId, data, poulailler.thresholds);
      await resolveNormalValues(poulaillerId, data, poulailler.thresholds);

      console.log(
        `[MQTT] ✅ Mesures enregistrées — T:${data.temperature}°C H:${data.humidity}% CO2:${data.co2}ppm Eau:${data.waterLevel}%`,
      );
      return;
    }

    if (messageType === "status") {
      console.log(
        `[MQTT] Status reçu — MAC: ${macAddress} | poulailler: ${poulaillerId}`,
      );

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

const publishConfig = (macAddress, poulailler) => {
  if (!client || !client.connected) return;

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

const publishCameraCommand = async (poulaillerId) => {
  if (!client || !client.connected) {
    console.error("[MQTT] Publication impossible : client déconnecté.");
    return false;
  }

  const macAddress = await resolveMacByPoulaillerId(poulaillerId);
  if (!macAddress) {
    console.error(`[MQTT] Aucune MAC trouvée pour poulailler ${poulaillerId}`);
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
        console.error("[MQTT] Erreur publish caméra:", err.message);
        resolve(false);
      } else {
        console.log(`[MQTT] 📷 Commande caméra envoyée sur ${topic}`);
        resolve(true);
      }
    });
  });
};

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
  publishCameraCommand,
  resolveMacByPoulaillerId,
  disconnectMqtt,
  getMqttClient: () => client,
  startDoorMonitoring,
  stopDoorMonitoring,
  startDoorClockSync,
  stopDoorClockSync,
};
