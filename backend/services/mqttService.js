const mqtt = require("mqtt");
const Poulailler = require("../models/Poulailler");
const Measure = require("../models/Measure");
const Module = require("../models/Module");

let client = null;

const mqttConfig = {
  broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 1000,
  connectTimeout: 10 * 1000,
};

const connectMqtt = () => {
  console.log("[MQTT] Connexion au broker:", mqttConfig.broker);

  client = mqtt.connect(mqttConfig.broker, {
    username: mqttConfig.username,
    password: mqttConfig.password,
    reconnectPeriod: mqttConfig.reconnectPeriod,
    connectTimeout: mqttConfig.connectTimeout,
  });

  client.on("connect", () => {
    console.log("[MQTT] Connecté au broker MQTT");
    client.subscribe("poulailler/+/measures", (err) => {
      if (err) {
        console.error("[MQTT] Erreur subscription:", err);
      } else {
        console.log("[MQTT] Souscrit à poulailler/+/measures");
      }
    });
    client.subscribe("poulailler/+/commands/response", (err) => {
      if (!err) console.log("[MQTT] Souscrit à poulailler/+/commands/response");
    });

    // =========================================================================
    // NOUVELLES SOUSCRIPTIONS POUR MODULE DISCOVERY & CLAIM
    // =========================================================================
    client.subscribe("smartpoultry/discovery", (err) => {
      if (!err) {
        console.log("[MQTT] Souscrit à smartpoultry/discovery");
      }
    });

    client.subscribe("smartpoultry/heartbeat", (err) => {
      if (!err) {
        console.log("[MQTT] Souscrit à smartpoultry/heartbeat");
      }
    });

    // Topic pour les réponses de claim par MAC
    client.subscribe("smartpoultry/claim/response", (err) => {
      if (!err) {
        console.log("[MQTT] Souscrit à smartpoultry/claim/response");
      }
    });
  });

  client.on("message", async (topic, message) => {
    console.log(`[MQTT] Message reçu sur ${topic}:`, message.toString());
    await handleMqttMessage(topic, message);
  });

  client.on("error", (error) => {
    console.error("[MQTT] Erreur:", error.message);
  });

  client.on("reconnect", () => {
    console.log("[MQTT] Reconnexion en cours...");
  });

  client.on("disconnect", () => {
    console.log("[MQTT] Déconnecté du broker");
  });

  return client;
};

// ============================================================================
// MODULE DISCOVERY - Première connexion du module
// ============================================================================
/**
 * Gère les messages de découverte (première connexion) des modules ESP32
 * Crée une entrée "pending_claim" si le module est inconnu
 */
const handleModuleDiscovery = async (message) => {
  try {
    const data = JSON.parse(message.toString());

    const { serial, mac, firmware } = data;

    if (!serial || !mac) {
      console.warn("[MQTT] Discovery: serial ou MAC manquant");
      return;
    }

    // Rechercher le module existant
    let module = await Module.findOne({ macAddress: mac.toUpperCase() });

    if (module) {
      // Module connu: mettre à jour le lastPing
      module.lastPing = new Date();
      module.updateStatus();

      // Si le module a un code claim non utilisé, informer le backend
      if (module.claimCode && !module.claimCodeUsedAt) {
        console.log(`[MQTT] Module ${serial} connu, en attente de claim`);
        module.status = "pending_claim";
      }

      await module.save();
      console.log(
        `[MQTT] Discovery: Module ${serial} mis à jour, status: ${module.status}`,
      );
    } else {
      // Nouveau module: créer une entrée en attente de claim
      // Note: On ne crée pas automatiquement le module pour la sécurité
      // L'admin doit d'abord générer un code claim
      console.log(
        `[MQTT] Discovery: Nouveau module detecté ${serial} (${mac})`,
      );
      console.log(
        `[MQTT] Aucun code claim associe. Veuillez generer un code depuis l'admin.`,
      );
    }
  } catch (error) {
    console.error("[MQTT] Erreur handleModuleDiscovery:", error.message);
  }
};

// ============================================================================
// MODULE HEARTBEAT - Ping périodique du module
// ============================================================================
/**
 * Gère les heartbeats périodiques des modules ESP32
 * Met à jour lastPing et ajuste le statut
 */
