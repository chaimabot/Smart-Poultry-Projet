// hooks/usePoultryState.js

import { useState, useEffect, useCallback, useRef } from "react";
import { Animated } from "react-native";
import mqtt from "mqtt";
import {
  getPoultryById,
  getAlerts,
  createActuatorAlert,
  markAllAlertsAsRead,
  getThresholds,
  getDeviceByPoulailler,
} from "../services/poultry";

export const SENSOR_CONFIG = [
  {
    name: "Température",
    value: "--",
    unit: "°C",
    status: "normal",
    icon: "thermostat",
    key: "temperature",
  },
  {
    name: "Humidité",
    value: "--",
    unit: "%",
    status: "normal",
    icon: "water-drop",
    key: "humidity",
  },
  {
    name: "CO2",
    value: "--",
    unit: "ppm",
    status: "normal",
    icon: "co2",
    key: "co2",
  },
  {
    name: "NH3",
    value: "--",
    unit: "ppm",
    status: "normal",
    icon: "warning",
    key: "nh3",
  },
  {
    name: "Niveau eau",
    value: "--",
    unit: "%",
    status: "normal",
    icon: "water",
    key: "waterLevel",
  },
];

const THRESHOLD_MAP = {
  temperature: { min: "temperatureMin", max: "temperatureMax" },
  humidity: { min: "humidityMin", max: "humidityMax" },
  co2: { min: null, max: "co2Max" },
  nh3: { min: null, max: "nh3Max" },
  dust: { min: null, max: "dustMax" },
  waterLevel: { min: "waterLevelMin", max: null },
};

const DANGER_MARGINS = {
  temperature: 3,
  humidity: 10,
  co2: 500,
  nh3: 10,
  dust: 100,
  waterLevel: 10,
};

function calculateSensorStatus(key, value, dbThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !dbThresholds) return "normal";
  const map = THRESHOLD_MAP[key];
  if (!map) return "normal";
  const margin = DANGER_MARGINS[key] ?? 0;
  const max = map.max ? Number(dbThresholds[map.max]) : null;
  const min = map.min ? Number(dbThresholds[map.min]) : null;
  if (max !== null && !isNaN(max) && numVal > max)
    return numVal > max + margin ? "danger" : "warn";
  if (min !== null && !isNaN(min) && numVal < min)
    return numVal < min - margin ? "danger" : "warn";
  return "normal";
}

