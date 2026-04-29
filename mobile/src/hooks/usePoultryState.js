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

// ── Config capteurs ───────────────────────────────────────────────────────────

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

// ── Mapping clé capteur → champs BD ──────────────────────────────────────────
//
// La BD (poulailler.thresholds) stocke :
//   temperatureMin, temperatureMax, humidityMin, humidityMax,
//   co2Max, nh3Max, dustMax, waterLevelMin
//
const THRESHOLD_MAP = {
  temperature: { min: "temperatureMin", max: "temperatureMax" },
  humidity: { min: "humidityMin", max: "humidityMax" },
  co2: { min: null, max: "co2Max" },
  nh3: { min: null, max: "nh3Max" },
  dust: { min: null, max: "dustMax" },
  waterLevel: { min: "waterLevelMin", max: null },
};

// Marge au-delà du seuil max/min pour passer en "danger"
const DANGER_MARGINS = {
  temperature: 3,
  humidity: 10,
  co2: 500,
  nh3: 10,
  dust: 100,
  waterLevel: 10,
};

// ── Calcul du status ──────────────────────────────────────────────────────────
//
// dbThresholds = poulailler.thresholds tel que renvoyé par le backend :
//   { temperatureMin: 11, temperatureMax: 12, humidityMin: 30, humidityMax: 60, ... }
//
function calculateSensorStatus(key, value, dbThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !dbThresholds) return "normal";

  const map = THRESHOLD_MAP[key];
  if (!map) return "normal";

  const margin = DANGER_MARGINS[key] ?? 0;
  const max = map.max ? Number(dbThresholds[map.max]) : null;
  const min = map.min ? Number(dbThresholds[map.min]) : null;

  if (max !== null && !isNaN(max) && numVal > max) {
    return numVal > max + margin ? "danger" : "warn";
  }
  if (min !== null && !isNaN(min) && numVal < min) {
    return numVal < min - margin ? "danger" : "warn";
  }
  return "normal";
}

// ── Formate les seuils pour l'affichage dans OverviewTab ─────────────────────
// Retourne : { temperature: { warn: "max 12", danger: "max 15" }, ... }
export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};
  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    const margin = DANGER_MARGINS[key] ?? 0;
    if (map.max && dbThresholds[map.max] != null) {
      const maxVal = Number(dbThresholds[map.max]);
      result[key] = { warn: `max ${maxVal}`, danger: `max ${maxVal + margin}` };
    } else if (map.min && dbThresholds[map.min] != null) {
      const minVal = Number(dbThresholds[map.min]);
      result[key] = { warn: `min ${minVal}`, danger: `min ${minVal - margin}` };
    }
  }
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnimRef = useRef(new Animated.Value(1));
  const pulseAnim = pulseAnimRef.current;
  const isMountedRef = useRef(true);
  // Ref pour avoir la dernière valeur de thresholds dans les callbacks MQTT (évite stale closure)
  const thresholdsRef = useRef(null);

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(null); // valeur brute BD
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

  // ── FIX : quand thresholds change → mettre à jour le ref ET recalculer tous les capteurs
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

  // ── API fetchers ──────────────────────────────────────────────────────────

  const fetchThresholds = useCallback(async () => {
    if (!poultryId) return;
    try {
      const res = await getThresholds(poultryId);
      // res.data = { temperatureMin: 11, temperatureMax: 12, humidityMin: 30, ... }
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
      }
    } catch (e) {
      console.warn("[API] getDeviceByPoulailler:", e?.message);
    }
    await fetchAlerts();
  }, [poultryId, poultryName, fetchAlerts]);

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

        if (topic.endsWith("/measures")) {
          setSensors((prev) =>
            prev.map((sensor) => {
              const raw = data[sensor.key];
              if (raw === undefined || raw === null) return sensor;
              const numVal = Number(raw);
              if (isNaN(numVal)) return sensor;
              return {
                ...sensor,
                value: numVal.toFixed(1),
                // thresholdsRef.current = toujours la valeur à jour, pas de stale closure
                status: calculateSensorStatus(
                  sensor.key,
                  numVal,
                  thresholdsRef.current,
                ),
              };
            }),
          );
        }

        if (topic.endsWith("/status")) {
          setActuators((prev) => ({
            ...prev,
            fan: data.fanOn ?? prev.fan,
            lamp: data.lampOn ?? prev.lamp,
            fanAuto: data.fanAuto ?? prev.fanAuto,
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

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (!poultryId) {
      setLoading(false);
      return;
    }
    (async () => {
      await fetchThresholds(); // ← seuils chargés EN PREMIER
      await fetchPoultryInfo(); // ← info + macAddress → déclenche MQTT
      if (isMountedRef.current) setLoading(false);
    })();
  }, [poultryId]);

  // ── Publish ───────────────────────────────────────────────────────────────
  const publishCommand = useCallback(
    (command, value) => {
      const client = mqttClientRef.current;
      if (!client?.connected) {
        console.warn("[MQTT] non connecté");
        return;
      }
      if (!macAddress) {
        console.warn("[MQTT] macAddress inconnue");
        return;
      }
      const base = `poulailler/${macAddress}`;
      if (command === "fan" || command === "fanAuto") {
        const isAuto = command === "fanAuto" ? value : false;
        client.publish(
          `${base}/cmd/fan`,
          JSON.stringify({
            on: isAuto ? false : Boolean(value),
            mode: isAuto ? "auto" : "manual",
          }),
          { qos: 1 },
        );
      } else if (command === "lamp" || command === "lampAuto") {
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
    },
    [macAddress],
  );

  const publishDoorSchedule = useCallback(
    (sched, active) => {
      publishCommand("config", {
        doorSched: {
          openH: sched.openHour,
          openM: sched.openMinute,
          closeH: sched.closeHour,
          closeM: sched.closeMinute,
          active,
        },
      });
    },
    [publishCommand],
  );

  const publishCurrentTime = useCallback(() => {
    const now = new Date();
    publishCommand("config", {
      currentTime: { h: now.getHours(), m: now.getMinutes() },
    });
  }, [publishCommand]);

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
    try {
      await createActuatorAlert(poultryId, "fan", v);
      await fetchAlerts();
    } catch (e) {
      console.warn("[setFan]", e?.message);
    }
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
  const updateActuator = useCallback(
    async (actuator, mode, action) => {
      if (actuator !== "ventilation") return;
      const isAuto = mode === "auto";
      const isOn = action === "on";
      if (isAuto) {
        publishCommand("fanAuto", true);
        setActuators((prev) => ({ ...prev, fanAuto: true, fan: false }));
        return;
      }
      publishCommand("fanAuto", false);
      publishCommand("fan", isOn);
      setActuators((prev) => ({ ...prev, fanAuto: false, fan: isOn }));
      try {
        await createActuatorAlert(poultryId, "fan", isOn);
        await fetchAlerts();
      } catch (e) {
        console.warn("[updateActuator]", e?.message);
      }
    },
    [fetchAlerts, poultryId, publishCommand],
  );

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

  // ── Exposed ───────────────────────────────────────────────────────────────
  return {
    loading,
    refreshing,
    isConnected,
    alertCount,
    alerts,
    // thresholds formatés { temperature: { warn: "max 12", danger: "max 15" }, ... }
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
    toggleFanAuto,
    toggleLampAuto,
    setFan,
    setLamp,
    setPump,
    togglePumpAuto,
    toggleDoor,
    stopDoor,
    updateActuator,
    publishDoorSchedule,
    publishCurrentTime,
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
