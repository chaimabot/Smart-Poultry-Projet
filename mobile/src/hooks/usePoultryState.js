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
} from "../services/poultry";

// ── Config ────────────────────────────────────────────────────────────────────

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
    key: "water_level",
  },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function calculateSensorStatus(key, value, currentThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !currentThresholds || !currentThresholds[key])
    return "normal";
  const t = currentThresholds[key];
  if (numVal >= t.danger) return "danger";
  if (numVal >= t.warn) return "warn";
  return "normal";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnimRef = useRef(new Animated.Value(1));
  const pulseAnim = pulseAnimRef.current;

  const ESP_POUAILLER_ID = "POULAILLER_001";

  // ── UI state ─────────────────────────────────────────────────────────────
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
    fanAuto: true,
    lampAuto: true,
    door: false,
    doorMoving: false,
  });

  const [feeder, setFeeder] = useState({
    schedules: [
      { id: 1, hour: 8, minute: 0, enabled: true },
      { id: 2, hour: 14, minute: 0, enabled: true },
      { id: 3, hour: 20, minute: 0, enabled: true },
    ],
    durationSec: 5,
    tempConditionEnabled: false,
    tempThreshold: 30,
    lastDistribution: null,
    isDistributing: false,
  });

  const [pumpData, setPumpData] = useState({
    pumpAuto: false,
    pumpOn: false,
  });

  const [doorMode, setDoorMode] = useState("horaire");
  const [doorSchedule, setDoorSchedule] = useState({
    openHour: 7,
    openMinute: 0,
    closeHour: 18,
    closeMinute: 0,
  });

  // ── Pulse animation ──────────────────────────────────────────────────────
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

  // ── API fetchers ──────────────────────────────────────────────────────────
  const fetchThresholds = useCallback(async () => {
    if (!poultryId) return;
    try {
      const res = await getThresholds(poultryId);
      if (res?.success) setThresholds(res.data);
    } catch (e) {
      console.warn("[API] seuils:", e.message);
    }
  }, [poultryId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await getAlerts(poultryId);
      if (res?.success && Array.isArray(res.data)) {
        setAlerts(res.data);
        setAlertCount(res.data.filter((a) => a.read === false).length);
      }
    } catch (e) {
      console.warn("[API] fetchAlerts:", e.message);
    }
  }, [poultryId]);

  const fetchPoultryInfo = useCallback(async () => {
    if (!poultryId) return;
    try {
      const data = await getPoultryById(poultryId);
      if (data) {
        setPoultryInfo({
          name: data.name || poultryName || "Poulailler",
          location: data.location || "",
          animalCount: data.animalCount || 0,
        });
      }
    } catch (e) {
      console.warn("[API] getPoultryById:", e.message);
    }
    await fetchAlerts();
  }, [poultryId, fetchAlerts]);

  // ── MQTT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!poultryId) {
      setLoading(false);
      return;
    }

    (async () => {
      await fetchThresholds();
      await fetchPoultryInfo();
      setLoading(false);
    })();

    const client = mqtt.connect(process.env.EXPO_PUBLIC_MQTT_BROKER, {
      username: process.env.EXPO_PUBLIC_MQTT_USER,
      password: process.env.EXPO_PUBLIC_MQTT_PASS,
      reconnectPeriod: 3000,
      keepalive: 60,
      clientId: "mobile_" + poultryId + "_" + Date.now(),
      rejectUnauthorized: true,
    });
    mqttClientRef.current = client;

    client.on("connect", () => {
      setIsConnected(true);
      client.subscribe("poulailler/+/measures");
      client.subscribe("poulailler/+/status");
      client.subscribe("poulailler/+/door/moving");
      client.subscribe("poulailler/+/feeder/status");
      client.subscribe("poulailler/+/pump/status");
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());

        if (topic.includes("/measures")) {
          setSensors((prev) =>
            prev.map((sensor) => {
              const raw = data[sensor.key];
              if (raw === undefined || raw === null) return sensor;
              const numVal = Number(raw);
              return {
                ...sensor,
                value: isNaN(numVal) ? "--" : numVal.toFixed(1),
                status: calculateSensorStatus(sensor.key, numVal, thresholds),
              };
            }),
          );
        }

        if (topic.includes("/status") && !topic.includes("feeder")) {
          setActuators((prev) => ({
            ...prev,
            fan: data.fan ?? prev.fan,
            lamp: data.lamp ?? prev.lamp,
            fanAuto: data.fanAuto ?? prev.fanAuto,
            lampAuto: data.lampAuto ?? prev.lampAuto,
            door: data.door ?? prev.door,
            doorMoving: data.doorMoving ?? prev.doorMoving ?? false,
          }));
        }

        if (topic.includes("/feeder/status") && data.lastDistribution) {
          setFeeder((prev) => ({
            ...prev,
            lastDistribution: new Date(data.lastDistribution),
          }));
        }

        if (topic.includes("/pump/status")) {
          setPumpData((prev) => ({
            ...prev,
            pumpAuto: data.mode === "auto" ? true : false,
            pumpOn: data.status === "on" ? true : false,
          }));
        }
      } catch (e) {
        console.error("[MQTT] parse error:", e.message);
      }
    });

    client.on("disconnect", () => setIsConnected(false));
    client.on("offline", () => setIsConnected(false));
    client.on("error", (e) => {
      console.error("[MQTT]", e.message);
      setIsConnected(false);
    });

    return () => {
      client.end(true);
      mqttClientRef.current = null;
    };
  }, [poultryId, fetchThresholds, fetchPoultryInfo]);

  // ── Publish ───────────────────────────────────────────────────────────────
  const publishCommand = useCallback((command, value) => {
    const client = mqttClientRef.current;
    if (!client?.connected) return;

    let topic = `poulailler/${ESP_POUAILLER_ID}/commands`;
    let payload = { command, value, timestamp: new Date().toISOString() };

    if (command === "fanAuto") {
      topic = `poulailler/${ESP_POUAILLER_ID}/commands/fan`;
      payload = { mode: value ? "auto" : "manual" };
    } else if (command === "fan") {
      topic = `poulailler/${ESP_POUAILLER_ID}/commands/fan`;
      payload = { mode: "manual", action: value ? "on" : "off" };
    } else if (command === "lampAuto") {
      topic = `poulailler/${ESP_POUAILLER_ID}/commands/lamp`;
      payload = { mode: value ? "auto" : "manual" };
    } else if (command === "lamp") {
      topic = `poulailler/${ESP_POUAILLER_ID}/commands/lamp`;
      payload = { mode: "manual", action: value ? "on" : "off" };
    } else if (command === "door") {
      topic = `poulailler/${ESP_POUAILLER_ID}/commands/door`;
      if (value === "stop") {
        payload = { action: "stop" };
      } else {
        payload = { action: value ? "open" : "close" };
      }
    }

    client.publish(topic, JSON.stringify(payload), { qos: 1 });
  }, []);

  // ── Feeder ────────────────────────────────────────────────────────────────
  const distributeFood = useCallback(
    (triggeredBy = "manual") => {
      const client = mqttClientRef.current;
      if (feeder.tempConditionEnabled) {
        const tempSensor = sensors.find((s) => s.key === "temperature");
        const currentTemp = parseFloat(tempSensor?.value);
        if (!isNaN(currentTemp) && currentTemp >= feeder.tempThreshold) return;
      }
      if (!client?.connected) return;

      const topic = `poulailler/${ESP_POUAILLER_ID}/commands/feeder`;
      const payload = {
        action: "distribute",
        durationSec: feeder.durationSec,
        triggeredBy,
        timestamp: new Date().toISOString(),
      };
      client.publish(topic, JSON.stringify(payload), { qos: 1 });
      setFeeder((prev) => ({
        ...prev,
        isDistributing: true,
        lastDistribution: new Date(),
      }));
      setTimeout(
        () => setFeeder((prev) => ({ ...prev, isDistributing: false })),
        feeder.durationSec * 1000,
      );
    },
    [feeder, sensors],
  );

  // ── Schedule checker ──────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      feeder.schedules.forEach((s) => {
        if (
          s.enabled &&
          now.getHours() === s.hour &&
          now.getMinutes() === s.minute &&
          now.getSeconds() < 30
        )
          distributeFood("schedule");
      });

    }, 30000);
    return () => clearInterval(interval);
  }, [
    feeder.schedules,
    distributeFood,
  ]);

  // ── Schedule helpers ──────────────────────────────────────────────────────
  const addSchedule = () =>
    setFeeder((p) => ({
      ...p,
      schedules: [
        ...p.schedules,
        { id: Date.now(), hour: 12, minute: 0, enabled: true },
      ],
    }));
  const removeSchedule = (id) =>
    setFeeder((p) => ({
      ...p,
      schedules: p.schedules.filter((s) => s.id !== id),
    }));
  const updateSchedule = (id, field, value) =>
    setFeeder((p) => ({
      ...p,
      schedules: p.schedules.map((s) =>
        s.id === id ? { ...s, [field]: value } : s,
      ),
    }));

  // ── Actuator handlers ─────────────────────────────────────────────────────
  const toggleFanAuto = () => {
    const v = !actuators.fanAuto;
    publishCommand("fanAuto", v);
    setActuators((p) => ({ ...p, fanAuto: v }));
  };
  const toggleLampAuto = () => {
    const v = !actuators.lampAuto;
    publishCommand("lampAuto", v);
    setActuators((p) => ({ ...p, lampAuto: v }));
  };

  const setFan = async (v) => {
    publishCommand("fan", v);
    setActuators((p) => ({ ...p, fan: v }));
    await createActuatorAlert(poultryId, "fan", v);
    await fetchAlerts();
  };
  const setLamp = async (v) => {
    publishCommand("lamp", v);
    setActuators((p) => ({ ...p, lamp: v }));
    await createActuatorAlert(poultryId, "lamp", v);
    await fetchAlerts();
  };
  const updateActuator = useCallback(
    async (actuator, mode, action) => {
      if (actuator !== "ventilation") return;

      const isAuto = mode === "auto";
      const isOn = action === "on";

      if (isAuto) {
        publishCommand("fanAuto", true);
        setActuators((prev) => ({
          ...prev,
          fanAuto: true,
          fan: false,
        }));
        return;
      }

      publishCommand("fanAuto", false);
      publishCommand("fan", isOn);
      setActuators((prev) => ({
        ...prev,
        fanAuto: false,
        fan: isOn,
      }));
      await createActuatorAlert(poultryId, "fan", isOn);
      await fetchAlerts();
    },
    [fetchAlerts, poultryId, publishCommand],
  );
  const toggleDoor = async (v) => {
    if (v === actuators.door) {
      console.log("Porte déjà dans cet état, skip");
      return;
    }
    // API backend pour log/tracking
    try {
      await fetch(
        `/api/poulaillers/${poultryId}/door/${v ? "open" : "close"}`,
        {
          method: "POST",
        },
      );
    } catch (e) {
      console.warn("[API DOOR] ", e);
    }
    console.log("[PORTE][HOOK] Commande porte", {
      poultryId,
      action: v ? "open" : "close",
      previousState: actuators.door ? "open" : "closed",
    });
    publishCommand("door", v);
    console.log("[PORTE][HOOK] MQTT publie", {
      poultryId,
      action: v ? "open" : "close",
    });
    setActuators((p) => ({ ...p, door: v, doorMoving: true }));
    await createActuatorAlert(poultryId, "door", v);
    await fetchAlerts();
  };

  const stopDoor = useCallback(async () => {
    console.log("[PORTE][HOOK] Commande stop porte", {
      poultryId,
    });
    publishCommand("door", "stop");
    setActuators((p) => ({ ...p, doorMoving: false }));
  }, [poultryId, publishCommand]);

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setAlertCount(0);
    try {
      await markAllAlertsAsRead(poultryId);
      await fetchAlerts();
    } catch (e) {
      console.warn("[API] markAllRead:", e.message);
      await fetchAlerts();
    }
  }, [poultryId, fetchAlerts]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchPoultryInfo(), fetchThresholds(), fetchAlerts()]);
    setRefreshing(false);
  }, [fetchPoultryInfo, fetchThresholds, fetchAlerts]);

  // ── Exposed ───────────────────────────────────────────────────────────────
  return {
    // state
    loading,
    refreshing,
    isConnected,
    alertCount,
    alerts,
    thresholds,
    sensors,
    poultryInfo,
    actuators,
    feeder,
    setFeeder,
    pumpData,
    doorMode,
    setDoorMode,
    doorSchedule,
    setDoorSchedule,
    pulseAnim,
    // handlers
    toggleFanAuto,
    toggleLampAuto,
    setFan,
    setLamp,
    toggleDoor,
    distributeFood,
    addSchedule,
    removeSchedule,
    updateSchedule,
    updateActuator,
    stopDoor,
    markAllRead,
    onRefresh,
  };
}
