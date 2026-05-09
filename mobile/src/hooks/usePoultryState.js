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
import { controlLamp } from "../services/lampeService";

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
    name: "Qualité de l'air",
    value: "--",
    unit: "%",
    status: "normal",
    icon: "air",
    key: "airQualityPercent",
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
  airQualityPercent: { min: null, max: "airQualityMin" },
  waterLevel: { min: "waterLevelMin", max: null },
};

// ── Statut capteur ────────────────────────────────────────────────────────────
// Retourne : "normal" | "warn" | "danger_hot" | "danger_cold"
function calculateSensorStatus(key, value, dbThresholds) {
  const numVal = Number(value);
  if (isNaN(numVal) || !dbThresholds) return "normal";

  const map = THRESHOLD_MAP[key];
  if (!map) return "normal";

  const max = map.max ? Number(dbThresholds[map.max]) : null;
  const min = map.min ? Number(dbThresholds[map.min]) : null;

  // ── Danger ───────────────────────────────────────────────────
  if (max !== null && numVal > max) return "danger_hot";
  if (min !== null && numVal < min) return "danger_cold";

  // ── Zone tampon 10% → warn ───────────────────────────────────
  // Ex: max=28 → warn si valeur > 25.2  (dans les 10% sous le max)
  // Ex: min=18 → warn si valeur < 19.8  (dans les 10% au-dessus du min)
  if (max !== null) {
    const warnMax = max - Math.abs(max) * 0.1;
    if (numVal > warnMax) return "warn";
  }
  if (min !== null) {
    const warnMin = min + Math.abs(min) * 0.1;
    if (numVal < warnMin) return "warn";
  }

  return "normal";
}

// ── Construction des seuils pour l'affichage dans OverviewTab ────────────────
// Format retourné : { temperature: { min: 18, max: 28 }, waterLevel: { min: 20 }, ... }
// OverviewTab utilise threshold.min / threshold.max pour afficher le seuil dépassé.
export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};

  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    const entry = {};

    if (map.max && dbThresholds[map.max] != null) {
      entry.max = Number(dbThresholds[map.max]);
    }
    if (map.min && dbThresholds[map.min] != null) {
      entry.min = Number(dbThresholds[map.min]);
    }

    if (Object.keys(entry).length > 0) {
      result[key] = entry;
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
  const air = getValue("airQualityPercent");

  const tempMax =
    thresholds.temperatureMax != null
      ? Number(thresholds.temperatureMax)
      : null;
  const co2Max = thresholds.co2Max != null ? Number(thresholds.co2Max) : null;
  const airMax =
    thresholds.airQualityMin != null ? Number(thresholds.airQualityMin) : null;

  if (temp !== null && tempMax !== null && temp > tempMax) {
    return {
      shouldBeOn: true,
      reason: `Température > ${tempMax}°C (${temp}°C)`,
    };
  }
  if (co2 !== null && co2Max !== null && co2 > co2Max) {
    return { shouldBeOn: true, reason: `CO2 > ${co2Max} ppm (${co2} ppm)` };
  }
  if (air !== null && airMax !== null && air > airMax) {
    return {
      shouldBeOn: true,
      reason: `Qualité de l'air > ${airMax}% (${air}%)`,
    };
  }

  return { shouldBeOn: false, reason: "Conditions normales" };
}

// ── Logique AUTO lampe chauffante ─────────────────────────────────────────────
function shouldLampBeOn(sensorsArray, thresholds) {
  if (!thresholds) {
    return { shouldBeOn: false, reason: "Seuils non configurés" };
  }

  const getValue = (key) => {
    const s = sensorsArray.find((s) => s.key === key);
    if (!s || s.value === "--") return null;
    return Number(s.value);
  };

  const temp = getValue("temperature");
  const tempMin =
    thresholds.temperatureMin != null
      ? Number(thresholds.temperatureMin)
      : null;

  if (temp !== null && tempMin !== null && temp < tempMin) {
    return {
      shouldBeOn: true,
      reason: `Température < ${tempMin}°C (${temp}°C)`,
    };
  }

  return { shouldBeOn: false, reason: "Conditions normales" };
}

// ── Logique AUTO pompe à eau ──────────────────────────────────────────────────
function shouldPumpBeOn(sensorsArray, thresholds) {
  if (!thresholds) {
    return { shouldBeOn: false, reason: "Seuils non configurés" };
  }

  const getValue = (key) => {
    const s = sensorsArray.find((s) => s.key === key);
    if (!s || s.value === "--") return null;
    return Number(s.value);
  };

  const water = getValue("waterLevel");
  const waterMin =
    thresholds.waterLevelMin != null ? Number(thresholds.waterLevelMin) : null;

  if (water !== null && waterMin !== null && water < waterMin) {
    return {
      shouldBeOn: true,
      reason: `Niveau d'eau < ${waterMin}% (${water}%)`,
    };
  }

  return { shouldBeOn: false, reason: "Niveau d'eau normal" };
}

