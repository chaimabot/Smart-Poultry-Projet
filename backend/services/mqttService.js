const mqtt = require("mqtt");
const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const Measure = require("../models/Measure");
const Module = require("../models/Module");
const DoorEvent = require("../models/DoorEvent");
const {
  checkSensorThresholds,
  createMqttAlert,
  createActuatorAlert, // ✅ AJOUT
} = require("./alertService");

let client = null;
let lastMqttDisconnectTime = 0;
let mqttDisconnectAlertSent = false;
let doorTimeoutIntervalId = null; // FIX: Prevent ReferenceError
let doorClockIntervalId = null;

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

  // --- ÉVÉNEMENTS DU CLIENT ---
  client.on("connect", () => {
    console.log(`[MQTT] ✅ Backend connecté avec succès au broker !`);
    mqttDisconnectAlertSent = false;

    // ✅ NE PAS créer d'alerte pour "connect" ou "reconnect"
    // Ces événements sont du bruit inutile pour l'utilisateur

    const topics = [
      "poulailler/+/measures",
      "smartpoultry/discovery",
      "smartpoultry/heartbeat",
      "poulailler/+/status",
      "poulailler/+/commands/door",
    ];

    topics.forEach((topic) => {
      client.subscribe(topic, (err) => {
        if (!err) console.log(`[MQTT] Souscrit à : ${topic}`);
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
        "👉 CONSEIL : Vérifiez que l'utilisateur 'backend' existe dans la console HiveMQ.",
      );
      console.log(
        "👉 CONSEIL : Assurez-vous qu'il n'y a pas d'autres sessions 'backend' actives.",
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
          const poulailliers = await Poulailler.find().select("_id").lean();
          for (const poule of poulailliers) {
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

    // ... [reste identique jusqu'à door status]

    // 3. Status actuators
    if (topicParts[0] === "poulailler" && topicParts[2] === "status") {
      const poultryId = topicParts[1];
      if (!mongoose.Types.ObjectId.isValid(poultryId)) return;

      const poulailler = await Poulailler.findById(poultryId);
      if (!poulailler) return;

      // updates + door event code...
      // [garder tout le bloc existant]

      // Dynamic import SAFE
      let doorController;
      try {
        doorController = require("../controllers/doorController");
      } catch (err) {
        console.error("[MQTT] doorController load fail:", err.message);
        return;
      }

      // Rest of door logic with try/catch...
    }
  } catch (error) {
    console.error("[MQTT] handleMessage ERROR:", error.message);
  }
};

// ============================================================================
// ACTIONS SORTANTES
// ============================================================================
const publishCommand = (poultryId, command, value) => {
  if (!client || !client.connected) {
    console.error("[MQTT] Publication impossible : client déconnecté.");
    return false;
  }
  const topic = `poulailler/${poultryId}/commands`;
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

// 2. Modifie la fonction startDoorMonitoring en bas du fichier :
const startDoorMonitoring = () => {
  if (doorTimeoutIntervalId) return;

  doorTimeoutIntervalId = setInterval(async () => {
    try {
      const doorController = require("../controllers/doorController");
      const poulailliers = await Poulailler.find().select("_id").lean();

      if (!poulailliers?.length) {
        return; // No poulaillers yet
      }

      for (const poule of poulailliers) {
        if (mongoose.Types.ObjectId.isValid(poule._id)) {
          await doorController.checkDoorTimeout(poule._id.toString());
        }
      }
    } catch (error) {
      console.error("[DOOR-MONITOR] Erreur timeout check:", error.message);
      // Ne pas crasher le serveur
    }
  }, 10000); // 10s au lieu de 5s

  console.log("[MQTT] Door monitoring started (safe)");
};

const startDoorClockSync = () => {
  if (doorClockIntervalId) return;

  const syncAllDoorClocks = async () => {
    try {
      const { syncDoorClock } = require("./porteService");
      const poulailliers = await Poulailler.find().select("_id").lean();

      for (const poule of poulailliers) {
        await syncDoorClock(poule._id.toString());
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
  disconnectMqtt,
  getMqttClient: () => client,
  startDoorMonitoring,
  stopDoorMonitoring,
  startDoorClockSync,
  stopDoorClockSync,
};
