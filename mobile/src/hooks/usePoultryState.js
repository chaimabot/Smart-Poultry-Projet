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
  updatePoultry,
  controlActuator,
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

// ── Mapping seuils ────────────────────────────────────────────────────────────
const THRESHOLD_MAP = {
  temperature: { min: "temperatureMin", max: "temperatureMax" },
  humidity: { min: "humidityMin", max: "humidityMax" },
  co2: { min: null, max: "co2Max" },
  nh3: { min: null, max: "nh3Max" },
  waterLevel: { min: "waterLevelMin", max: null },
};

// ── Statut capteur : danger = dépassement du seuil (pas de marge) ───────────
function calculateSensorStatus(key, value, dbThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !dbThresholds) return "normal";

  const map = THRESHOLD_MAP[key];
  if (!map) return "normal";

  const max = map.max ? Number(dbThresholds[map.max]) : null;
  const min = map.min ? Number(dbThresholds[map.min]) : null;

  if (max !== null && numVal > max) return "danger"; // Plus de warn → direct danger
  if (min !== null && numVal < min) return "danger";

  return "normal";
}

// ── Affichage seuils (danger = seuil max) ───────────────────────────────────
export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};
  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    if (map.max && dbThresholds[map.max] != null) {
      const maxVal = Number(dbThresholds[map.max]);
      result[key] = { danger: `> ${maxVal}` }; // Danger direct au seuil
    } else if (map.min && dbThresholds[map.min] != null) {
      const minVal = Number(dbThresholds[map.min]);
      result[key] = { danger: `< ${minVal}` };
    }
  }
  return result;
}

// ── AUTO ventilateur : ON dès que température > temperatureMax (30°C) ───────
function shouldFanBeOn(sensorsArray, thresholds) {
  if (!thresholds) {
    return { shouldBeOn: false, reason: "Seuils non configurés" };
  }

  const getValue = (key) => {
    const s = sensorsArray.find((s) => s.key === key);
    if (!s || s.value === "--") return null;
    return Number(s.value);
  };

  const temp = getValue("temperature");
  const co2 = getValue("co2");
  const tempMax =
    thresholds.temperatureMax != null
      ? Number(thresholds.temperatureMax)
      : null;
  const co2Max = thresholds.co2Max != null ? Number(thresholds.co2Max) : null;

  if (temp !== null && tempMax !== null && temp > tempMax) {
    const reason = `Température > ${tempMax}°C (${temp}°C)`;
    console.log(`[AUTO-FAN] ${reason} → Fan ON`);
    return { shouldBeOn: true, reason };
  }

  if (co2 !== null && co2Max !== null && co2 > co2Max) {
    const reason = `CO2 > ${co2Max} ppm (${co2} ppm)`;
    console.log(`[AUTO-FAN] ${reason} → Fan ON`);
    return { shouldBeOn: true, reason };
  }

  const reason = "Conditions normales";
  console.log(`[AUTO-FAN] ${reason} → Fan OFF`);
  return { shouldBeOn: false, reason };
}

