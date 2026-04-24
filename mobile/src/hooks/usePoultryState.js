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
  getDeviceByPoulailler, // ✅ NOUVEAU — récupère le device (macAddress) lié au poulailler
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
  // ✅ key = "waterLevel" — correspond exactement au champ publié par l'ESP32
  {
    name: "Niveau eau",
    value: "--",
    unit: "%",
    status: "normal",
    icon: "water",
    key: "waterLevel",
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
  const isMountedRef = useRef(true);

  // ✅ CLE DU FIX : macAddress séparée du poultryId
  // - poultryId  → utilisé UNIQUEMENT pour les appels API REST
  // - macAddress → utilisé UNIQUEMENT pour construire les topics MQTT
  // L'ESP32 publie sur poulailler/{MAC}/... pas poulailler/{mongoId}/...
  const [macAddress, setMacAddress] = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────────
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
    door: false, // true = OPEN ou OPENING
    doorState: "UNKNOWN", // état riche : "OPEN","CLOSED","OPENING","CLOSING","BLOCKED"
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

  // ✅ FIX PRINCIPAL — fetchPoultryInfo récupère aussi la macAddress du device associé
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

    // ✅ Récupère le device lié pour obtenir la macAddress
    // Exemple de réponse attendue : { success: true, data: { macAddress: "142B2FC7D704", ... } }
    try {
      const deviceRes = await getDeviceByPoulailler(poultryId);
      if (
        deviceRes?.success &&
        deviceRes.data?.macAddress &&
        isMountedRef.current
      ) {
        const mac = deviceRes.data.macAddress; // ex: "142B2FC7D704"
        console.log("[DEVICE] macAddress récupérée:", mac);
        setMacAddress(mac);
      } else {
        console.warn("[DEVICE] Aucun device associé ou macAddress manquante");
      }
    } catch (e) {
      console.warn("[API] getDeviceByPoulailler:", e?.message);
    }

    await fetchAlerts();
  }, [poultryId, poultryName, fetchAlerts]);

  // ── MQTT — se connecte UNIQUEMENT quand macAddress est disponible ─────────
  useEffect(() => {
    if (!poultryId || !macAddress) return; // ✅ attend la MAC avant de connecter

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
      // ✅ Topics construits avec la macAddress — correspondent exactement à l'ESP32
      client.subscribe(`poulailler/${macAddress}/measures`);
      client.subscribe(`poulailler/${macAddress}/status`);
      console.log(
        `[MQTT] Souscrit à poulailler/${macAddress}/measures & /status`,
      );
    });

    client.on("message", (topic, message) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(message.toString());

        // ── Mesures capteurs ────────────────────────────────────────────────
        if (topic.endsWith("/measures")) {
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

        // ── État actionneurs ────────────────────────────────────────────────
        // L'ESP32 publie : fanOn, lampOn, pumpOn, doorOpen, doorState,
        //                  fanAuto, lampAuto, pumpAuto, doorAuto
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

          if (data.doorAuto !== undefined) {
            setDoorMode(data.doorAuto ? "horaire" : "manuel");
          }
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
    client.on("error", (e) => {
      console.error("[MQTT] erreur:", e?.message);
      if (isMountedRef.current) setIsConnected(false);
    });

    return () => {
      if (client) {
        client.removeAllListeners();
        client.end(true);
      }
      mqttClientRef.current = null;
    };
  }, [macAddress]); // ✅ se (re)connecte quand la MAC change

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (!poultryId) {
      setLoading(false);
      return;
    }
    (async () => {
      await fetchThresholds();
      await fetchPoultryInfo(); // ← récupère aussi la macAddress
      if (isMountedRef.current) setLoading(false);
    })();
  }, [poultryId]);

  // ── Publish ───────────────────────────────────────────────────────────────
  // ✅ Utilise macAddress pour les topics — pas poultryId
  const publishCommand = useCallback(
    (command, value) => {
      const client = mqttClientRef.current;
      if (!client?.connected) {
        console.warn("[MQTT] publishCommand ignoré — non connecté");
        return;
      }
      if (!macAddress) {
        console.warn("[MQTT] publishCommand ignoré — macAddress inconnue");
        return;
      }

      const base = `poulailler/${macAddress}`;

      if (command === "fan" || command === "fanAuto") {
        // ESP32 attend : { on: bool, mode: "auto"|"manual" }
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
        // ESP32 attend : { action: "open"|"close"|"stop" }
        let action;
        if (value === "stop") action = "stop";
        else if (value === true) action = "open";
        else action = "close";
        client.publish(`${base}/cmd/door`, JSON.stringify({ action }), {
          qos: 1,
        });
      } else if (command === "config") {
        client.publish(`${base}/config`, JSON.stringify(value), { qos: 1 });
      }
    },
    [macAddress],
  );

  // ── Publish planning porte ────────────────────────────────────────────────
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

  // ── Publish heure courante → ESP32 ───────────────────────────────────────
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

  // ── Mark all read ─────────────────────────────────────────────────────────
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

  // ── Refresh ───────────────────────────────────────────────────────────────
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
    thresholds,
    sensors,
    poultryInfo,
    actuators,
    pumpData,
    macAddress, // ✅ exposée si besoin d'affichage debug
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
  };
}
