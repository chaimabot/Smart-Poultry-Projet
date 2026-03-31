/**
 * mqttService.js
 * Utilise la librairie "mqtt" (pure JS) — fonctionne sur Web ET React Native.
 * Installer : npm install mqtt
 */

import mqtt from "mqtt";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MQTT_BROKER, MQTT_USER, MQTT_PASS } from "@env";

const BROKER_URL =
  MQTT_BROKER ||
  "wss://372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud:8884/mqtt";

let client = null;

export const connectMqtt = async (userToken, userId, onMessage) => {
  const connectionState = { isConnected: false };

  const updateConnectionState = (connected) => {
    connectionState.isConnected = connected;
  };
  if (!userToken) {
    console.warn("[MQTT] No user token, skipping connection");
    return null;
  }

  // Évite une double-connexion
  if (client && client.connected) return client;

  // Client ID unique avec token pour éviter conflits
  const clientId = `mobile_${userId}_${userToken.slice(-8)}_${Date.now()}`;

  const options = {
    username: MQTT_USER || "backend",
    password: MQTT_PASS || "",
    keepalive: 60,
    clientId,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  };

  client = mqtt.connect(BROKER_URL, options);

  client.on("connect", () => {
    updateConnectionState(true);
    console.log("[MQTT] ✅ Mobile connected (subscribe-only mode)");
    const topics = ["poulailler/+/status", "poulailler/+/measures"];
    topics.forEach((topic) =>
      client.subscribe(topic, (err) => {
        if (err) console.warn("[MQTT] Subscribe error:", topic, err);
      }),
    );
  });

  client.on("message", (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      onMessage(topic, data);
    } catch (e) {
      console.warn("[MQTT] Invalid JSON:", message.toString());
    }
  });

  client.on("offline", () => {
    updateConnectionState(false);
    console.warn("[MQTT] Offline");
  });

  client.on("error", (err) => {
    updateConnectionState(false);
    console.error("[MQTT] Error:", err);
  });

  client.on("reconnect", () => {
    console.log("[MQTT] Reconnecting...");
  });

  client.on("offline", () => {
    connectionState.isConnected = false;
    console.warn("[MQTT] Offline");
  });

  return client;
};

export const subscribePoultry = (poulaillerId) => {
  if (!client || !client.connected || !poulaillerId) return;

  const topics = [
    `poulailler/${poulaillerId}/status`,
    `poulailler/${poulaillerId}/measures`,
  ];
  topics.forEach((topic) =>
    client.subscribe(topic, (err) => {
      if (err) console.warn("[MQTT] Subscribe error:", topic, err);
    }),
  );
};

export const disconnectMqtt = () => {
  if (client) {
    client.end(true);
    client = null;
    console.log("[MQTT] Disconnected");
  }
};

let connectionState = { isConnected: false };

export const getConnectionState = () => connectionState.isConnected;

export const publishToPoultry = (poultryId, command, value) => {
  if (!client || !client.connected) {
    console.warn("[MQTT] Not connected, cannot publish");
    return false;
  }
  let topic, payload;
  if (command === "fanAuto" || command === "lamp") {
    payload = { mode: value ? "auto" : "manual" };
    topic = `poulailler/${poultryId}/commands/${command}`;
  } else if (command === "lamp") {
    // manual toggle, but since toggleLamp sends bool, treat as action
    payload = { mode: "manual", action: value ? "on" : "off" };
    topic = `poulailler/${poultryId}/commands/lamp`;
  } else {
    payload = { [command]: value };
    topic = `poulailler/${poultryId}/commands/${command}`;
  }
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error("[MQTT] Publish error:", topic, err);
  });
  console.log(`[MQTT] -> ${topic}:`, payload);
  return true;
};

export const subscribeToPoultry = (poultryId, onData) => {
  if (!client?.connected || !poultryId) return;

  const topics = [
    `poulailler/${poultryId}/sensors`,
    `poulailler/${poultryId}/actuators`,
  ];
  topics.forEach((topic) =>
    client.subscribe(topic, (err) => {
      if (err) console.error("Subscribe error:", topic, err);
    }),
  );
};

export default {
  connectMqtt,
  subscribeToPoultry,
  disconnectMqtt,
  publishToPoultry,
  getConnectionState,
};
