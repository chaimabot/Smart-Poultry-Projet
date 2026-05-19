// hooks/usePoultryState.js

import { useState, useEffect, useCallback, useRef } from "react";
import { Animated } from "react-native";
import mqtt from "mqtt";
import {
  getPoultryById,
  getAlerts,
  markAllAlertsAsRead,
  getThresholds,
  getDeviceByPoulailler,
  controlActuator,
} from "../services/poultry";
import { controlLamp } from "../services/lampeService";
import { controlPump } from "../services/pompeService";
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

// ── Mapping seuils ────────────────────────────────────────────────────────────
const THRESHOLD_MAP = {
  temperature: { min: "temperatureMin", max: "temperatureMax" },
  humidity: { min: "humidityMin", max: "humidityMax" },
  airQualityPercent: { min: "airQualityMin", max: null },
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

  if (max !== null && numVal > max)
    return key === "temperature" ? "danger_hot" : "danger";
  if (min !== null && numVal < min)
    return key === "temperature" ? "danger_cold" : "danger";

  if (max !== null && numVal > max - Math.abs(max) * 0.1) return "warn";
  if (min !== null && numVal < min + Math.abs(min) * 0.1) return "warn";

  return "normal";
}

// ── Seuils pour l'affichage ───────────────────────────────────────────────────
export function buildThresholdsForDisplay(dbThresholds) {
  if (!dbThresholds) return {};
  const result = {};

  for (const key of Object.keys(THRESHOLD_MAP)) {
    const map = THRESHOLD_MAP[key];
    const entry = {};

    if (map.max && dbThresholds[map.max] != null)
      entry.max = Number(dbThresholds[map.max]);
    if (map.min && dbThresholds[map.min] != null)
      entry.min = Number(dbThresholds[map.min]);

    if (Object.keys(entry).length > 0) result[key] = entry;
  }

  return result;
}

// ── Pré-remplir sensors depuis lastMonitoring ─────────────────────────────────
function applyLastMonitoringToSensors(prev, lastMonitoring, thresholds) {
  if (!lastMonitoring) return prev;
  return prev.map((sensor) => {
    const raw = lastMonitoring[sensor.key];
    if (raw === undefined || raw === null) return sensor;
    const numVal = Number(raw);
    if (isNaN(numVal)) return sensor;
    return {
      ...sensor,
      value: numVal.toFixed(1),
      status: thresholds
        ? calculateSensorStatus(sensor.key, numVal, thresholds)
        : sensor.status,
    };
  });
}

// ── Durée sans données avant "Hors ligne" ─────────────────────────────────────
const DATA_TIMEOUT_MS = 100_000; // ~1.6 minutes