export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};
  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    const margin = DANGER_MARGINS[key] ?? 0;
    if (map.max && dbThresholds[map.max] != null) {
      const maxVal = Number(dbThresholds[map.max]);
      result[key] = {
        warn: `max ${maxVal}`,
        danger: `max ${maxVal + margin}`,
      };
    } else if (map.min && dbThresholds[map.min] != null) {
      const minVal = Number(dbThresholds[map.min]);
      result[key] = {
        warn: `min ${minVal}`,
        danger: `min ${minVal - margin}`,
      };
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOUVELLE FONCTION : Vérifie si le ventilateur doit tourner
// Logique : fan ON si température > tempMax OU co2 > co2Max OU nh3 > nh3Max
// ─────────────────────────────────────────────────────────────────────────────
function shouldFanBeOn(sensorsArray, dbThresholds) {
  if (!dbThresholds) return false;

  // Récupère les valeurs actuelles des capteurs
  const getValue = (key) => {
    const s = sensorsArray.find((s) => s.key === key);
    if (!s || s.value === "--") return null;
    return Number(s.value);
  };

  const temp = getValue("temperature");
  const co2 = getValue("co2");
  const nh3 = getValue("nh3");
  const humidity = getValue("humidity");

  const tempMax =
    dbThresholds.temperatureMax != null
      ? Number(dbThresholds.temperatureMax)
      : null;
  const co2Max =
    dbThresholds.co2Max != null ? Number(dbThresholds.co2Max) : null;
  const nh3Max =
    dbThresholds.nh3Max != null ? Number(dbThresholds.nh3Max) : null;
  const humidityMax =
    dbThresholds.humidityMax != null ? Number(dbThresholds.humidityMax) : null;

  // Fan ON si au moins un seuil est dépassé
  if (temp !== null && tempMax !== null && temp > tempMax) return true;
  if (co2 !== null && co2Max !== null && co2 > co2Max) return true;
  if (nh3 !== null && nh3Max !== null && nh3 > nh3Max) return true;
  if (humidity !== null && humidityMax !== null && humidity > humidityMax)
    return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnimRef = useRef(new Animated.Value(1));
  const pulseAnim = pulseAnimRef.current;
  const isMountedRef = useRef(true);
  const thresholdsRef = useRef(null);

  // ✅ Refs pour la logique auto (évite stale closures dans MQTT)
  const fanAutoRef = useRef(false); // est-ce que le mode auto est actif ?
  const lastFanAutoCmd = useRef(null); // dernière commande envoyée (true/false) → évite les doublons

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [sensors, setSensors] = useState(SENSOR_CONFIG);

  const [poultryInfo, setPoultryInfo] = useState({
    name: poultryName || "Poulailler Principal",
    location: "",
    animalCount: 0,
  });

  const [actuators, setActuators] = useState({
    fan: false,
    lamp: false,
    fanAuto: false, // ← false par défaut, l'éleveur choisit
    lampAuto: true,
    door: false,
    doorState: "UNKNOWN",
    doorMoving: false,
  });

  const [pumpData, setPumpData] = useState({ pumpAuto: false, pumpOn: false });
  const [doorMode, setDoorMode] = useState("horaire");
  const [doorSchedule, setDoorSchedule] = useState({
    openHour: 7,
    openMinute: 0,
    closeHour: 18,
    closeMinute: 0,
  });

  // ── isMounted guard ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Pulse animation ───────────────────────────────────────────────────────
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // ── Sync thresholds ref ───────────────────────────────────────────────────
  useEffect(() => {
    thresholdsRef.current = thresholds;
    if (!thresholds) return;
    setSensors((prev) =>
      prev.map((sensor) => {
        if (sensor.value === "--") return sensor;
        return {
          ...sensor,
          status: calculateSensorStatus(sensor.key, sensor.value, thresholds),
        };
      }),
    );
  }, [thresholds]);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ NOUVEAU : publishFanCommand (commande directe ON/OFF vers ESP32)
  // ─────────────────────────────────────────────────────────────────────────
  const publishFanCommand = useCallback((on) => {
    const client = mqttClientRef.current;
    if (!client?.connected) return;
    const macAddr =
      fanAutoRef.current !== undefined
        ? client._options?.clientId?.split("_")[1]
        : null;

    // On récupère macAddress depuis le clientId n'est pas fiable
    // On va utiliser une ref séparée
  }, []);

  // Ref pour macAddress (accessible dans MQTT callbacks)
  const macAddressRef = useRef(null);

  // ── API fetchers ──────────────────────────────────────────────────────────
  const fetchThresholds = useCallback(async () => {
    if (!poultryId) return;
    try {
      const res = await getThresholds(poultryId);
      if (res?.success && isMountedRef.current) setThresholds(res.data);
    } catch (e) {
      console.warn("[API] seuils:", e?.message);
    }
  }, [poultryId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await getAlerts(poultryId);
      if (res?.success && Array.isArray(res.data) && isMountedRef.current) {
        setAlerts(res.data);
        setAlertCount(res.data.filter((a) => !a.read).length);
      }
    } catch (e) {
      console.warn("[API] fetchAlerts:", e?.message);
    }
  }, [poultryId]);

  const fetchPoultryInfo = useCallback(async () => {
    if (!poultryId) return;
    try {
      const data = await getPoultryById(poultryId);
      if (data && isMountedRef.current) {
        setPoultryInfo({
          name: data.name || poultryName || "Poulailler",
          location: data.location || "",
          animalCount: data.animalCount || 0,
        });
      }
    } catch (e) {
      console.warn("[API] getPoultryById:", e?.message);
    }
    try {
      const deviceRes = await getDeviceByPoulailler(poultryId);
      if (
        deviceRes?.success &&
        deviceRes.data?.macAddress &&
        isMountedRef.current
      ) {
        setMacAddress(deviceRes.data.macAddress);
        macAddressRef.current = deviceRes.data.macAddress; // ✅ sync ref
      }
    } catch (e) {
      console.warn("[API] getDeviceByPoulailler:", e?.message);
    }
    await fetchAlerts();
  }, [poultryId, poultryName, fetchAlerts]);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ Fonction centrale : envoie ON ou OFF au fan via MQTT (mode manual)
  // ─────────────────────────────────────────────────────────────────────────
  const sendFanCommand = useCallback((on) => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected || !mac) {
      console.warn("[AUTO-FAN] MQTT non connecté ou mac inconnue");
      return;
    }
    // ✅ Évite d'envoyer la même commande deux fois de suite
    if (lastFanAutoCmd.current === on) return;
    lastFanAutoCmd.current = on;

    const payload = JSON.stringify({ on, mode: "manual" });
    console.log(`[AUTO-FAN] Envoi commande fan → on:${on}`);
    client.publish(`poulailler/${mac}/cmd/fan`, payload, { qos: 1 });

    // Met à jour l'état UI
    if (isMountedRef.current) {
      setActuators((prev) => ({ ...prev, fan: on }));
    }
  }, []);

  // ── MQTT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!poultryId || !macAddress) return;
    let client;
    try {
      client = mqtt.connect(process.env.EXPO_PUBLIC_MQTT_BROKER, {
        username: process.env.EXPO_PUBLIC_MQTT_USER,
        password: process.env.EXPO_PUBLIC_MQTT_PASS,
        reconnectPeriod: 5000,
        keepalive: 60,
        connectTimeout: 10000,
        clientId: "mobile_" + macAddress + "_" + Date.now(),
        rejectUnauthorized: false,
      });
    } catch (initErr) {
      console.error("[MQTT] init:", initErr?.message);
      return;
    }

    mqttClientRef.current = client;

    client.on("connect", () => {
      if (!isMountedRef.current) return;
      setIsConnected(true);
      client.subscribe(`poulailler/${macAddress}/measures`);
      client.subscribe(`poulailler/${macAddress}/status`);
    });

    client.on("message", (topic, message) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(message.toString());

        // ── /measures ──────────────────────────────────────────────────────
        if (topic.endsWith("/measures")) {
          setSensors((prev) => {
            const updated = prev.map((sensor) => {
              const raw = data[sensor.key];
              if (raw === undefined || raw === null) return sensor;
              const numVal = Number(raw);
              if (isNaN(numVal)) return sensor;
              return {
                ...sensor,
                value: numVal.toFixed(1),
                status: calculateSensorStatus(
                  sensor.key,
                  numVal,
                  thresholdsRef.current,
                ),
              };
            });

            // ✅ LOGIQUE AUTO : si fanAuto activé → décision immédiate
            if (fanAutoRef.current && thresholdsRef.current) {
              const fanShouldBeOn = shouldFanBeOn(
                updated,
                thresholdsRef.current,
              );
              console.log(
                `[AUTO-FAN] Mode AUTO actif → fan devrait être: ${fanShouldBeOn ? "ON" : "OFF"}`,
              );
              // sendFanCommand est stable grâce à useCallback
              // On ne peut pas l'appeler directement ici (closure)
              // → On utilise un événement custom via ref
              autoFanDecisionRef.current = fanShouldBeOn;
              triggerAutoFanRef.current?.();
            }

            return updated;
          });
        }

        // ── /status ────────────────────────────────────────────────────────
        if (topic.endsWith("/status")) {
          setActuators((prev) => ({
            ...prev,
            // ✅ En mode AUTO app, on ignore fan/fanAuto venant de l'ESP32
            fan: fanAutoRef.current ? prev.fan : (data.fanOn ?? prev.fan),
            lamp: data.lampOn ?? prev.lamp,
            fanAuto: prev.fanAuto, // ← on garde l'état de l'app, pas celui de l'ESP32
            lampAuto: data.lampAuto ?? prev.lampAuto,
            door: data.doorOpen ?? prev.door,
            doorState: data.doorState ?? prev.doorState,
            doorMoving:
              data.doorState === "OPENING" || data.doorState === "CLOSING",
          }));
          setPumpData({
            pumpOn: data.pumpOn ?? false,
            pumpAuto: data.pumpAuto ?? false,
          });
          if (data.doorAuto !== undefined)
            setDoorMode(data.doorAuto ? "horaire" : "manuel");
        }
      } catch (e) {
        console.error("[MQTT] parse error:", e?.message);
      }
    });

    client.on("reconnect", () => console.log("[MQTT] reconnexion..."));
    client.on("disconnect", () => {
      if (isMountedRef.current) setIsConnected(false);
    });
    client.on("offline", () => {
      if (isMountedRef.current) setIsConnected(false);
    });
    client.on("error", (e) => console.error("[MQTT] erreur:", e?.message));

    return () => {
      if (client) {
        client.removeAllListeners();
        client.end(true);
      }
      mqttClientRef.current = null;
    };
  }, [macAddress]);

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ Refs pour déclencher sendFanCommand depuis le callback MQTT
  // ─────────────────────────────────────────────────────────────────────────
  const autoFanDecisionRef = useRef(null); // true/false : fan doit être ON ou OFF
  const triggerAutoFanRef = useRef(null); // fonction à appeler

  // On expose la fonction via ref pour qu'elle soit accessible dans MQTT
  useEffect(() => {
    triggerAutoFanRef.current = () => {
      if (autoFanDecisionRef.current !== null) {
        sendFanCommand(autoFanDecisionRef.current);
        autoFanDecisionRef.current = null;
      }
    };
  }, [sendFanCommand]);

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (!poultryId) {
      setLoading(false);
      return;
    }
    (async () => {
      await fetchThresholds();
      await fetchPoultryInfo();
      if (isMountedRef.current) setLoading(false);
    })();
  }, [poultryId]);

  // ── publishCommand (pour lamp, pump, door, config) ────────────────────────
  const publishCommand = useCallback((command, value) => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected) {
      console.warn("[MQTT] non connecté");
      return;
    }
    if (!mac) {
      console.warn("[MQTT] macAddress inconnue");
      return;
    }

    const base = `poulailler/${mac}`;

    if (command === "lamp" || command === "lampAuto") {
      const isAuto = command === "lampAuto" ? value : false;
      client.publish(
        `${base}/cmd/lamp`,
        JSON.stringify({
          on: isAuto ? false : Boolean(value),
          mode: isAuto ? "auto" : "manual",
        }),
        { qos: 1 },
      );
    } else if (command === "pump" || command === "pumpAuto") {
      const isAuto = command === "pumpAuto" ? value : false;
      client.publish(
        `${base}/cmd/pump`,
        JSON.stringify({
          on: isAuto ? false : Boolean(value),
          mode: isAuto ? "auto" : "manual",
        }),
        { qos: 1 },
      );
    } else if (command === "door") {
      const action =
        value === "stop" ? "stop" : value === true ? "open" : "close";
      client.publish(`${base}/cmd/door`, JSON.stringify({ action }), {
        qos: 1,
      });
    } else if (command === "config") {
      client.publish(`${base}/config`, JSON.stringify(value), { qos: 1 });
    }
  }, []);

  const toggleFanAuto = useCallback(async () => {
    const newAuto = !fanAutoRef.current;
    fanAutoRef.current = newAuto;
    lastFanAutoCmd.current = null;

    setActuators((prev) => ({ ...prev, fanAuto: newAuto }));

    // 1️⃣ Sauvegarder la préférence en DB via l'API
    try {
      await updatePoultry(poultryId, {
        actuatorStates: {
          ventilation: {
            mode: newAuto ? "auto" : "manual",
            status: newAuto ? "off" : actuators.fan, // garde l'état actuel si manuel
          },
        },
      });
    } catch (e) {
      console.warn("[API] Erreur sauvegarde mode ventilateur:", e?.message);
    }

    // 2️⃣ Gérer le MQTT en temps réel
    if (newAuto) {
      console.log("[AUTO-FAN] Mode AUTO activé");
      setSensors((currentSensors) => {
        if (thresholdsRef.current) {
          const fanShouldBeOn = shouldFanBeOn(
            currentSensors,
            thresholdsRef.current,
          );
          sendFanCommand(fanShouldBeOn);
        }
        return currentSensors;
      });
    } else {
      console.log("[AUTO-FAN] Mode MANUEL activé → fan OFF");
      sendFanCommand(false);
    }
  }, [sendFanCommand, poultryId, actuators.fan]);
  // ✅ Commande manuelle du fan (seulement si mode manuel)
  const setFan = useCallback(
    async (v) => {
      if (fanAutoRef.current) {
        console.warn("[setFan] Mode AUTO actif, commande manuelle ignorée");
        return;
      }
      sendFanCommand(v);
      try {
        await createActuatorAlert(poultryId, "fan", v);
        await fetchAlerts();
      } catch (e) {
        console.warn("[setFan]", e?.message);
      }
    },
    [sendFanCommand, poultryId, fetchAlerts],
  );

  const toggleLampAuto = () => {
    const v = !actuators.lampAuto;
    publishCommand("lampAuto", v);
    setActuators((p) => ({ ...p, lampAuto: v }));
  };

  const setLamp = async (v) => {
    publishCommand("lamp", v);
    setActuators((p) => ({ ...p, lamp: v }));
    try {
      await createActuatorAlert(poultryId, "lamp", v);
      await fetchAlerts();
    } catch (e) {
      console.warn("[setLamp]", e?.message);
    }
  };

  const setPump = async (v) => {
    publishCommand("pump", v);
    setPumpData((p) => ({ ...p, pumpOn: v }));
    try {
      await createActuatorAlert(poultryId, "pump", v);
      await fetchAlerts();
    } catch (e) {
      console.warn("[setPump]", e?.message);
    }
  };

  const togglePumpAuto = () => {
    const v = !pumpData.pumpAuto;
    publishCommand("pumpAuto", v);
    setPumpData((p) => ({ ...p, pumpAuto: v }));
  };

  const toggleDoor = async (v) => {
    if (v === actuators.door && !actuators.doorMoving) return;
    publishCommand("door", v);
    setActuators((p) => ({ ...p, door: v, doorMoving: true }));
    try {
      await createActuatorAlert(poultryId, "door", v);
      await fetchAlerts();
    } catch (e) {
      console.warn("[toggleDoor]", e?.message);
    }
  };

  const stopDoor = useCallback(async () => {
    publishCommand("door", "stop");
    setActuators((p) => ({ ...p, doorMoving: false }));
  }, [publishCommand]);

  const markAllRead = useCallback(async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setAlertCount(0);
    try {
      await markAllAlertsAsRead(poultryId);
    } catch (e) {
      console.warn("[API] markAllRead:", e?.message);
    } finally {
      await fetchAlerts();
    }
  }, [poultryId, fetchAlerts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPoultryInfo(), fetchThresholds(), fetchAlerts()]);
    if (isMountedRef.current) setRefreshing(false);
  }, [fetchPoultryInfo, fetchThresholds, fetchAlerts]);

  return {
    loading,
    refreshing,
    isConnected,
    alertCount,
    alerts,
    thresholds: buildThresholdsForDisplay(thresholds),
    sensors,
    poultryInfo,
    actuators,
    pumpData,
    macAddress,
    doorMode,
    setDoorMode,
    doorSchedule,
    setDoorSchedule,
    pulseAnim,
    toggleFanAuto, // ✅ nouvelle logique AUTO
    toggleLampAuto,
    setFan, // ✅ bloqué si mode AUTO
    setLamp,
    setPump,
    togglePumpAuto,
    toggleDoor,
    stopDoor,
    markAllRead,
    onRefresh,
    feeder: undefined,
    setFeeder: () => {},
    distributeFood: () => {},
    addSchedule: () => {},
    removeSchedule: () => {},
    updateSchedule: () => {},
  };
}