const handleModuleHeartbeat = async (message) => {
  try {
    const data = JSON.parse(message.toString());

    const { serial, mac, claimed, claimCode, rssi, uptime } = data;

    if (!mac) {
      console.warn("[MQTT] Heartbeat: MAC manquant");
      return;
    }

    const module = await Module.findOne({ macAddress: mac.toUpperCase() });

    if (!module) {
      console.warn(`[MQTT] Heartbeat: Module ${mac} non trouvé dans la DB`);
      return;
    }

    // Mettre à jour le lastPing
    module.lastPing = new Date();
    module.updateStatus();
    await module.save();

    console.log(
      `[MQTT] Heartbeat recu de ${serial}, status: ${module.status}, RSSI: ${rssi}`,
    );
  } catch (error) {
    console.error("[MQTT] Erreur handleModuleHeartbeat:", error.message);
  }
};

const handleMqttMessage = async (topic, message) => {
  try {
    const topicParts = topic.split("/");

    // =============================================================================
    // MODULE DISCOVERY - Première connexion du module
    // =============================================================================
    if (topic === "smartpoultry/discovery") {
      await handleModuleDiscovery(message);
      return;
    }

    // =============================================================================
    // MODULE HEARTBEAT - Ping périodique du module
    // =============================================================================
    if (topic === "smartpoultry/heartbeat") {
      await handleModuleHeartbeat(message);
      return;
    }

    // =============================================================================
    // MESURES EXISTANTES
    // =============================================================================
    if (topicParts[0] === "poulailler" && topicParts[2] === "measures") {
      const poultryId = topicParts[1];
      const data = JSON.parse(message.toString());

      console.log(`[MQTT] Données reçues pour poulailler ${poultryId}:`, data);

      const requiredFields = [
        "temperature",
        "humidity",
        "co2",
        "nh3",
        "dust",
        "waterLevel",
      ];
      const hasAllFields = requiredFields.every((field) =>
        data.hasOwnProperty(field),
      );

      if (!hasAllFields) {
        console.warn("[MQTT] Structure de donnée invalide, champs manquants");
        return;
      }

      const poulailler = await Poulailler.findByIdAndUpdate(
        poultryId,
        {
          lastMonitoring: {
            temperature: data.temperature,
            humidity: data.humidity,
            co2: data.co2,
            nh3: data.nh3,
            dust: data.dust,
            waterLevel: data.waterLevel,
            timestamp: new Date(),
          },
          updatedAt: new Date(),
        },
        { new: true },
      );

      if (!poulailler) {
        console.warn(`[MQTT] Poulailler ${poultryId} non trouvé`);
        return;
      }

      console.log(`[MQTT] lastMonitoring mis à jour pour ${poultryId}`);

      const measure = new Measure({
        poulailler: poultryId,
        temperature: data.temperature,
        humidity: data.humidity,
        co2: data.co2,
        nh3: data.nh3,
        dust: data.dust,
        waterLevel: data.waterLevel,
        timestamp: new Date(),
      });

      await measure.save();
      console.log(`[MQTT] Mesure sauvegardée pour ${poultryId}`);

      checkAlerts(poulailler, data);
    }
  } catch (error) {
    console.error(
      "[MQTT] Erreur lors du traitement du message:",
      error.message,
    );
  }
};

const checkAlerts = async (poulailler, data) => {
  if (data.temperature > 35) {
    console.warn(
      `[ALERT] Température élevée détectée pour ${poulailler._id}: ${data.temperature}°C`,
    );
  }
};

const publishCommand = (poultryId, command, value) => {
  if (!client || !client.connected) {
    console.error("[MQTT] Le client MQTT n'est pas connecté");
    return false;
  }

  const topic = `poulailler/${poultryId}/commands`;
  const payload = JSON.stringify({
    command,
    value,
    timestamp: new Date().toISOString(),
  });

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[MQTT] Erreur publication ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Commande publiée sur ${topic}:`, payload);
    }
  });

  return true;
};

const getMqttClient = () => client;

const disconnectMqtt = () => {
  if (client) {
    client.end();
    console.log("[MQTT] Déconnecté");
  }
};

module.exports = {
  connectMqtt,
  publishCommand,
  getMqttClient,
  disconnectMqtt,
  handleModuleDiscovery,
  handleModuleHeartbeat,
};
