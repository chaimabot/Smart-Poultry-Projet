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

// ── Statut capteur ────────────────────────────────────────────────────────────
function calculateSensorStatus(key, value, dbThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !dbThresholds) return "normal";

  const map = THRESHOLD_MAP[key];
  if (!map) return "normal";

  const max = map.max ? Number(dbThresholds[map.max]) : null;
  const min = map.min ? Number(dbThresholds[map.min]) : null;

  if (max !== null && numVal > max) return "danger";
  if (min !== null && numVal < min) return "danger";

  return "normal";
}

export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};
  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    if (map.max && dbThresholds[map.max] != null) {
      result[key] = { danger: `> ${Number(dbThresholds[map.max])}` };
    } else if (map.min && dbThresholds[map.min] != null) {
      result[key] = { danger: `< ${Number(dbThresholds[map.min])}` };
    }
  }
  return result;
}

// ── Logique AUTO ventilateur ──────────────────────────────────────────────────
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
    return { shouldBeOn: true, reason };
  }

  if (co2 !== null && co2Max !== null && co2 > co2Max) {
    const reason = `CO2 > ${co2Max} ppm (${co2} ppm)`;
    return { shouldBeOn: true, reason };
  }

  return { shouldBeOn: false, reason: "Conditions normales" };
}

// ── Durée sans données avant de passer "Hors ligne" (ms) ─────────────────────
const DATA_TIMEOUT_MS = 15_000; // 15 secondes

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

  // ── Ref du timer "pas de données" ────────────────────────────────────────
  const dataTimeoutRef = useRef(null);

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // isConnected = true uniquement si on reçoit des données fraîches de l'ESP32
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
      // Nettoyer le timer au démontage
      if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    };
  }, []);

  // ── Animation pulse ───────────────────────────────────────────────────────
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

  // ── Réinitialise le timer "données ESP32" ─────────────────────────────────
  // Appelé à chaque message /measures ou /status reçu de l'ESP32.
  // Si aucun message n'arrive pendant DATA_TIMEOUT_MS, on passe hors ligne.
  const resetDataTimeout = useCallback(() => {
    if (!isMountedRef.current) return;

    // Marquer comme connecté dès réception d'un message
    setIsConnected(true);

    // Annuler l'ancien timer et en démarrer un nouveau
    if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    dataTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        console.log("[ESP32] Aucune donnée reçue depuis 15s → Hors ligne");
        setIsConnected(false);
      }
    }, DATA_TIMEOUT_MS);
  }, []);

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
        const isAuto = savedMode === "auto";

        fanAutoRef.current = isAuto;
        setActuators((prev) => ({
          ...prev,
          fanAuto: isAuto,
          fan: data?.actuatorStates?.ventilation?.status === "on",
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
      // NE PAS mettre isConnected=true ici.
      // On attend les vraies données de l'ESP32.
      client.subscribe(`poulailler/${macAddress}/measures`);
      client.subscribe(`poulailler/${macAddress}/status`);
      console.log("[MQTT] Broker connecté — en attente de données ESP32...");
    });

    // Broker déconnecté → hors ligne immédiatement
    client.on("offline", () => {
      if (!isMountedRef.current) return;
      console.log("[MQTT] Broker hors ligne → Hors ligne");
      setIsConnected(false);
      if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    });

    client.on("message", (topic, message) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(message.toString());

        if (topic.endsWith("/measures")) {
          // ✅ Données reçues de l'ESP32 → connecté + reset timer
          resetDataTimeout();

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
              setFanAutoReason(result.reason);
              triggerAutoFanRef.current?.();
            }

            return updated;
          });
        }

        if (topic.endsWith("/status")) {
          // ✅ Status reçu de l'ESP32 → connecté + reset timer
          resetDataTimeout();

          setActuators((prev) => ({
            ...prev,
            fanAuto: fanAutoRef.current,
            fan: fanAutoRef.current ? prev.fan : (data.fanOn ?? prev.fan),
            lamp: data.lampOn ?? prev.lamp,
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

          if (data.doorAuto !== undefined) {
            setDoorMode(data.doorAuto ? "horaire" : "manuel");
          }
        }
      } catch (e) {
        console.error("[MQTT] parse error:", e?.message);
      }
    });

    return () => {
      if (client) {
        client.removeAllListeners();
        client.end(true);
      }
      mqttClientRef.current = null;
      if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
      setIsConnected(false);
    };
  }, [macAddress, resetDataTimeout]);

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

  const toggleFanAuto = useCallback(async () => {
    const newAuto = !fanAutoRef.current;
    fanAutoRef.current = newAuto;
    lastFanAutoCmd.current = null;
    setActuators((prev) => ({ ...prev, fanAuto: newAuto }));

    try {
      await controlActuator(
        poultryId,
        "ventilation",
        "off",
        newAuto ? "auto" : "manual",
      );
    } catch (e) {
      console.error("[API] Erreur sauvegarde mode:", e?.message);
      fanAutoRef.current = !newAuto;
      setActuators((prev) => ({ ...prev, fanAuto: !newAuto }));
      return;
    }

    if (newAuto) {
      await fetchThresholds();
      setSensors((current) => {
        const freshThresholds = rawThresholdsRef.current;
        if (freshThresholds) {
          const result = shouldFanBeOn(current, freshThresholds);
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
  }, [poultryId, sendFanCommand, fetchThresholds]);

  const setFan = useCallback(
    async (v) => {
      if (fanAutoRef.current) return;
      sendFanCommand(v);
      try {
        await controlActuator(
          poultryId,
          "ventilation",
          v ? "on" : "off",
          "manual",
        );
        await fetchAlerts();
      } catch (e) {
        console.warn("[setFan]", e?.message);
      }
    },
    [sendFanCommand, poultryId, fetchAlerts],
  );

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
    fanAutoReason,
    onRefresh,
  };
}