// ── Hook principal ───────────────────────────────────────────────────────────
export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  const rawThresholdsRef = useRef(null);
  const thresholdsRef = useRef(null);
  const fanAutoRef = useRef(false);
  const lastFanAutoCmd = useRef(null);
  const macAddressRef = useRef(null);
  const autoFanDecisionRef = useRef(null);
  const triggerAutoFanRef = useRef(null);

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [sensors, setSensors] = useState(SENSOR_CONFIG);
  const [fanAutoReason, setFanAutoReason] = useState("");

  const [poultryInfo, setPoultryInfo] = useState({
    name: poultryName || "Poulailler Principal",
    location: "",
    animalCount: 0,
  });

  const [actuators, setActuators] = useState({
    fan: false,
    lamp: false,
    fanAuto: false,
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  // Mise à jour statut capteurs
  useEffect(() => {
    thresholdsRef.current = thresholds;
    if (!thresholds) return;
    setSensors((prev) =>
      prev.map((sensor) => ({
        ...sensor,
        status:
          sensor.value === "--"
            ? sensor.status
            : calculateSensorStatus(sensor.key, sensor.value, thresholds),
      })),
    );
  }, [thresholds]);

  const sendFanCommand = useCallback((on) => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected || !mac) return;
    if (lastFanAutoCmd.current === on) return;
    lastFanAutoCmd.current = on;

    client.publish(
      `poulailler/${mac}/cmd/fan`,
      JSON.stringify({ on, mode: "manual" }),
      { qos: 1 },
    );
    if (isMountedRef.current) {
      setActuators((prev) => ({ ...prev, fan: on }));
    }
  }, []);

  useEffect(() => {
    triggerAutoFanRef.current = () => {
      if (autoFanDecisionRef.current !== null) {
        sendFanCommand(autoFanDecisionRef.current);
        autoFanDecisionRef.current = null;
      }
    };
  }, [sendFanCommand]);

  const fetchThresholds = useCallback(async () => {
    if (!poultryId) return;
    try {
      const res = await getThresholds(poultryId);
      if (res?.success && isMountedRef.current) {
        rawThresholdsRef.current = res.data;
        setThresholds(res.data);
      }
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

        const savedMode = data?.actuatorStates?.ventilation?.mode;
        const savedStatus = data?.actuatorStates?.ventilation?.status;
        const isAuto = savedMode === "auto";

        fanAutoRef.current = isAuto;
        setActuators((prev) => ({
          ...prev,
          fanAuto: isAuto,
          fan: savedStatus === "on",
        }));
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
        macAddressRef.current = deviceRes.data.macAddress;
      }
    } catch (e) {
      console.warn("[API] getDeviceByPoulailler:", e?.message);
    }

    await fetchAlerts();
  }, [poultryId, poultryName, fetchAlerts]);

  // MQTT (inchangé sauf la partie measures)
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

            if (fanAutoRef.current && rawThresholdsRef.current) {
              const result = shouldFanBeOn(updated, rawThresholdsRef.current);
              autoFanDecisionRef.current = result.shouldBeOn;
              setFanAutoReason(result.reason); // Raison mise à jour
              triggerAutoFanRef.current?.();
            }

            return updated;
          });
        }

        if (topic.endsWith("/status")) {
          setActuators((prev) => ({
            ...prev,
            fan: fanAutoRef.current ? prev.fan : (data.fanOn ?? prev.fan),
            lamp: data.lampOn ?? prev.lamp,
            fanAuto: prev.fanAuto,
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

    // ... cleanup
    return () => {
      if (client) {
        client.removeAllListeners();
        client.end(true);
      }
      mqttClientRef.current = null;
    };
  }, [macAddress]);

  // Chargement initial
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

  // Toggle AUTO
  const toggleFanAuto = useCallback(async () => {
    const newAuto = !fanAutoRef.current;
    fanAutoRef.current = newAuto;
    lastFanAutoCmd.current = null;

    setActuators((prev) => ({ ...prev, fanAuto: newAuto }));

    try {
      // ✅ Utilise API actionneurs au lieu de updatePoultry générique
      await controlActuator(
        poultryId,
        "ventilation",
        actuators.fan,
        newAuto ? "auto" : "manual",
      );
      console.log(`[DB] Mode ventilateur → ${newAuto ? "auto" : "manual"}`);
    } catch (e) {
      console.error("[API] Erreur sauvegarde ventilateur:", e.message);
    }

    if (newAuto) {
      setSensors((current) => {
        if (rawThresholdsRef.current) {
          const result = shouldFanBeOn(current, rawThresholdsRef.current);
          setFanAutoReason(result.reason);
          sendFanCommand(result.shouldBeOn);
        } else {
          setFanAutoReason("Seuils non chargés");
          sendFanCommand(false);
        }
        return current;
      });
    } else {
      setFanAutoReason("");
      sendFanCommand(false);
    }
  }, [sendFanCommand, poultryId, actuators.fan]);

  const setFan = useCallback(
    async (v) => {
      if (fanAutoRef.current) return;
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

  // ... autres handlers (lamp, pump, door, etc.) inchangés

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
    toggleFanAuto,
    setFan,
    fanAutoReason, // Raison affichée
    onRefresh,
  };
}