// ─────────────────────────────────────────────────────────────────────────────
// HOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function usePoultryState({ poultryId, poultryName }) {
  const mqttClientRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef(null);

  const rawThresholdsRef = useRef(null);
  const thresholdsRef = useRef(null);
  const fanAutoRef = useRef(false);
  const lampAutoRef = useRef(false);
  const pumpAutoRef = useRef(false);
  const macAddressRef = useRef(null);
  const dataTimeoutRef = useRef(null);

  const [macAddress, setMacAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  // ── Cleanup au démontage ──────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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

  // ── resetDataTimeout ──────────────────────────────────────────────────────
  const resetDataTimeout = useCallback((remainingMs = DATA_TIMEOUT_MS) => {
    if (!isMountedRef.current) return;
    setIsConnected(true);
    if (dataTimeoutRef.current) clearTimeout(dataTimeoutRef.current);
    dataTimeoutRef.current = setTimeout(
      () => {
        if (isMountedRef.current) {
          console.log("[ESP32] Aucune donnée reçue → Hors ligne");
          setIsConnected(false);
        }
      },
      Math.max(remainingMs, 5000),
    );
  }, []);

  // ── Fetch thresholds ──────────────────────────────────────────────────────
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

  // ── Fetch alerts ──────────────────────────────────────────────────────────
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

  // ── Fetch poultry info ────────────────────────────────────────────────────
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

        //   Récupérer les raisons AUTO depuis le backend
        setFanAutoReason(
          data?.actuatorStates?.ventilation?.lastAutoReason || "",
        );
        setLampAutoReason(data?.actuatorStates?.lamp?.lastAutoReason || "");
        setPumpAutoReason(data?.actuatorStates?.pump?.lastAutoReason || "");

        setPumpData({
          pumpAuto: isPumpAuto,
          pumpOn: data?.actuatorStates?.pump?.status === "on",
        });

        const savedDoorMode = data?.actuatorStates?.door?.mode;
        if (savedDoorMode) {
          setDoorMode(savedDoorMode === "auto" ? "horaire" : "manuel");
        }

        //   Pré-remplir capteurs depuis lastMonitoring si frais
        const lm = data?.lastMonitoring;
        const t = rawThresholdsRef.current || data?.thresholds;

        if (lm?.timestamp) {
          const age = Date.now() - new Date(lm.timestamp).getTime();
          const isFresh = age < DATA_TIMEOUT_MS;

          if (isFresh) {
            resetDataTimeout(DATA_TIMEOUT_MS - age);
            setSensors((prev) => applyLastMonitoringToSensors(prev, lm, t));
          }
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
        const mac = deviceRes.data.macAddress.toUpperCase();
        setMacAddress(mac);
        macAddressRef.current = mac;
        console.log("[MQTT] MAC résolue :", mac);
      } else {
        console.warn("[MQTT] ⚠️ Aucune MAC trouvée pour ce poulailler");
      }
    } catch (e) {
      console.warn("[API] getDeviceByPoulailler:", e?.message);
    }

    await fetchAlerts();
  }, [poultryId, poultryName, fetchAlerts, resetDataTimeout]);

  //   NOUVEAU : Polling régulier des infos (15s)
  // Le backend décide AUTO → on rafraîchit pour voir les changements
  useEffect(() => {
    if (!poultryId) return;

    const interval = setInterval(() => {
      if (!isMountedRef.current) return;
      fetchPoultryInfo();
    }, 15000);

    return () => clearInterval(interval);
  }, [poultryId, fetchPoultryInfo]);

  // ── Polling lastMonitoring quand hors ligne ───────────────────────────────
  useEffect(() => {
    if (isConnected) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        console.log("[POLL] Arrêt — MQTT actif");
      }
      return;
    }

    if (!poultryId) return;

    const checkLastMonitoring = async () => {
      if (!isMountedRef.current) return;
      try {
        const res = await getPoultryById(poultryId);
        const data = res?.data;
        if (!data || !isMountedRef.current) return;

        const lastTs = data?.lastMonitoring?.timestamp;
        if (!lastTs) return;

        const age = Date.now() - new Date(lastTs).getTime();
        const isFresh = age < DATA_TIMEOUT_MS;

        if (isFresh) {
          console.log(
            `[POLL] ESP32 détecté — données âgées de ${Math.round(age / 1000)}s`,
          );

          resetDataTimeout(DATA_TIMEOUT_MS - age);

          const t = rawThresholdsRef.current || data?.thresholds;
          setSensors((prev) =>
            applyLastMonitoringToSensors(prev, data.lastMonitoring, t),
          );
        }
      } catch (e) {
        // silencieux
      }
    };

    checkLastMonitoring();
    pollIntervalRef.current = setInterval(checkLastMonitoring, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isConnected, poultryId, resetDataTimeout]);

  // ── MQTT (uniquement pour affichage temps réel) ───────────────────────────
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
      console.log("[MQTT] Connecté — souscrit à :", macAddress);
    });

    client.on("offline", () => {
      console.log("[MQTT] Broker offline — DATA_TIMEOUT actif");
    });

    client.on("message", (topic, message) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(message.toString());

        if (topic.endsWith("/measures") || topic.endsWith("/status")) {
          resetDataTimeout();
        }

        // ── MESURES (affichage uniquement) ─────────────────────────────
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
                status: calculateSensorStatus(
                  sensor.key,
                  numVal,
                  thresholdsRef.current,
                ),
              };
            }),
          );

          //   Rafraîchir les infos backend après réception
          // (pour récupérer les nouvelles raisons AUTO)
          setTimeout(() => {
            if (isMountedRef.current) fetchPoultryInfo();
          }, 1500);
        }

        // ── STATUS actionneurs ─────────────────────────────────────────
        if (topic.endsWith("/status")) {
          setActuators((prev) => ({
            ...prev,
            fan: data.fanOn ?? prev.fan,
            lamp: data.lampOn ?? prev.lamp,

            // Porte: l'ESP32 peut envoyer soit doorOpen (bool), soit doorState (OPEN/CLOSED/...),
            // soit un autre champ. On dérive toujours `door` (bool) à partir de doorState si présent.
            door:
              data.doorOpen ??
              (data.doorState === "OPEN" ||
              data.doorState === "OPENING" ||
              data.doorState === "open" ||
              data.doorState === "ouvert"
                ? true
                : data.doorState === "CLOSED" ||
                    data.doorState === "CLOSING" ||
                    data.doorState === "closed" ||
                    data.doorState === "ferme"
                  ? false
                  : prev.door),

            doorState: data.doorState ?? prev.doorState,

            // doorMoving: si l'ESP32 n'envoie pas doorState, on déduit aussi depuis doorOpen.
            doorMoving:
              data.doorState === "OPENING" ||
              data.doorState === "CLOSING" ||
              data.doorOpen === "OPENING" ||
              data.doorOpen === "CLOSING",

            // debug utile: si doorState est présent mais door reste à false, on verra ici.
          }));

          setPumpData((prev) => ({
            pumpOn: data.pumpOn ?? prev.pumpOn,
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
    };
  }, [macAddress, resetDataTimeout, fetchPoultryInfo]);

  // ── Init ──────────────────────────────────────────────────────────────────
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

  // hooks/usePoultryState.js

  // ── Toggle AUTO pompe ─────────────────────────────────────────────────────
  const togglePumpAuto = useCallback(async () => {
    const newAuto = !pumpAutoRef.current;
    pumpAutoRef.current = newAuto;

    // Mise à jour optimiste : forcer pumpOn=false si on passe en MANUEL
    setPumpData((prev) => ({
      pumpAuto: newAuto,
      pumpOn: newAuto ? prev.pumpOn : false, // Arrêter immédiatement dans l'UI
    }));

    console.log(
      "[togglePumpAuto] Changement mode:",
      newAuto ? "AUTO" : "MANUAL",
    );

    try {
      if (!newAuto) {
        // ✅ FIX : AUTO → MANUEL — envoyer arrêt physique (changeModeOnly=false + action=off)
        //         Le backend détecte isAutoToManual=true et publie { on: false, mode: "manual" } via MQTT
        await controlPump(poultryId, "manual", "off", false);
      } else {
        // MANUEL → AUTO — changer seulement le mode (le backend évalue ensuite)
        await controlPump(poultryId, "auto", null, true);
      }

      console.log("[togglePumpAuto] ✅ Mode changé avec succès");

      // Rafraîchir après 1.5s pour synchroniser avec le backend
      setTimeout(() => fetchPoultryInfo(), 1500);

      if (!newAuto) {
        setPumpAutoReason("");
      }
    } catch (e) {
      console.error("[API] mode pompe:", e?.message);
      // Rollback
      pumpAutoRef.current = !newAuto;
      setPumpData((prev) => ({ ...prev, pumpAuto: !newAuto }));
    }
  }, [poultryId, fetchPoultryInfo]);
  // ── Toggle AUTO ventilateur ───────────────────────────────────────────────
  const toggleFanAuto = useCallback(async () => {
    const newAuto = !fanAutoRef.current;
    fanAutoRef.current = newAuto;

    //    Mise à jour optimiste : si AUTO → MANUEL, forcer fan=false
    setActuators((prev) => ({
      ...prev,
      fanAuto: newAuto,
      fan: newAuto ? prev.fan : false, //    Arrêter en mode manuel
    }));

    try {
      await controlActuator(
        poultryId,
        "ventilation",
        "off",
        newAuto ? "auto" : "manual",
      );

      setTimeout(() => fetchPoultryInfo(), 1500);

      if (!newAuto) {
        setFanAutoReason("");
      }
    } catch (e) {
      console.error("[API] mode ventilateur:", e?.message);
      fanAutoRef.current = !newAuto;
      setActuators((prev) => ({ ...prev, fanAuto: !newAuto }));
    }
  }, [poultryId, fetchPoultryInfo]);

  // ── Toggle AUTO lampe ─────────────────────────────────────────────────────
  const toggleLampAuto = useCallback(async () => {
    const newAuto = !lampAutoRef.current;
    lampAutoRef.current = newAuto;

    //    Mise à jour optimiste
    setActuators((prev) => ({
      ...prev,
      lampAuto: newAuto,
      lamp: newAuto ? prev.lamp : false, //    Arrêter en mode manuel
    }));

    try {
      await controlLamp(poultryId, newAuto ? "auto" : "manual", "off");

      setTimeout(() => fetchPoultryInfo(), 1500);

      if (!newAuto) {
        setLampAutoReason("");
      }
    } catch (e) {
      console.error("[API] mode lampe:", e?.message);
      lampAutoRef.current = !newAuto;
      setActuators((prev) => ({ ...prev, lampAuto: !newAuto }));
    }
  }, [poultryId, fetchPoultryInfo]);

  // ── Manuel ventilateur ────────────────────────────────────────────────────
  const setFan = useCallback(
    async (v) => {
      if (fanAutoRef.current) return;
      try {
        await controlActuator(
          poultryId,
          "ventilation",
          v ? "on" : "off",
          "manual",
        );
        if (isMountedRef.current) setActuators((prev) => ({ ...prev, fan: v }));
        await fetchAlerts();
      } catch (e) {
        console.warn("[setFan]", e?.message);
      }
    },
    [poultryId, fetchAlerts],
  );

  // ── Manuel lampe ──────────────────────────────────────────────────────────
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
  const setPump = useCallback(
    async (v) => {
      if (pumpAutoRef.current) {
        console.warn(
          "[setPump] Mode AUTO actif - impossible de contrôler manuellement",
        );
        return;
      }

      console.log("[setPump] Envoi commande:", v ? "ON" : "OFF");

      try {
        //   Envoyer la commande avec mode "manual" explicite
        await controlPump(
          poultryId,
          "manual",
          v ? "on" : "off",
          false, //   changeModeOnly = false
        );

        console.log("[setPump]   Commande envoyée");
      } catch (e) {
        console.warn("[setPump]", e?.message);
      }
    },
    [poultryId],
  );

  // ═════════════════════════════════════════════════════════════════════════
  // PORTE
  // ═════════════════════════════════════════════════════════════════════════
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

  // ── markAllRead ───────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    try {
      await markAllAlertsAsRead(poultryId);
      await fetchAlerts();
    } catch (e) {
      console.warn("[markAllRead]", e?.message);
    }
  }, [poultryId, fetchAlerts]);

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
    toggleDoor,
    stopDoor,
    fanAutoReason,
    toggleLampAuto,
    setLamp,
    lampAutoReason,
    togglePumpAuto,
    setPump,
    pumpAutoReason,
    markAllRead,
    onRefresh,
  };
}
