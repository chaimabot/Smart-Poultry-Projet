import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import mqtt from "mqtt";
import { getPoultryById, getAlerts } from "../../../services/poultry";

// ── Config ────────────────────────────────────────────────────────────────────

const BROKER_URL =
  "wss://372f445aface456abb82e44117d9d92b.s1.eu.hivemq.cloud:8884/mqtt";
const MQTT_USER = "backend2";
const MQTT_PASS = "Smartpoultry2026";

const SENSOR_THRESHOLDS = {
  temperature: { warn: 30, danger: 35 },
  humidity: { warn: 70, danger: 80 },
  co2: { warn: 1000, danger: 2000 },
  nh3: { warn: 20, danger: 35 },
  dust: { warn: 150, danger: 250 },
};

const SENSOR_CONFIG = [
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
    name: "Poussière",
    value: "--",
    unit: "µg/m³",
    status: "normal",
    icon: "grain",
    key: "dust",
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

const STATUS_COLORS = { normal: "#22C55E", warn: "#F59E0B", danger: "#EF4444" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateSensorStatus(key, value) {
  const numVal = Number(value);
  if (isNaN(numVal)) return "normal";
  const t = SENSOR_THRESHOLDS[key];
  if (!t) return "normal";
  if (numVal >= t.danger) return "danger";
  if (numVal >= t.warn) return "warn";
  return "normal";
}

function formatTime(date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// ── Écran principal ───────────────────────────────────────────────────────────

export default function PoultryDetailScreen({ route, navigation }) {
  const { poultryId, poultryName } = route?.params || {};
  const insets = useSafeAreaInsets();

  const mqttClientRef = useRef(null);
  const pulseAnimRef = useRef(new Animated.Value(1));
  const pulseAnim = pulseAnimRef.current;

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [poultryInfo, setPoultryInfo] = useState({
    name: poultryName || "Poulailler Principal",
    location: "",
    animalCount: 0,
  });
  const [sensors, setSensors] = useState(SENSOR_CONFIG);
  const [actuators, setActuators] = useState({
    fan: false,
    lamp: false,
    fanAuto: true,
    lampAuto: true,
    door: false,
  });

  // ── Feeder state ─────────────────────────────────────────────────────────
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

  // ── Door state ───────────────────────────────────────────────────────────
  const [doorMode, setDoorMode] = useState("horaire");
  const [doorSchedule, setDoorSchedule] = useState({
    openHour: 7,
    openMinute: 0,
    closeHour: 18,
    closeMinute: 0,
  });

  // ── Animation pulse ──────────────────────────────────────────────────────

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

  // ── Fetch infos API ──────────────────────────────────────────────────────

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
      console.warn("[API] getPoultryById error:", e.message);
    }
    try {
      const alertsData = await getAlerts(poultryId);
      if (alertsData?.success && Array.isArray(alertsData.data)) {
        setAlerts(alertsData.data);
        setAlertCount(alertsData.data.filter((a) => !a.read).length);
      }
    } catch (e) {
      console.warn("[API] getAlerts error:", e.message);
    }
  }, [poultryId]);

  // ── Connexion MQTT ───────────────────────────────────────────────────────

  const ESP_POUAILLER_ID = "POULAILLER_001";

  useEffect(() => {
    if (!poultryId) {
      setLoading(false);
      return;
    }

    fetchPoultryInfo();

    const client = mqtt.connect(BROKER_URL, {
      username: MQTT_USER,
      password: MQTT_PASS,
      reconnectPeriod: 3000,
      keepalive: 60,
      clientId: "mobile_" + poultryId + "_" + Date.now(),
      rejectUnauthorized: true,
    });

    mqttClientRef.current = client;

    client.on("connect", () => {
      setIsConnected(true);
      setLoading(false);
      client.subscribe("poulailler/+/measures", (e) => {
        if (e) console.error("[MQTT] sub measures:", e);
      });
      client.subscribe("poulailler/+/status", (e) => {
        if (e) console.error("[MQTT] sub status:", e);
      });
      client.subscribe("poulailler/+/feeder/status", (e) => {
        if (e) console.error("[MQTT] sub feeder/status:", e);
      });
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());

        if (topic.includes("/measures")) {
          setSensors((prev) => {
            const updated = prev.map((sensor) => {
              const raw = data[sensor.key];
              if (raw === undefined || raw === null) return sensor;
              const numVal = Number(raw);
              return {
                ...sensor,
                value: isNaN(numVal) ? "--" : numVal.toFixed(1),
                status: calculateSensorStatus(sensor.key, numVal),
              };
            });
            return updated;
          });
        }

        if (topic.includes("/status") && !topic.includes("feeder")) {
          setActuators((prev) => ({
            ...prev,
            fan: data.fan ?? prev.fan,
            lamp: data.lamp ?? prev.lamp,
            fanAuto: data.fanAuto ?? prev.fanAuto,
            lampAuto: data.lampAuto ?? prev.lampAuto,
            door: data.door ?? prev.door,
          }));
        }

        if (topic.includes("/feeder/status")) {
          if (data.lastDistribution) {
            setFeeder((prev) => ({
              ...prev,
              lastDistribution: new Date(data.lastDistribution),
            }));
          }
        }
      } catch (e) {
        console.error("[MQTT] parse error:", e.message);
      }
    });

    client.on("disconnect", () => setIsConnected(false));
    client.on("offline", () => setIsConnected(false));
    client.on("error", (e) => {
      console.error("[MQTT] error:", e.message);
      setIsConnected(false);
    });

    return () => {
      client.end(true);
      mqttClientRef.current = null;
    };
  }, [poultryId]);

  // ── Publish commandes ────────────────────────────────────────────────────

  const publishCommand = useCallback((command, value) => {
    const client = mqttClientRef.current;
    if (!client || !client.connected) return;

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
      payload = { action: value ? "open" : "close" };
    }

    client.publish(topic, JSON.stringify(payload), { qos: 1 });
  }, []);

  // ── Distributeur ─────────────────────────────────────────────────────────

  const distributeFood = useCallback(
    (triggeredBy = "manual") => {
      const client = mqttClientRef.current;

      if (feeder.tempConditionEnabled) {
        const tempSensor = sensors.find((s) => s.key === "temperature");
        const currentTemp = parseFloat(tempSensor?.value);
        if (!isNaN(currentTemp) && currentTemp >= feeder.tempThreshold) {
          console.warn(
            `[FEEDER] Bloqué — temp ${currentTemp}°C >= seuil ${feeder.tempThreshold}°C`,
          );
          return;
        }
      }

      if (!client || !client.connected) {
        console.warn("[FEEDER] MQTT non connecté");
        return;
      }

      const topic = `poulailler/${ESP_POUAILLER_ID}/commands/feeder`;
      const payload = {
        action: "distribute",
        durationSec: feeder.durationSec,
        triggeredBy,
        timestamp: new Date().toISOString(),
      };

      client.publish(topic, JSON.stringify(payload), { qos: 1 });

      const now = new Date();
      setFeeder((prev) => ({
        ...prev,
        isDistributing: true,
        lastDistribution: now,
      }));

      setTimeout(() => {
        setFeeder((prev) => ({ ...prev, isDistributing: false }));
      }, feeder.durationSec * 1000);
    },
    [feeder, sensors],
  );

  // Vérificateur d'horaires
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      feeder.schedules.forEach((schedule) => {
        if (
          schedule.enabled &&
          now.getHours() === schedule.hour &&
          now.getMinutes() === schedule.minute &&
          now.getSeconds() < 30
        ) {
          distributeFood("schedule");
        }
      });

      if (doorMode === "horaire") {
        const nowHour = now.getHours();
        const nowMinute = now.getMinutes();

        if (
          nowHour === doorSchedule.openHour &&
          nowMinute === doorSchedule.openMinute &&
          now.getSeconds() < 30
        ) {
          publishCommand("door", true);
        }

        if (
          nowHour === doorSchedule.closeHour &&
          nowMinute === doorSchedule.closeMinute &&
          now.getSeconds() < 30
        ) {
          publishCommand("door", false);
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [feeder.schedules, doorMode, doorSchedule, publishCommand]);

  // ── Helpers horaires ──────────────────────────────────────────────────────

  const addSchedule = () => {
    setFeeder((prev) => ({
      ...prev,
      schedules: [
        ...prev.schedules,
        { id: Date.now(), hour: 12, minute: 0, enabled: true },
      ],
    }));
  };

  const removeSchedule = (id) => {
    setFeeder((prev) => ({
      ...prev,
      schedules: prev.schedules.filter((s) => s.id !== id),
    }));
  };

  const updateSchedule = (id, field, value) => {
    setFeeder((prev) => ({
      ...prev,
      schedules: prev.schedules.map((s) =>
        s.id === id ? { ...s, [field]: value } : s,
      ),
    }));
  };

  // ── Handlers Ventilateur ─────────────────────────────────────────────────

  const toggleFanAuto = () => {
    const v = !actuators.fanAuto;
    publishCommand("fanAuto", v);
    setActuators((p) => ({ ...p, fanAuto: v }));
  };

  const setFan = (v) => {
    publishCommand("fan", v);
    setActuators((p) => ({ ...p, fan: v }));
    setTimeout(() => fetchPoultryInfo(), 2000);
  };

  // ── Handlers Lampe ───────────────────────────────────────────────────────

  const toggleLampAuto = () => {
    const v = !actuators.lampAuto;
    publishCommand("lampAuto", v);
    setActuators((p) => ({ ...p, lampAuto: v }));
  };

  const setLamp = (v) => {
    publishCommand("lamp", v);
    setActuators((p) => ({ ...p, lamp: v }));
    setTimeout(() => fetchPoultryInfo(), 2000);
  };

  // ── Handlers Porte ───────────────────────────────────────────────────────

  const toggleDoor = (v) => {
    publishCommand("door", v);
    setActuators((p) => ({ ...p, door: v }));
  };

  // ── Mark all read ────────────────────────────────────────────────────────

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setAlertCount(0);
  }, []);

  // ── Refresh ──────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPoultryInfo();
    setRefreshing(false);
  }, [fetchPoultryInfo]);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#22C55E" />
        <Text
          style={{
            marginTop: 12,
            color: "#94A3B8",
            fontSize: 13,
            fontWeight: "500",
          }}
        >
          Connexion MQTT...
        </Text>
      </SafeAreaView>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: "#fff",
          paddingTop: Platform.OS === "ios" ? insets.top + 8 : 12,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: "#F1F5F9",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center", marginHorizontal: 12 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "800", color: "#1E293B" }}
            numberOfLines={1}
          >
            {poultryInfo.name}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <Animated.View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: isConnected ? "#22C55E" : "#EF4444",
                transform: [{ scale: isConnected ? pulseAnim : 1 }],
              }}
            />
            <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "500" }}>
              {isConnected ? "MQTT connecté" : "Hors ligne"}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Bouton Notification */}
          <TouchableOpacity
            onPress={() => setShowNotifPopup(true)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={alertCount > 0 ? "notifications" : "notifications-outline"}
              size={22}
              color="#1E293B"
            />
            {alertCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#EF4444",
                  borderWidth: 1.5,
                  borderColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: "700",
                    lineHeight: 13,
                  }}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              navigation.navigate("ThresholdConfig", {
                poultryId,
                poultryName: poultryInfo.name,
              })
            }
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F0FDF4",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="tune" size={20} color="#22C55E" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Scroll */}
      <ScrollView
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 40,
          paddingHorizontal: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#22C55E"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[card, { marginBottom: 20 }]}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: "#1E293B",
                  marginBottom: 4,
                }}
              >
                {poultryInfo.name}
              </Text>
              {!!poultryInfo.location && (
                <Text
                  style={{ fontSize: 12, color: "#94A3B8", fontWeight: "500" }}
                >
                  📍 {poultryInfo.location}
                </Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: isConnected ? "#F0FDF4" : "#FEF2F2",
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginLeft: 12,
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: isConnected ? "#22C55E" : "#EF4444",
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: isConnected ? "#22C55E" : "#EF4444",
                }}
              >
                {isConnected ? "Actif" : "Inactif"}
              </Text>
            </View>
          </View>
          {poultryInfo.animalCount > 0 && (
            <View
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <MaterialIcons name="egg" size={16} color="#94A3B8" />
              <Text
                style={{ fontSize: 13, color: "#64748B", fontWeight: "600" }}
              >
                {poultryInfo.animalCount} animaux
              </Text>
            </View>
          )}
        </View>

        {/* Capteurs */}
        <SectionLabel>Capteurs temps réel</SectionLabel>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {sensors.map((sensor, i) => {
            const col = STATUS_COLORS[sensor.status] || STATUS_COLORS.normal;
            return (
              <View key={i} style={[card, { flexBasis: "47%", flexGrow: 1 }]}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: col + "18",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MaterialIcons name={sensor.icon} size={18} color={col} />
                  </View>
                  <View
                    style={{
                      backgroundColor: col + "18",
                      borderRadius: 20,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: col,
                      }}
                    >
                      {sensor.status === "normal"
                        ? "OK"
                        : sensor.status === "warn"
                          ? "Attn."
                          : "Danger"}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: "800",
                      color: "#1E293B",
                      lineHeight: 30,
                    }}
                  >
                    {sensor.value}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#94A3B8",
                      marginBottom: 2,
                    }}
                  >
                    {sensor.unit}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: "#94A3B8",
                    marginTop: 4,
                  }}
                >
                  {sensor.name}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Actionneurs */}
        <SectionLabel>Actionneurs</SectionLabel>
        <View style={{ gap: 10, marginBottom: 24 }}>
          {/* ── Ventilateur ── */}
          <View style={card}>
            <View style={[row, { marginBottom: actuators.fanAuto ? 0 : 14 }]}>
              <IconBox bg="#F0FDF4">
                <MaterialIcons name="cyclone" size={22} color="#22C55E" />
              </IconBox>
              <View style={{ flex: 1 }}>
                <Text style={label}>Ventilateur</Text>
                <Text style={sub}>
                  {actuators.fanAuto
                    ? "Auto — CO2 / Température"
                    : `Manuel — ${actuators.fan ? "● En marche" : "○ Arrêté"}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleFanAuto}
                disabled={!isConnected}
                style={{ opacity: isConnected ? 1 : 0.5 }}
              >
                <Segment
                  options={["AUTO", "MANU"]}
                  selected={actuators.fanAuto ? 0 : 1}
                />
              </TouchableOpacity>
            </View>

            {!actuators.fanAuto && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setFan(true)}
                  disabled={!isConnected || actuators.fan}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: actuators.fan ? "#F0FDF4" : "#22C55E",
                    borderWidth: 1,
                    borderColor: "#22C55E40",
                    opacity: isConnected && !actuators.fan ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons
                    name="play-arrow"
                    size={16}
                    color={actuators.fan ? "#22C55E" : "#fff"}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: actuators.fan ? "#22C55E" : "#fff",
                    }}
                  >
                    Démarrer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setFan(false)}
                  disabled={!isConnected || !actuators.fan}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#F1F5F9",
                    opacity: isConnected && actuators.fan ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons name="stop" size={16} color="#EF4444" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#EF4444",
                    }}
                  >
                    Arrêter
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Lampe Chauffante ── */}
          <View style={card}>
            <View style={[row, { marginBottom: actuators.lampAuto ? 0 : 14 }]}>
              <IconBox bg="#FFFBEB">
                <MaterialIcons name="lightbulb" size={22} color="#F59E0B" />
              </IconBox>
              <View style={{ flex: 1 }}>
                <Text style={label}>Lampe Chauffante</Text>
                <Text
                  style={[
                    sub,
                    !actuators.lampAuto && {
                      color: actuators.lamp ? "#22C55E" : "#94A3B8",
                      fontWeight: "700",
                    },
                  ]}
                >
                  {actuators.lampAuto
                    ? "Auto — Température"
                    : actuators.lamp
                      ? "● Allumée"
                      : "○ Éteinte"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={toggleLampAuto}
                disabled={!isConnected}
                style={{ opacity: isConnected ? 1 : 0.5 }}
              >
                <Segment
                  options={["AUTO", "MANU"]}
                  selected={actuators.lampAuto ? 0 : 1}
                />
              </TouchableOpacity>
            </View>

            {!actuators.lampAuto && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setLamp(true)}
                  disabled={!isConnected || actuators.lamp}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: actuators.lamp ? "#FFFBEB" : "#F59E0B",
                    borderWidth: 1,
                    borderColor: "#F59E0B40",
                    opacity: isConnected && !actuators.lamp ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons
                    name="lightbulb"
                    size={16}
                    color={actuators.lamp ? "#F59E0B" : "#fff"}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: actuators.lamp ? "#F59E0B" : "#fff",
                    }}
                  >
                    Allumer
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setLamp(false)}
                  disabled={!isConnected || !actuators.lamp}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#F1F5F9",
                    opacity: isConnected && actuators.lamp ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons
                    name="lightbulb-outline"
                    size={16}
                    color="#94A3B8"
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#64748B",
                    }}
                  >
                    Éteindre
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Porte ── */}
          <View style={card}>
            <View style={[row, { marginBottom: 14 }]}>
              <IconBox bg="#F8FAFC">
                <MaterialIcons name="door-front" size={22} color="#64748B" />
              </IconBox>
              <View style={{ flex: 1 }}>
                <Text style={label}>Porte Automatique</Text>
                <Text
                  style={[
                    sub,
                    { color: actuators.door ? "#22C55E" : "#94A3B8" },
                  ]}
                >
                  {actuators.door ? "● Ouverte" : "○ Fermée"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  setDoorMode(doorMode === "horaire" ? "manu" : "horaire")
                }
                disabled={!isConnected}
                style={{ opacity: isConnected ? 1 : 0.5 }}
              >
                <Segment
                  options={["HORAIRE", "MANU"]}
                  selected={doorMode === "horaire" ? 0 : 1}
                />
              </TouchableOpacity>
            </View>

            {doorMode === "horaire" && (
              <View style={{ marginBottom: 14 }}>
                <View
                  style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}
                >
                  {[
                    { label: "Ouverture", key: "open" },
                    { label: "Fermeture", key: "close" },
                  ].map((item) => (
                    <View
                      key={item.key}
                      style={{
                        flex: 1,
                        backgroundColor: "#F8FAFC",
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: "#F1F5F9",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "700",
                          color: "#94A3B8",
                          textTransform: "uppercase",
                          marginBottom: 8,
                        }}
                      >
                        {item.label}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <View style={{ alignItems: "center", flex: 1 }}>
                          <TouchableOpacity
                            onPress={() => {
                              if (item.key === "open") {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  openHour: (p.openHour + 1) % 24,
                                }));
                              } else {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  closeHour: (p.closeHour + 1) % 24,
                                }));
                              }
                            }}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-up"
                              size={16}
                              color="#64748B"
                            />
                          </TouchableOpacity>
                          <Text
                            style={{
                              fontSize: 20,
                              fontWeight: "800",
                              color: "#1E293B",
                              width: 32,
                              textAlign: "center",
                            }}
                          >
                            {pad(
                              item.key === "open"
                                ? doorSchedule.openHour
                                : doorSchedule.closeHour,
                            )}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              if (item.key === "open") {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  openHour: (p.openHour - 1 + 24) % 24,
                                }));
                              } else {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  closeHour: (p.closeHour - 1 + 24) % 24,
                                }));
                              }
                            }}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-down"
                              size={16}
                              color="#64748B"
                            />
                          </TouchableOpacity>
                        </View>

                        <Text
                          style={{
                            fontSize: 20,
                            fontWeight: "800",
                            color: "#1E293B",
                          }}
                        >
                          :
                        </Text>

                        <View style={{ alignItems: "center", flex: 1 }}>
                          <TouchableOpacity
                            onPress={() => {
                              if (item.key === "open") {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  openMinute: (p.openMinute + 5) % 60,
                                }));
                              } else {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  closeMinute: (p.closeMinute + 5) % 60,
                                }));
                              }
                            }}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-up"
                              size={16}
                              color="#64748B"
                            />
                          </TouchableOpacity>
                          <Text
                            style={{
                              fontSize: 20,
                              fontWeight: "800",
                              color: "#1E293B",
                              width: 32,
                              textAlign: "center",
                            }}
                          >
                            {pad(
                              item.key === "open"
                                ? doorSchedule.openMinute
                                : doorSchedule.closeMinute,
                            )}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              if (item.key === "open") {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  openMinute: (p.openMinute - 5 + 60) % 60,
                                }));
                              } else {
                                setDoorSchedule((p) => ({
                                  ...p,
                                  closeMinute: (p.closeMinute - 5 + 60) % 60,
                                }));
                              }
                            }}
                          >
                            <MaterialIcons
                              name="keyboard-arrow-down"
                              size={16}
                              color="#64748B"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    backgroundColor: "#F0FDF4",
                    borderRadius: 12,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: "#22C55E30",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <MaterialIcons name="info" size={16} color="#22C55E" />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "500",
                      color: "#22C55E",
                      flex: 1,
                    }}
                  >
                    La porte s'ouvrira/fermera automatiquement aux horaires
                    définis
                  </Text>
                </View>
              </View>
            )}

            {doorMode === "manu" && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => toggleDoor(true)}
                  disabled={!isConnected}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: "#F0FDF4",
                    borderWidth: 1,
                    borderColor: "#22C55E40",
                    opacity: isConnected ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons name="lock-open" size={16} color="#22C55E" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#22C55E",
                    }}
                  >
                    Ouvrir
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => toggleDoor(false)}
                  disabled={!isConnected}
                  style={{
                    flex: 1,
                    padding: 11,
                    borderRadius: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    backgroundColor: "#F8FAFC",
                    borderWidth: 1,
                    borderColor: "#F1F5F9",
                    opacity: isConnected ? 1 : 0.5,
                  }}
                >
                  <MaterialIcons name="lock" size={16} color="#94A3B8" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#64748B",
                    }}
                  >
                    Fermer
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Distributeur de nourriture */}
        <SectionLabel>Distributeur de nourriture</SectionLabel>
        <View style={[card, { marginBottom: 24 }]}>
          {/* En-tête */}
          <View style={[row, { marginBottom: 16 }]}>
            <IconBox bg="#FFF7ED">
              <MaterialIcons name="set-meal" size={22} color="#F97316" />
            </IconBox>
            <View style={{ flex: 1 }}>
              <Text style={label}>Alimentation automatique</Text>
              <Text style={sub}>
                {feeder.lastDistribution
                  ? `Dernière : ${formatTime(feeder.lastDistribution)}`
                  : "Aucune distribution aujourd'hui"}
              </Text>
            </View>
            {feeder.isDistributing && (
              <View
                style={{
                  backgroundColor: "#FFF7ED",
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <ActivityIndicator size="small" color="#F97316" />
                <Text
                  style={{ fontSize: 10, fontWeight: "700", color: "#F97316" }}
                >
                  En cours...
                </Text>
              </View>
            )}
          </View>

          {/* Durée configurable */}
          <View
            style={{
              backgroundColor: "#F8FAFC",
              borderRadius: 12,
              padding: 12,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: "#F1F5F9",
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: "#94A3B8",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Durée de distribution
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <TouchableOpacity
                onPress={() =>
                  setFeeder((p) => ({
                    ...p,
                    durationSec: Math.max(1, p.durationSec - 1),
                  }))
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="remove" size={20} color="#64748B" />
              </TouchableOpacity>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "800",
                  color: "#1E293B",
                  flex: 1,
                  textAlign: "center",
                }}
              >
                {feeder.durationSec}s
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFeeder((p) => ({
                    ...p,
                    durationSec: Math.min(30, p.durationSec + 1),
                  }))
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="add" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 10,
                color: "#94A3B8",
                textAlign: "center",
                marginTop: 6,
                fontWeight: "500",
              }}
            >
              Durée d'activation du moteur (1 – 30 sec)
            </Text>
          </View>

          {/* Condition température */}
          <TouchableOpacity
            onPress={() =>
              setFeeder((p) => ({
                ...p,
                tempConditionEnabled: !p.tempConditionEnabled,
              }))
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              padding: 12,
              backgroundColor: feeder.tempConditionEnabled
                ? "#FFF7ED"
                : "#F8FAFC",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: feeder.tempConditionEnabled
                ? "#F97316" + "40"
                : "#F1F5F9",
            }}
          >
            <MaterialIcons
              name="thermostat"
              size={18}
              color={feeder.tempConditionEnabled ? "#F97316" : "#94A3B8"}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: feeder.tempConditionEnabled ? "#F97316" : "#64748B",
                }}
              >
                Condition température
              </Text>
              <Text style={sub}>
                Bloquer si temp. ≥ {feeder.tempThreshold}°C
              </Text>
            </View>
            <Toggle value={feeder.tempConditionEnabled} />
          </TouchableOpacity>

          {feeder.tempConditionEnabled && (
            <View
              style={{
                backgroundColor: "#FFF7ED",
                borderRadius: 12,
                padding: 12,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: "#F97316" + "30",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <MaterialIcons
                name="device-thermostat"
                size={16}
                color="#F97316"
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: "#64748B",
                  flex: 1,
                }}
              >
                Seuil de blocage
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFeeder((p) => ({
                    ...p,
                    tempThreshold: Math.max(20, p.tempThreshold - 1),
                  }))
                }
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="remove" size={16} color="#64748B" />
              </TouchableOpacity>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: "#F97316",
                  minWidth: 58,
                  textAlign: "center",
                }}
              >
                {feeder.tempThreshold}°C
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setFeeder((p) => ({
                    ...p,
                    tempThreshold: Math.min(45, p.tempThreshold + 1),
                  }))
                }
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons name="add" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
          )}

          <View
            style={{ height: 1, backgroundColor: "#F1F5F9", marginBottom: 14 }}
          />

          {/* Horaires */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                fontWeight: "700",
                color: "#94A3B8",
                textTransform: "uppercase",
              }}
            >
              Horaires programmés ({feeder.schedules.length})
            </Text>
            <TouchableOpacity
              onPress={addSchedule}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#F0FDF4",
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#22C55E40",
              }}
            >
              <MaterialIcons name="add" size={14} color="#22C55E" />
              <Text
                style={{ fontSize: 10, fontWeight: "700", color: "#22C55E" }}
              >
                Ajouter
              </Text>
            </TouchableOpacity>
          </View>

          {feeder.schedules.length === 0 && (
            <View
              style={{
                alignItems: "center",
                paddingVertical: 20,
                backgroundColor: "#F8FAFC",
                borderRadius: 12,
                marginBottom: 14,
              }}
            >
              <MaterialIcons name="schedule" size={28} color="#CBD5E1" />
              <Text
                style={{
                  fontSize: 12,
                  color: "#94A3B8",
                  marginTop: 8,
                  fontWeight: "500",
                }}
              >
                Aucun horaire programmé
              </Text>
            </View>
          )}

          {feeder.schedules.map((schedule) => (
            <View
              key={schedule.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                backgroundColor: schedule.enabled ? "#F0FDF4" : "#F8FAFC",
                padding: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: schedule.enabled ? "#22C55E30" : "#F1F5F9",
              }}
            >
              <TouchableOpacity
                onPress={() =>
                  updateSchedule(schedule.id, "enabled", !schedule.enabled)
                }
              >
                <Toggle value={schedule.enabled} />
              </TouchableOpacity>

              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <View style={{ alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() =>
                      updateSchedule(
                        schedule.id,
                        "hour",
                        (schedule.hour + 1) % 24,
                      )
                    }
                  >
                    <MaterialIcons
                      name="keyboard-arrow-up"
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: schedule.enabled ? "#1E293B" : "#94A3B8",
                      width: 28,
                      textAlign: "center",
                    }}
                  >
                    {pad(schedule.hour)}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateSchedule(
                        schedule.id,
                        "hour",
                        (schedule.hour - 1 + 24) % 24,
                      )
                    }
                  >
                    <MaterialIcons
                      name="keyboard-arrow-down"
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>

                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: schedule.enabled ? "#1E293B" : "#94A3B8",
                    marginBottom: 2,
                  }}
                >
                  :
                </Text>

                <View style={{ alignItems: "center" }}>
                  <TouchableOpacity
                    onPress={() =>
                      updateSchedule(
                        schedule.id,
                        "minute",
                        (schedule.minute + 5) % 60,
                      )
                    }
                  >
                    <MaterialIcons
                      name="keyboard-arrow-up"
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: schedule.enabled ? "#1E293B" : "#94A3B8",
                      width: 28,
                      textAlign: "center",
                    }}
                  >
                    {pad(schedule.minute)}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      updateSchedule(
                        schedule.id,
                        "minute",
                        (schedule.minute - 5 + 60) % 60,
                      )
                    }
                  >
                    <MaterialIcons
                      name="keyboard-arrow-down"
                      size={16}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Text
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontWeight: "600",
                  color: schedule.enabled ? "#22C55E" : "#94A3B8",
                  marginLeft: 4,
                }}
              >
                {schedule.enabled ? "● Actif" : "○ Désactivé"}
              </Text>

              <TouchableOpacity
                onPress={() => removeSchedule(schedule.id)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: "#FEF2F2",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcons
                  name="delete-outline"
                  size={16}
                  color="#EF4444"
                />
              </TouchableOpacity>
            </View>
          ))}

          <View
            style={{
              height: 1,
              backgroundColor: "#F1F5F9",
              marginVertical: 14,
            }}
          />

          {/* Bouton Distribution manuelle */}
          <TouchableOpacity
            onPress={() => distributeFood("manual")}
            disabled={!isConnected || feeder.isDistributing}
            style={{
              padding: 14,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor:
                !isConnected || feeder.isDistributing ? "#F1F5F9" : "#F97316",
              opacity: !isConnected || feeder.isDistributing ? 0.6 : 1,
            }}
          >
            {feeder.isDistributing ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <MaterialIcons
                name="restaurant"
                size={18}
                color={!isConnected ? "#94A3B8" : "#fff"}
              />
            )}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "800",
                color:
                  !isConnected || feeder.isDistributing ? "#94A3B8" : "#fff",
              }}
            >
              {feeder.isDistributing
                ? `Distribution... (${feeder.durationSec}s)`
                : "Distribuer maintenant"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Notification Popup ─────────────────────────────────────────────── */}
      {showNotifPopup && (
        <NotificationPopup
          alerts={alerts}
          onClose={() => setShowNotifPopup(false)}
          onMarkAllRead={markAllRead}
          onViewAll={() => {
            setShowNotifPopup(false);
            if (poultryId) {
              navigation.navigate("AlertSettingsScreen", {
                poultryId,
                poultryName: poultryInfo.name || "Poulailler",
              });
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Notification Popup ────────────────────────────────────────────────────────

function NotificationPopup({ alerts, onClose, onMarkAllRead, onViewAll }) {
  const unreadCount = alerts.filter((a) => !a.read).length;

  function relativeTime(ts) {
    if (!ts) return "À l'instant";
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return new Date(ts).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
  }

  function severityStyle(severity) {
    if (severity === "danger")
      return {
        bg: "#FEF2F2",
        dot: "#EF4444",
        badgeBg: "#FEF2F2",
        badgeColor: "#EF4444",
        badgeBorder: "#EF444430",
        label: "Danger",
      };
    if (severity === "warn")
      return {
        bg: "#FFF7ED",
        dot: "#F59E0B",
        badgeBg: "#FFF7ED",
        badgeColor: "#F59E0B",
        badgeBorder: "#F59E0B30",
        label: "Attention",
      };
    return {
      bg: "#fff",
      dot: "#CBD5E1",
      badgeBg: "#F0FDF4",
      badgeColor: "#22C55E",
      badgeBorder: "#22C55E30",
      label: "Normal",
    };
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Overlay */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.3)" }}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Popup container — stopPropagation */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 98 : 64,
            right: 12,
            width: 315,
            backgroundColor: "#fff",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            shadowColor: "#0F172A",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 16,
            overflow: "hidden",
          }}
        >
          {/* ── En-tête ── */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
            }}
          >
            <View>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: "#1E293B" }}
              >
                Notifications
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "#94A3B8",
                  marginTop: 1,
                  fontWeight: "500",
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                  : "Tout est lu"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* ── Marquer tout comme lu ── */}
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={onMarkAllRead}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#F8FAFC",
              }}
            >
              <MaterialIcons name="done-all" size={15} color="#22C55E" />
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: "#22C55E" }}
              >
                Tout marquer comme lu
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Liste ── */}
          <ScrollView
            style={{ maxHeight: 320 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {alerts.length === 0 ? (
              <View
                style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: "#F8FAFC",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons
                    name="notifications-none"
                    size={26}
                    color="#CBD5E1"
                  />
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#94A3B8",
                    fontWeight: "500",
                  }}
                >
                  Aucune notification
                </Text>
              </View>
            ) : (
              alerts.slice(0, 10).map((alert, idx) => {
                const s = severityStyle(alert.severity);
                return (
                  <View
                    key={alert._id || idx}
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "flex-start",
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F1F5F9",
                      backgroundColor: alert.read ? "#fff" : s.bg,
                    }}
                  >
                    {/* Indicateur non-lu */}
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        marginTop: 5,
                        backgroundColor: alert.read ? "#E2E8F0" : s.dot,
                        flexShrink: 0,
                      }}
                    />

                    <View style={{ flex: 1 }}>
                      {/* Badge sévérité + type */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: s.badgeBg,
                            borderRadius: 20,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            borderWidth: 1,
                            borderColor: s.badgeBorder,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: s.badgeColor,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            {s.label}
                          </Text>
                        </View>
                        {alert.type && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: "#94A3B8",
                              fontWeight: "500",
                            }}
                          >
                            {alert.type}
                          </Text>
                        )}
                      </View>

                      {/* Message */}
                      <Text
                        style={{
                          fontSize: 12,
                          color: alert.read ? "#64748B" : "#1E293B",
                          fontWeight: alert.read ? "400" : "600",
                          lineHeight: 18,
                        }}
                        numberOfLines={2}
                      >
                        {alert.message}
                      </Text>

                      {/* Timestamp */}
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#94A3B8",
                          marginTop: 3,
                          fontWeight: "500",
                        }}
                      >
                        {relativeTime(alert.timestamp)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* ── Footer — Voir toutes ── */}
          <TouchableOpacity
            onPress={onViewAll}
            style={{
              paddingVertical: 13,
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: "#F1F5F9",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: "#F0FDF4",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#22C55E" }}>
              Voir toutes les notifications
            </Text>
            <MaterialIcons name="arrow-forward" size={15} color="#22C55E" />
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Micro-composants ──────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "#94A3B8",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

function IconBox({ bg, children }) {
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
      }}
    >
      {children}
    </View>
  );
}

function Segment({ options, selected }) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#F1F5F9",
        borderRadius: 20,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt, i) => (
        <View
          key={i}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 16,
            backgroundColor: selected === i ? "#22C55E" : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: selected === i ? "#fff" : "#94A3B8",
            }}
          >
            {opt}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Toggle({ value }) {
  return (
    <View style={{ width: 46, height: 26 }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: value ? "#22C55E" : "#E2E8F0",
          borderRadius: 13,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 20,
          height: 20,
          left: value ? 22 : 3,
          top: 3,
          borderRadius: 10,
          backgroundColor: "#fff",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 2,
        }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card = {
  backgroundColor: "#fff",
  borderRadius: 16,
  padding: 16,
  borderWidth: 1,
  borderColor: "#F1F5F9",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};
const row = { flexDirection: "row", alignItems: "center" };
const label = { fontSize: 14, fontWeight: "700", color: "#1E293B" };
const sub = { fontSize: 11, color: "#94A3B8", fontWeight: "500", marginTop: 2 };
