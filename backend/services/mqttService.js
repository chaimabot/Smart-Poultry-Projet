const mqtt = require("mqtt");
const mongoose = require("mongoose");
const Poulailler = require("../models/Poulailler");
const Measure = require("../models/Measure");
const Module = require("../models/Module");
const DoorEvent = require("../models/DoorEvent");
const { checkSensorThresholds, createMqttAlert } = require("./alertService");
const doorController = require("../controllers/doorController");

let client = null;
let lastMqttDisconnectTime = 0;
let mqttDisconnectAlertSent = false;

// ============================================================================
// CONFIGURATION ET CONNEXION MQTT
// ============================================================================
const connectMqtt = () => {
  // 1. Extraction et nettoyage des variables d'environnement
  const host =
    process.env.MQTT_BROKER ||
    "372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud";
  // const port = parseInt(process.env.MQTT_PORT) || 8883; // Disabled - using WebSocket
  const username = process.env.MQTT_USER?.trim();
  const password = process.env.MQTT_PASS?.trim();

  if (!username || !password) {
    console.error(
      "[MQTT] ❌ Erreur : MQTT_USER ou MQTT_PASS est vide dans le fichier .env",
    );
    return null;
  }

  // Nettoyage du host pour ne garder que le nom de domaine
  // WebSocket comme mobile (wss:// port 8884)
  const cleanHost = host.replace("wss://", "").split(":")[0];
  const brokerUrl = `wss://${cleanHost}:8884/mqtt`;
  const wsPort = 8884; // WebSocket port

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
    // WebSocket compatible
    protocolId: "MQTT",
    protocolVersion: 4,
    rejectUnauthorized: true, // ✅ SÉCURITÉ: Vérifier certificats SSL/TLS (HiveMQ)
  };

  client = mqtt.connect(brokerUrl, options);

  // --- ÉVÉNEMENTS DU CLIENT ---
  client.on("connect", () => {
    console.log(`[MQTT] ✅ Backend connecté avec succès au broker !`);
    mqttDisconnectAlertSent = false;

    // Create reconnect alert for all poulailliers
    (async () => {
      try {
        const poulailliers = await Poulailler.find().select("_id").lean();
        for (const poule of poulailliers) {
          await createMqttAlert(
            poule._id.toString(),
            "reconnect"
          );
        }
      } catch (error) {
        console.error("[MQTT] Error creating reconnect alerts:", error);
      }
    })();

    // Liste des topics
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

    // Start door timeout monitoring on MQTT connection
    startDoorMonitoring();
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
  });

  client.on("reconnect", () => {
    console.log("[MQTT] Reconnexion en cours...");
  });

  client.on("offline", () => {
    console.log("[MQTT] Client hors ligne - tentative de reconnexion...");
    (async () => {
      // After 30s offline, create danger alert for all poulailliers
      if (Date.now() - lastMqttDisconnectTime > 30000 && !mqttDisconnectAlertSent) {
        try {
          const poulailliers = await Poulailler.find().select("_id").lean();
          for (const poule of poulailliers) {
            await createMqttAlert(
              poule._id.toString(),
              "disconnect"
            );
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
  const topicParts = topic.split("/");
  const payload = message.toString();
  let data;

  try {
    data = JSON.parse(payload);
  } catch (e) {
    if (process.env.DEBUG_MQTT) console.debug("[MQTT] non-JSON skip:", topic);
    return;
  }

  // 1. Discovery (smartpoultry/discovery)
  if (topic === "smartpoultry/discovery") {
    const { mac, serial } = data;
    if (!mac) return;
    await Module.findOneAndUpdate(
      { macAddress: mac.toUpperCase() },
      { lastPing: new Date(), status: "online" },
      { upsert: false },
    );
    console.log(`[MQTT] Module ${serial || mac} détecté en ligne.`);
    return;
  }

  // 2. Mesures (poulailler/{ID}/measures)
  if (topicParts[0] === "poulailler" && topicParts[2] === "measures") {
    const poultryId = topicParts[1];
    if (!mongoose.Types.ObjectId.isValid(poultryId)) return;

    // Mise à jour du dernier état du Poulailler
    const updatedPoulailler = await Poulailler.findByIdAndUpdate(
      poultryId,
      {
        lastMonitoring: {
          temperature: data.temperature,
          humidity: data.humidity,
          co2: data.co2,
          nh3: data.nh3,
          dust: data.dust,
          waterLevel: data.waterLevel,
          airQualityPercent: data.airQualityPercent,
          nh3DigitalAlert: data.nh3DigitalAlert,
          timestamp: new Date(),
        },
        updatedAt: new Date(),
      },
      { new: true },
    );

    if (updatedPoulailler) {
      // Sauvegarde dans la collection historique Measure
      const measure = new Measure({
        poulailler: poultryId,
        ...data,
        timestamp: new Date(),
      });
      await measure.save();
      console.log(
        `[MQTT] Mesures enregistrées pour le poulailler ${poultryId}`,
      );

      // [ALERT] Check thresholds and create alerts
      await checkSensorThresholds(
        poultryId,
        data,
        updatedPoulailler.thresholds
      );
    }
    return;
  }

  // 3. Status actuators (poulailler/{ID}/status)
  if (topicParts[0] === "poulailler" && topicParts[2] === "status") {
    const poultryId = topicParts[1];
    if (!mongoose.Types.ObjectId.isValid(poultryId)) return;

    const poulailler = await Poulailler.findById(poultryId);
    if (!poulailler) {
      console.warn(`[MQTT] Poulailler ${poultryId} non trouvé pour status`);
      return;
    }

    // Update ventilation + lamp states from ESP32
    const updates = {
      "actuatorStates.ventilation.status": data.fanOn ? "on" : "off",
      "actuatorStates.ventilation.mode": data.fanAuto ? "auto" : "manual",
      "actuatorStates.lamp.status": data.lampOn ? "on" : "off",
      "actuatorStates.lamp.mode": data.lampAuto ? "auto" : "manual",
      updatedAt: new Date(),
    };

    // [DOOR] Track door status and log events
    if (data.door !== undefined) {
      updates["actuatorStates.door.status"] = data.door ? "open" : "closed";
      
      // Log door event if status changed
      const oldDoorStatus = poulailler.actuatorStates?.door?.status;
      if (oldDoorStatus !== (data.door ? "open" : "closed")) {
        const doorEvent = new DoorEvent({
          poulaillerId: poultryId,
          action: data.door ? "open" : "close",
          source: "auto", // Always auto from ESP32 status updates
          timestamp: new Date(),
        });
        await doorEvent.save();
        console.log(
          `[DOOR] Event logged: ${data.door ? "OPEN" : "CLOSE"} for ${poultryId}`
        );

        // Door motion completed successfully - record in alerts
        try {
          const action = data.door ? "open" : "close";
          await doorController.recordDoorCompletion(poultryId, action);
        } catch (error) {
          console.error("[DOOR] Error recording door completion alert:", error);
        }
      }
    }

    await Poulailler.findByIdAndUpdate(poultryId, updates);

    console.log(
      `[MQTT] Status ventilateur mis à jour pour ${poultryId}: ${data.fanOn ? "ON" : "OFF"} (${data.fanAuto ? "AUTO" : "MANUEL"})`,
    );
    return;
  }

  // 4. Door commands (poulailler/{ID}/commands/door) - Track motion start
  if (
    topicParts[0] === "poulailler" &&
    topicParts[2] === "commands" &&
    topicParts[3] === "door"
  ) {
    const poultryId = topicParts[1];
    if (!mongoose.Types.ObjectId.isValid(poultryId)) return;

    if (data.action === "open" || data.action === "close") {
      // Track door motion for timeout detection
      try {
        doorController.trackDoorMotion(poultryId, data.action);
        console.log(
          `[DOOR] Motion tracked: ${data.action.toUpperCase()} for ${poultryId}`
        );
      } catch (error) {
        console.error("[DOOR] Error tracking motion:", error);
      }
    }
    return;
  }

  // FIX: BUG5 - Handle /config/get requests from ESP32
  if (
    topicParts[0] === "poulailler" &&
    topicParts[2] === "config" &&
    topicParts[3] === "get"
  ) {
    const poultryId = topicParts[1];
    const poulaillersController = require("./controllers/poulaillersController");
    await poulaillersController.syncConfig(poultryId, module.exports);
    return;
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
  if (client) client.end();
};

let doorTimeoutIntervalId = null;

const startDoorMonitoring = () => {
  if (doorTimeoutIntervalId) return; // Already running

  // Check every 5 seconds if any door motion has timed out
  doorTimeoutIntervalId = setInterval(async () => {
    try {
      // Get all tracked doors and check for timeouts
      // This is handled by doorController's in-memory map
      // which tracks start times. We need to check all doors in that map.
      // For now, create a simple polling that checks the tracker
      const poulailliers = await Poulailler.find().select("_id").lean();
      for (const poule of poulailliers) {
        await doorController.checkDoorTimeout(poule._id.toString());
      }
    } catch (error) {
      console.error("[MQTT] Error checking door timeouts:", error);
    }
  }, 5000);

  console.log("[MQTT] Door timeout monitoring started");
};

const stopDoorMonitoring = () => {
  if (doorTimeoutIntervalId) {
    clearInterval(doorTimeoutIntervalId);
    doorTimeoutIntervalId = null;
    console.log("[MQTT] Door timeout monitoring stopped");
  }
};

module.exports = {
  connectMqtt,
  publishCommand,
  disconnectMqtt,
  getMqttClient: () => client,
  startDoorMonitoring,
  stopDoorMonitoring,
};