// ── Durée sans données avant de passer "Hors ligne" (ms) ─────────────────────
const DATA_TIMEOUT_MS = 120_000;

// ── Hook principal ───────────────────────────────────────────────────────────
export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);

  const rawThresholdsRef = useRef(null);
  const thresholdsRef = useRef(null);
  const fanAutoRef = useRef(false);
  const lampAutoRef = useRef(false);
  const pumpAutoRef = useRef(false);
  const lastFanAutoCmd = useRef(null);
  const lastLampAutoCmd = useRef(null);
  const lastPumpAutoCmd = useRef(null);
  const macAddressRef = useRef(null);
  const autoFanDecisionRef = useRef(null);
  const triggerAutoFanRef = useRef(null);
  const autoLampDecisionRef = useRef(null);
  const triggerAutoLampRef = useRef(null);
  const autoPumpDecisionRef = useRef(null);
  const triggerAutoPumpRef = useRef(null);
  const dataTimeoutRef = useRef(null);

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [sensors, setSensors] = useState(SENSOR_CONFIG);
  const [fanAutoReason, setFanAutoReason] = useState("");
  const [lampAutoReason, setLampAutoReason] = useState("");
  const [pumpAutoReason, setPumpAutoReason] = useState("");

  const [poultryInfo, setPoultryInfo] = useState({
    name: poultryName || "Poulailler Principal",
    location: "",
    animalCount: 0,
  });

  const [actuators, setActuators] = useState({
    fan: false,
    lamp: false,
    fanAuto: false,
    lampAuto: false,
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

  // ── Recalcul statuts quand les seuils changent ────────────────────────────
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
  const resetDataTimeout = useCallback(() => {
    if (!isMountedRef.current) return;
    setIsConnected(true);
    if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    dataTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        console.log("[ESP32] Aucune donnée reçue depuis 2min → Hors ligne");
        setIsConnected(false);
      }
    }, DATA_TIMEOUT_MS);
  }, []);

  // ── Commande ventilateur via MQTT ─────────────────────────────────────────
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
    if (isMountedRef.current) setActuators((prev) => ({ ...prev, fan: on }));
  }, []);

  // ── Commande lampe via API REST (AUTO uniquement) ─────────────────────────
  const sendLampCommand = useCallback(
    async (on) => {
      if (!poultryId) return;
      if (!lampAutoRef.current) {
        console.log("[Lamp AUTO] ignoré — mode manuel actif");
        return;
      }
      if (lastLampAutoCmd.current === on) return;
      lastLampAutoCmd.current = on;
      try {
        await controlLamp(poultryId, "auto", on ? "on" : "off");
        if (isMountedRef.current)
          setActuators((prev) => ({ ...prev, lamp: on }));
        console.log(`[Lamp AUTO] Commande envoyée : ${on ? "ON" : "OFF"}`);
      } catch (error) {
        console.error("[Lamp AUTO] Erreur commande:", error);
      }
    },
    [poultryId],
  );

  // ── Commande pompe via MQTT ───────────────────────────────────────────────
  const sendPumpCommand = useCallback((on) => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected || !mac) return;
    if (lastPumpAutoCmd.current === on) return;
    lastPumpAutoCmd.current = on;
    client.publish(
      `poulailler/${mac}/cmd/pump`,
      JSON.stringify({ on, mode: pumpAutoRef.current ? "auto" : "manual" }),
      { qos: 1 },
    );
    if (isMountedRef.current) setPumpData((prev) => ({ ...prev, pumpOn: on }));
  }, []);

  useEffect(() => {
    triggerAutoFanRef.current = () => {
      if (autoFanDecisionRef.current !== null) {
        sendFanCommand(autoFanDecisionRef.current);
        autoFanDecisionRef.current = null;
      }
    };
  }, [sendFanCommand]);

  useEffect(() => {
    triggerAutoLampRef.current = () => {
      if (autoLampDecisionRef.current !== null) {
        sendLampCommand(autoLampDecisionRef.current);
        autoLampDecisionRef.current = null;
      }
    };
  }, [sendLampCommand]);

  useEffect(() => {
    triggerAutoPumpRef.current = () => {
      if (autoPumpDecisionRef.current !== null) {
        sendPumpCommand(autoPumpDecisionRef.current);
        autoPumpDecisionRef.current = null;
      }
    };
  }, [sendPumpCommand]);

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
      const res = await getPoultryById(poultryId);
      const data = res?.data;
      if (data && isMountedRef.current) {
        setPoultryInfo({
          name: data.name || poultryName || "Poulailler",
          location: data.location || "",
          animalCount: data.animalCount || 0,
        });

        const isFanAuto = data?.actuatorStates?.ventilation?.mode === "auto";
        const isLampAuto = data?.actuatorStates?.lamp?.mode === "auto";
        const isPumpAuto = data?.actuatorStates?.pump?.mode === "auto";

        fanAutoRef.current = isFanAuto;
        lampAutoRef.current = isLampAuto;
        pumpAutoRef.current = isPumpAuto;

        setActuators((prev) => ({
          ...prev,
          fanAuto: isFanAuto,
          fan: data?.actuatorStates?.ventilation?.status === "on",
          lampAuto: isLampAuto,
          lamp: data?.actuatorStates?.lamp?.status === "on",
        }));

        setPumpData({
          pumpAuto: isPumpAuto,
          pumpOn: data?.actuatorStates?.pump?.status === "on",
        });

        const savedDoorMode = data?.actuatorStates?.door?.mode;
        if (savedDoorMode) {
          setDoorMode(savedDoorMode === "auto" ? "horaire" : "manuel");
        }
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
      client.subscribe(`poulailler/${macAddress}/measures`);
      client.subscribe(`poulailler/${macAddress}/status`);
      console.log("[MQTT] Broker connecté — en attente de données ESP32...");
    });

    client.on("offline", () => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    });

    client.on("message", (topic, message) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(message.toString());

        if (topic.endsWith("/measures")) {
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

            // ── Décision AUTO ventilateur ──────────────────────────────────
            if (fanAutoRef.current && rawThresholdsRef.current) {
              const result = shouldFanBeOn(updated, rawThresholdsRef.current);
              autoFanDecisionRef.current = result.shouldBeOn;
              setFanAutoReason(result.reason);
              triggerAutoFanRef.current?.();
            }

            // ── Décision AUTO lampe ────────────────────────────────────────
            if (lampAutoRef.current && rawThresholdsRef.current) {
              const result = shouldLampBeOn(updated, rawThresholdsRef.current);
              autoLampDecisionRef.current = result.shouldBeOn;
              setLampAutoReason(result.reason);
              triggerAutoLampRef.current?.();
            }

            // ── Décision AUTO pompe ────────────────────────────────────────
            if (pumpAutoRef.current && rawThresholdsRef.current) {
              const result = shouldPumpBeOn(updated, rawThresholdsRef.current);
              autoPumpDecisionRef.current = result.shouldBeOn;
              setPumpAutoReason(result.reason);
              triggerAutoPumpRef.current?.();
            }

            return updated;
          });
        }

        if (topic.endsWith("/status")) {
          resetDataTimeout();

          setActuators((prev) => ({
            ...prev,
            fanAuto: fanAutoRef.current,
            fan: fanAutoRef.current ? prev.fan : (data.fanOn ?? prev.fan),
            lamp: lampAutoRef.current ? prev.lamp : (data.lampOn ?? prev.lamp),
            lampAuto: lampAutoRef.current,
            door: data.doorOpen ?? prev.door,
            doorState: data.doorState ?? prev.doorState,
            doorMoving:
              data.doorState === "OPENING" || data.doorState === "CLOSING",
          }));

          setPumpData((prev) => ({
            pumpOn: pumpAutoRef.current
              ? prev.pumpOn
              : (data.pumpOn ?? prev.pumpOn),
            pumpAuto: pumpAutoRef.current,
          }));
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

  // ── Toggle AUTO ventilateur ───────────────────────────────────────────────
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
      console.error("[API] Erreur sauvegarde mode ventilateur:", e?.message);
      fanAutoRef.current = !newAuto;
      setActuators((prev) => ({ ...prev, fanAuto: !newAuto }));
      return;
    }

    if (newAuto) {
      await fetchThresholds();
      setSensors((current) => {
        const t = rawThresholdsRef.current;
        if (t) {
          const result = shouldFanBeOn(current, t);
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

  // ── Toggle AUTO lampe ─────────────────────────────────────────────────────
  const toggleLampAuto = useCallback(async () => {
    const newAuto = !lampAutoRef.current;
    lampAutoRef.current = newAuto;
    lastLampAutoCmd.current = null;
    autoLampDecisionRef.current = null;
    setActuators((prev) => ({ ...prev, lampAuto: newAuto }));

    try {
      await controlLamp(poultryId, newAuto ? "auto" : "manual", "off");
    } catch (e) {
      console.error("[API] Erreur sauvegarde mode lampe:", e?.message);
      lampAutoRef.current = !newAuto;
      setActuators((prev) => ({ ...prev, lampAuto: !newAuto }));
      return;
    }

    if (newAuto) {
      await fetchThresholds();
      setSensors((current) => {
        const t = rawThresholdsRef.current;
        if (t) {
          const result = shouldLampBeOn(current, t);
          setLampAutoReason(result.reason);
          if (result.shouldBeOn) {
            sendLampCommand(true);
          } else {
            lastLampAutoCmd.current = false;
          }
        } else {
          setLampAutoReason("Seuils non chargés");
          lastLampAutoCmd.current = false;
        }
        return current;
      });
    } else {
      setLampAutoReason("");
    }
  }, [poultryId, sendLampCommand, fetchThresholds]);

  // ── Porte ─────────────────────────────────────────────────────────────────
  const toggleDoor = useCallback(async (action) => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected || !mac) return;
    client.publish(`poulailler/${mac}/cmd/door`, JSON.stringify({ action }), {
      qos: 1,
    });
  }, []);

  const stopDoor = useCallback(async () => {
    const client = mqttClientRef.current;
    const mac = macAddressRef.current;
    if (!client?.connected || !mac) return;
    client.publish(
      `poulailler/${mac}/cmd/door`,
      JSON.stringify({ action: "stop" }),
      { qos: 1 },
    );
  }, []);

  // ── Contrôle manuel ventilateur ───────────────────────────────────────────
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

  // ── Contrôle manuel lampe ─────────────────────────────────────────────────
  const setLamp = useCallback(
    async (v) => {
      if (lampAutoRef.current) return;
      try {
        await controlLamp(poultryId, "manual", v ? "on" : "off");
        if (isMountedRef.current)
          setActuators((prev) => ({ ...prev, lamp: v }));
        await fetchAlerts();
      } catch (e) {
        console.warn("[setLamp]", e?.message);
      }
    },
    [poultryId, fetchAlerts],
  );

  // ── Toggle AUTO pompe ─────────────────────────────────────────────────────
  const togglePumpAuto = useCallback(async () => {
    const newAuto = !pumpAutoRef.current;
    pumpAutoRef.current = newAuto;
    lastPumpAutoCmd.current = null;
    autoPumpDecisionRef.current = null;
    setPumpData((prev) => ({ ...prev, pumpAuto: newAuto }));

    try {
      await controlActuator(
        poultryId,
        "pump",
        "off",
        newAuto ? "auto" : "manual",
      );
    } catch (e) {
      console.error("[API] Erreur sauvegarde mode pompe:", e?.message);
      pumpAutoRef.current = !newAuto;
      setPumpData((prev) => ({ ...prev, pumpAuto: !newAuto }));
      return;
    }

    if (newAuto) {
      await fetchThresholds();
      setSensors((current) => {
        const t = rawThresholdsRef.current;
        if (t) {
          const result = shouldPumpBeOn(current, t);
          setPumpAutoReason(result.reason);
          sendPumpCommand(result.shouldBeOn);
        } else {
          setPumpAutoReason("Seuils non chargés");
          sendPumpCommand(false);
        }
        return current;
      });
    } else {
      setPumpAutoReason("");
      sendPumpCommand(false);
    }
  }, [poultryId, sendPumpCommand, fetchThresholds]);

  // ── Contrôle manuel pompe ─────────────────────────────────────────────────
  const setPump = useCallback(
    async (v) => {
      if (pumpAutoRef.current) return;
      sendPumpCommand(v);
      try {
        await controlActuator(poultryId, "pump", v ? "on" : "off", "manual");
        await fetchAlerts();
      } catch (e) {
        console.warn("[setPump]", e?.message);
      }
    },
    [sendPumpCommand, poultryId, fetchAlerts],
  );

  // ── Refresh ───────────────────────────────────────────────────────────────
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
    thresholds: buildThresholdsForDisplay(thresholds), // ✅ format { min, max } par capteur
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
    toggleDoor,
    stopDoor,
    fanAutoReason,
    toggleLampAuto,
    setLamp,
    lampAutoReason,
    togglePumpAuto,
    setPump,
    pumpAutoReason,
    onRefresh,
  };
}
