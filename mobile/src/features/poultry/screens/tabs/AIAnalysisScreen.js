// screens/AIAnalysisScreen.js
// Interface redesignée pour l'éleveur — langage simple, données claires

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
  Platform,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import api from "../../../../services/api";
import { analyzePoultry } from "../../../../services/aiAnalysis";
import Toast from "../../../../components/Toast";

const { width } = Dimensions.get("window");

// ─── Couleurs centralisées ─────────────────────────────────────────────────

const C = {
  green: "#3B6D11",
  greenLight: "#EAF3DE",
  greenMid: "#639922",
  greenText: "#27500A",
  amber: "#854F0B",
  amberLight: "#FAEEDA",
  amberText: "#633806",
  red: "#A32D2D",
  redLight: "#FCEBEB",
  redText: "#791F1F",
  blue: "#185FA5",
  blueLight: "#E6F1FB",
  blueText: "#0C447C",
  purple: "#534AB7",
  purpleLight: "#EEEDFE",
  gray: "#64748B",
  grayLight: "#F1F5F9",
  border: "rgba(0,0,0,0.08)",
  white: "#FFFFFF",
  bg: "#F4F6F3",
  textPrimary: "#1A2E0A",
  textSecondary: "#4B5E3A",
  textMuted: "#8A9B7A",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasSensorValue(value) {
  return value !== null && value !== undefined && !isNaN(Number(value));
}

function normalizeSensors(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pick = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== null && v !== undefined) {
        const n = Number(v);
        if (!isNaN(n)) return n;
      }
    }
    return undefined;
  };
  const normalized = {
    temperature: pick(
      "temperature",
      "temp",
      "Temperature",
      "temperatureC",
      "temp_c",
    ),
    humidity: pick(
      "humidity",
      "humidite",
      "hum",
      "Humidity",
      "humidityPercent",
    ),
    waterLevel: pick(
      "waterLevel",
      "water_level",
      "waterLevelPercent",
      "niveauEau",
      "niveau_eau",
    ),
    airQualityPercent: pick(
      "airQualityPercent",
      "air_quality",
      "airQuality",
      "iaq",
      "IAQ",
    ),
    co2: pick("co2", "CO2", "co2_ppm"),
    nh3: pick("nh3", "NH3", "ammonia", "ammoniac"),
  };
  const hasAny = Object.values(normalized).some((v) => v !== undefined);
  return hasAny ? normalized : null;
}

function extractRawSensors(source) {
  if (!source) return null;
  const notEmpty = (obj) =>
    obj && typeof obj === "object" && Object.keys(obj).length > 0;
  if (notEmpty(source.sensors)) return source.sensors;
  if (notEmpty(source.result?.sensors)) return source.result.sensors;
  if (notEmpty(source.sensorData)) return source.sensorData;
  if (notEmpty(source.result?.sensorData)) return source.result.sensorData;
  if (
    hasSensorValue(source.result?.waterLevel) ||
    hasSensorValue(source.result?.temperature) ||
    hasSensorValue(source.result?.humidity) ||
    hasSensorValue(source.result?.airQualityPercent)
  )
    return source.result;
  if (
    hasSensorValue(source.waterLevel) ||
    hasSensorValue(source.temperature) ||
    hasSensorValue(source.humidity) ||
    hasSensorValue(source.airQualityPercent)
  )
    return source;
  return null;
}

function mergeImageQuality(...sources) {
  const merged = {};
  for (const src of sources.filter((s) => s && typeof s === "object")) {
    Object.assign(merged, src);
  }
  return merged;
}

// ─── Urgence → config UI ─────────────────────────────────────────────────────

function urgencyConfig(level) {
  if (level === "critique")
    return {
      color: C.red,
      bg: C.redLight,
      icon: "error",
      label: "Critique",
      labelLong: "Intervention urgente",
    };
  if (level === "attention")
    return {
      color: C.amber,
      bg: C.amberLight,
      icon: "warning",
      label: "Attention",
      labelLong: "Surveillance renforcée",
    };
  if (level === "normal")
    return {
      color: C.green,
      bg: C.greenLight,
      icon: "check-circle",
      label: "État normal",
      labelLong: "Tout va bien",
    };
  return {
    color: C.gray,
    bg: C.grayLight,
    icon: "help-outline",
    label: "Inconnu",
    labelLong: "Données insuffisantes",
  };
}

// ─── Score color ──────────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score === null || score === undefined) return C.gray;
  if (score >= 70) return C.greenMid;
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

// ─── Test image (galerie → receive-image → polling) ───────────────────────────

async function pickAndSendTestImage(poultryId) {
  if (Platform.OS !== "web") {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission refusée",
        "Autorisez l'accès à la galerie dans les paramètres.",
      );
      return null;
    }
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    base64: false,
    allowsEditing: false,
  });
  if (picked.canceled || !picked.assets?.[0]?.uri) return null;
  const uri = picked.assets[0].uri;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding:
      FileSystem?.EncodingType?.Base64 ??
      FileSystem?.EncodingType?.base64 ??
      "base64",
  });
  const kb = Math.round((base64.length * 3) / 4 / 1024);
  if (kb < 3) throw new Error(`Image trop petite (${kb} Ko)`);
  if (kb > 5120) throw new Error(`Image trop grande (${kb} Ko — max 5 Mo)`);
  const requestId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const res = await api.post("/ai/receive-image", {
    poulaillerId: poultryId,
    requestId,
    imageBase64: base64,
    isTestImage: true,
  });
  if (!res.data?.success)
    throw new Error(res.data?.error || "Erreur envoi image de test");
  try {
    await analyzePoultry(poultryId, "manual");
  } catch (_) {}
  return { requestId, base64 };
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANTS UI
// ════════════════════════════════════════════════════════════════════════════

// ─── Score circulaire ─────────────────────────────────────────────────────────

function ScoreCircle({ score, size = 84 }) {
  const color = scoreColor(score);
  const isNull = score === null || score === undefined;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 7,
          borderColor: C.grayLight,
          position: "absolute",
        }}
      />
      {!isNull && (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 7,
            borderColor: color,
            borderRightColor: "transparent",
            borderBottomColor: "transparent",
            position: "absolute",
            transform: [{ rotate: "-90deg" }],
          }}
        />
      )}
      <Text style={{ fontSize: 24, fontWeight: "700", color, lineHeight: 28 }}>
        {isNull ? "—" : score}
      </Text>
      <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: "600" }}>
        {isNull ? "inconnu" : "/ 100"}
      </Text>
    </View>
  );
}

// ─── Badge urgence ────────────────────────────────────────────────────────────

function UrgencyBadge({ level, large = false }) {
  const cfg = urgencyConfig(level);
  return (
    <View style={[S.badge, { backgroundColor: cfg.bg }]}>
      <MaterialIcons name={cfg.icon} size={large ? 16 : 13} color={cfg.color} />
      <Text
        style={[S.badgeText, { color: cfg.color, fontSize: large ? 13 : 12 }]}
      >
        {large ? cfg.labelLong : cfg.label}
      </Text>
    </View>
  );
}

// ─── Carte de détection générique ─────────────────────────────────────────────

function DetCard({
  icon,
  title,
  badge,
  badgeColor,
  badgeBg,
  isNull,
  children,
}) {
  return (
    <View style={[S.detCard, isNull && { opacity: 0.5 }]}>
      <View style={S.detHead}>
        <View style={[S.detIcon, { backgroundColor: badgeBg + "30" }]}>
          <MaterialIcons name={icon} size={18} color={badgeColor} />
        </View>
        <Text style={S.detTitle}>{title}</Text>
        <View style={[S.detBadge, { backgroundColor: badgeBg }]}>
          <Text style={[S.detBadgeText, { color: badgeColor }]}>{badge}</Text>
        </View>
      </View>
      {isNull ? (
        <Text style={S.detNull}>Non évalué — image indisponible</Text>
      ) : (
        <View style={S.detBody}>{children}</View>
      )}
    </View>
  );
}

// ─── Ligne dans une carte de détection ───────────────────────────────────────

function DetRow({ icon, iconColor, text, textColor }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
      <MaterialIcons
        name={icon}
        size={14}
        color={iconColor}
        style={{ marginTop: 2 }}
      />
      <Text style={[S.detRowText, textColor && { color: textColor }]}>
        {text}
      </Text>
    </View>
  );
}

// ─── Capteur individuel ───────────────────────────────────────────────────────

function SensorCard({ icon, label, value, unit, color, alert }) {
  return (
    <View
      style={[
        S.sensorCard,
        alert && { borderWidth: 1, borderColor: color + "80" },
      ]}
    >
      <View style={[S.sensorIcon, { backgroundColor: color + "18" }]}>
        <MaterialIcons name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[S.sensorVal, alert && { color }]}>
          {value}
          <Text style={S.sensorUnit}> {unit}</Text>
        </Text>
        <Text style={S.sensorLabel}>{label}</Text>
      </View>
      {alert && <MaterialIcons name="warning" size={13} color={color} />}
    </View>
  );
}

// ─── Section capteurs complète ────────────────────────────────────────────────

function SensorsSection({ sensors }) {
  if (!sensors)
    return (
      <View style={S.noSensor}>
        <MaterialIcons name="sensors-off" size={17} color={C.textMuted} />
        <Text style={S.noSensorText}>Capteurs non connectés</Text>
      </View>
    );

  const cards = [];

  if (hasSensorValue(sensors.temperature)) {
    const v = Number(sensors.temperature);
    const alert = v > 30 || v < 15;
    cards.push(
      <SensorCard
        key="temp"
        icon="thermostat"
        label="Température"
        value={v.toFixed(1)}
        unit="°C"
        color={alert ? C.red : "#D97706"}
        alert={alert}
      />,
    );
  }
  if (hasSensorValue(sensors.humidity)) {
    const v = Number(sensors.humidity);
    const alert = v > 80 || v < 30;
    cards.push(
      <SensorCard
        key="hum"
        icon="water-drop"
        label="Humidité"
        value={Math.round(v)}
        unit="%"
        color={alert ? C.red : C.blue}
        alert={alert}
      />,
    );
  }
  if (hasSensorValue(sensors.waterLevel)) {
    const v = Number(sensors.waterLevel);
    const alert = v < 20;
    const color = v < 20 ? C.red : v < 40 ? "#D97706" : C.greenMid;
    cards.push(
      <SensorCard
        key="water"
        icon="local-drink"
        label="Niveau d'eau"
        value={Math.round(v)}
        unit="%"
        color={color}
        alert={alert}
      />,
    );
  }
  if (hasSensorValue(sensors.airQualityPercent)) {
    const v = Number(sensors.airQualityPercent);
    const alert = v < 40;
    cards.push(
      <SensorCard
        key="air"
        icon="air"
        label="Qualité de l'air"
        value={Math.round(v)}
        unit="%"
        color={alert ? C.red : C.purple}
        alert={alert}
      />,
    );
  }
  if (hasSensorValue(sensors.co2)) {
    const v = Number(sensors.co2);
    const alert = v > 3000;
    cards.push(
      <SensorCard
        key="co2"
        icon="cloud"
        label="CO₂"
        value={Math.round(v)}
        unit="ppm"
        color={alert ? C.red : C.gray}
        alert={alert}
      />,
    );
  }
  if (hasSensorValue(sensors.nh3)) {
    const v = Number(sensors.nh3);
    const alert = v > 25;
    cards.push(
      <SensorCard
        key="nh3"
        icon="science"
        label="Ammoniac (NH₃)"
        value={v.toFixed(1)}
        unit="ppm"
        color={alert ? C.red : "#D97706"}
        alert={alert}
      />,
    );
  }

  if (cards.length === 0)
    return (
      <View style={S.noSensor}>
        <MaterialIcons name="sensors-off" size={17} color={C.textMuted} />
        <Text style={S.noSensorText}>Aucune donnée capteur disponible</Text>
      </View>
    );

  return <View style={S.sensorGrid}>{cards}</View>;
}

// ─── Étapes de progression ────────────────────────────────────────────────────

function PhaseSteps({ currentPhase }) {
  const steps = [
    {
      key: "capturing",
      icon: "settings-remote",
      label: "Déclenchement caméra",
    },
    { key: "uploading", icon: "cloud-upload", label: "Envoi de la photo" },
    { key: "analyzing", icon: "biotech", label: "Analyse IA" },
  ];
  const order = ["capturing", "uploading", "analyzing"];
  const cur = order.indexOf(currentPhase);
  return (
    <View style={S.phaseRow}>
      {steps.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        const color = done ? C.greenMid : active ? C.blue : "#CBD5E1";
        return (
          <View key={s.key} style={S.phaseStep}>
            <View
              style={[
                S.phaseIcon,
                {
                  backgroundColor: done
                    ? C.greenLight
                    : active
                      ? C.blueLight
                      : C.grayLight,
                  borderColor: color,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              {done ? (
                <MaterialIcons name="check" size={13} color={C.greenMid} />
              ) : (
                <MaterialIcons name={s.icon} size={13} color={color} />
              )}
            </View>
            <Text
              style={[
                S.phaseLabel,
                {
                  color: active ? C.textPrimary : done ? C.greenMid : "#94A3B8",
                },
              ]}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Historique item ──────────────────────────────────────────────────────────

function HistoryItem({ item, onPress }) {
  const level = item.result?.urgencyLevel;
  const score = item.result?.healthScore;
  const cfg = urgencyConfig(level);
  const date = new Date(item.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <TouchableOpacity style={S.histItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[S.histThumb, { backgroundColor: cfg.bg }]}>
        {item.image?.url ? (
          <Image
            source={{ uri: item.image.thumbnailUrl || item.image.url }}
            style={{ width: 46, height: 46, borderRadius: 10 }}
            resizeMode="cover"
          />
        ) : (
          <MaterialIcons
            name="image-not-supported"
            size={18}
            color={cfg.color}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.histDate}>{date}</Text>
        <Text style={[S.histScore, { color: cfg.color }]}>
          {score !== null && score !== undefined ? `${score}/100` : "—"} —{" "}
          {cfg.label}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

// ─── En-tête de section ───────────────────────────────────────────────────────

function SectionHeader({ icon, label }) {
  return (
    <View style={S.sectionHeader}>
      <MaterialIcons name={icon} size={14} color={C.textMuted} />
      <Text style={S.sectionLabel}>{label}</Text>
    </View>
  );
}

// ─── Conseil ─────────────────────────────────────────────────────────────────

function AdviceItem({ text, index, urgent }) {
  return (
    <View style={[S.adviceItem, urgent && { backgroundColor: C.redLight }]}>
      <View
        style={[S.adviceNum, { backgroundColor: urgent ? C.red : C.greenMid }]}
      >
        <Text style={S.adviceNumText}>{index + 1}</Text>
      </View>
      <Text style={[S.adviceText, urgent && { color: C.redText }]}>{text}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export default function AIAnalysisScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route?.params || {};
  const poultryId = params.poultryId || params.poulaillerId;
  const poultryName =
    params.poultryName || params.poulaillerName || "Poulailler";
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState("idle");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [imageUri, setImageUri] = useState(null);
  const [result, setResult] = useState(null);
  const [sensors, setSensors] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(0);
  const [testLoading, setTestLoading] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressInterval = useRef(null);
  const pollIntervalRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearInterval(pollIntervalRef.current);
      clearTimeout(pollTimeoutRef.current);
      clearInterval(progressInterval.current);
    };
  }, []);

  useEffect(() => {
    if (!poultryId) return;
    loadHistory();
    loadLatestAnalysis();
  }, [poultryId]);

  const loadHistory = async () => {
    try {
      const res = await api.get(`/ai/history/${poultryId}`);
      if (res.data?.success && isMountedRef.current)
        setHistory(res.data.data || []);
    } catch (_) {}
  };

  const loadLatestAnalysis = async () => {
    try {
      const res = await api.get(`/ai/latest/${poultryId}`);
      if (res.data?.success && res.data.data && isMountedRef.current) {
        const doc = res.data.data;
        const mergedIQ = mergeImageQuality(
          doc.result?.imageQuality,
          doc.imageQuality,
        );
        setResult({
          ...doc.result,
          imageQuality: mergedIQ,
          imageUsable:
            doc.imageUsable !== undefined
              ? doc.imageUsable
              : doc.result?.imageUsable,
          imageAvailable:
            doc.imageAvailable !== undefined
              ? doc.imageAvailable
              : doc.result?.imageAvailable,
        });
        setSensors(normalizeSensors(extractRawSensors(doc)));
        if (doc.image?.url) setImageUri(doc.image.url);
        setPhase("done");
        fadeAnim.setValue(1);
      }
    } catch (_) {}
  };

  const stopPolling = useCallback(() => {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
    clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = null;
    clearInterval(progressInterval.current);
    progressInterval.current = null;
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ visible: true, message, type });
  }, []);

  const startPolling = useCallback(
    (requestId) => {
      setPhase("capturing");
      setPhaseLabel("En attente de la photo...");
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 30000,
        useNativeDriver: false,
      }).start();
      let p = 0;
      progressInterval.current = setInterval(() => {
        p += 1;
        if (isMountedRef.current) setProgress(Math.min(p, 90));
        if (p >= 90) clearInterval(progressInterval.current);
      }, 300);

      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        if (isMountedRef.current) {
          setPhase("idle");
          setPhaseLabel("");
          showToast(
            "Délai dépassé (90s). Vérifiez la connexion et réessayez.",
            "error",
          );
        }
      }, 90000);

      pollIntervalRef.current = setInterval(async () => {
        if (!isMountedRef.current) {
          stopPolling();
          return;
        }
        try {
          const statusRes = await api.get(`/ai/capture-status/${requestId}`);
          const d = statusRes.data?.data;
          if (!d) return;

          const phaseMap = {
            pending: { phase: "capturing", label: "En attente de la photo..." },
            capturing: {
              phase: "capturing",
              label: "La caméra prend la photo...",
            },
            uploading: {
              phase: "uploading",
              label: "Photo envoyée vers le serveur...",
            },
            analyzing: {
              phase: "analyzing",
              label: "L'IA analyse votre troupeau...",
            },
          };
          if (phaseMap[d.status] && isMountedRef.current) {
            setPhase(phaseMap[d.status].phase);
            setPhaseLabel(phaseMap[d.status].label);
          }

          if (d.status === "completed") {
            stopPolling();
            if (!isMountedRef.current) return;
            setProgress(100);
            if (d.imageUrl) setImageUri(d.imageUrl);
            if (d.analysis) {
              const mergedIQ = mergeImageQuality(
                d.analysis?.imageQuality,
                d.imageQuality,
              );
              setResult({
                ...d.analysis,
                imageQuality: mergedIQ,
                imageUsable:
                  d.imageUsable !== undefined
                    ? d.imageUsable
                    : d.analysis?.imageUsable,
                imageAvailable:
                  d.imageAvailable !== undefined
                    ? d.imageAvailable
                    : d.analysis?.imageAvailable,
              });
            }
            setSensors(normalizeSensors(extractRawSensors(d)));
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start();
            setPhase("done");
            setPhaseLabel("");
            const score = d.analysis?.healthScore;
            showToast(
              `Analyse terminée — Score : ${score ?? "—"}/100`,
              "success",
            );
            loadHistory();
          } else if (d.status === "failed") {
            stopPolling();
            if (isMountedRef.current) {
              setPhase("idle");
              setPhaseLabel("");
              showToast(statusRes.data?.error || "Analyse échouée", "error");
            }
          }
        } catch (err) {
          const s = err.response?.status;
          if (s === 404 || s === 500) {
            stopPolling();
            if (isMountedRef.current) {
              setPhase("idle");
              setPhaseLabel("");
              showToast(
                s === 404
                  ? "Session expirée. Relancez l'analyse."
                  : err.response?.data?.error || "Erreur serveur",
                "error",
              );
            }
          }
        }
      }, 2000);
    },
    [stopPolling, fadeAnim, progressAnim, showToast],
  );

  const handleAnalyze = useCallback(async () => {
    if (["capturing", "uploading", "analyzing"].includes(phase)) return;
    stopPolling();
    fadeAnim.setValue(0);
    progressAnim.setValue(0);
    setProgress(0);
    setResult(null);
    setSensors(null);
    setPhase("capturing");
    setPhaseLabel("Envoi de la commande à la caméra...");
    showToast("Commande envoyée à la caméra...", "info");
    try {
      const captureRes = await api.post(`/ai/capture/${poultryId}`);
      if (!captureRes.data?.success)
        throw new Error(captureRes.data?.error || "Erreur déclenchement");
      const { requestId, mqttSent, cameraMac } = captureRes.data.data || {};
      if (!requestId) {
        showToast("Erreur serveur — aucun identifiant reçu", "error");
        if (isMountedRef.current) {
          setPhase("idle");
          setPhaseLabel("");
        }
        return;
      }
      showToast(
        mqttSent
          ? "Caméra déclenchée — photo en cours..."
          : `Reconnexion en cours... (${cameraMac || "caméra"})`,
        mqttSent ? "info" : "warn",
      );
      startPolling(requestId);
    } catch (err) {
      showToast(err.message || "Erreur déclenchement", "error");
      if (isMountedRef.current) {
        setPhase("idle");
        setPhaseLabel("");
      }
    }
  }, [
    phase,
    poultryId,
    stopPolling,
    startPolling,
    fadeAnim,
    progressAnim,
    showToast,
  ]);

  const isLoading = ["capturing", "uploading", "analyzing"].includes(phase);

  const handleTestImage = useCallback(async () => {
    if (isLoading || testLoading) return;
    setTestLoading(true);
    try {
      stopPolling();
      fadeAnim.setValue(0);
      progressAnim.setValue(0);
      setProgress(0);
      setResult(null);
      setSensors(null);
      showToast("Sélectionnez une image à analyser...", "info");
      const testData = await pickAndSendTestImage(poultryId);
      if (!testData) {
        setTestLoading(false);
        return;
      }
      showToast("Image envoyée — analyse en cours...", "info");
      startPolling(testData.requestId);
    } catch (err) {
      showToast(err.message || "Erreur test image", "error");
      if (isMountedRef.current) {
        setPhase("idle");
        setPhaseLabel("");
      }
    } finally {
      setTestLoading(false);
    }
  }, [
    isLoading,
    testLoading,
    poultryId,
    stopPolling,
    startPolling,
    fadeAnim,
    progressAnim,
    showToast,
  ]);

  const handleReset = useCallback(() => {
    stopPolling();
    setPhase("idle");
    setPhaseLabel("");
    setProgress(0);
    progressAnim.setValue(0);
    fadeAnim.setValue(0);
    setResult(null);
    setSensors(null);
    setImageUri(null);
  }, [stopPolling]);

  const goToDetail = useCallback(
    (item) =>
      navigation.navigate("AIDetail", {
        analysis: item,
        poultryId,
        poultryName,
      }),
    [navigation, poultryId, poultryName],
  );
  const goToChat = useCallback(
    () =>
      navigation.navigate("AIChat", {
        poultryId,
        poultryName,
        context: result,
      }),
    [navigation, poultryId, poultryName, result],
  );

  // ── Données dérivées — toutes sécurisées contre undefined/null ────────────

  const imageQuality = result?.imageQuality ?? {};
  const isPoor = imageQuality?.status === "poor";

  const det = result?.detections || {};
  const comptage = result?.comptage ?? {};
  const maladie = result?.maladie_suspectee || {};
  const advices = Array.isArray(result?.advices) ? result.advices : [];

  const mortalityDetected = isPoor ? null : (det.mortalityDetected ?? null);
  const nombreMorts = isPoor
    ? null
    : Number.isFinite(det.nombreMorts)
      ? det.nombreMorts
      : null;
  const behaviorNormal = isPoor ? null : (det.behaviorNormal ?? null);

  const maladieSuspicion = isPoor ? null : (maladie.suspicion ?? null);
  // ── FIX: toujours un tableau, jamais undefined ──────────────────────────
  const signesObserves = Array.isArray(maladie?.signes_observes)
    ? maladie.signes_observes
    : [];

  const comptageEstimation = comptage?.estimation ?? null;

  const urgencyLevel = result?.urgencyLevel ?? "inconnu";
  const healthScore = Number.isFinite(result?.healthScore)
    ? result.healthScore
    : null;

  // ── Texte comportement anormal — adapté au nombre de volailles ────────────
  const behaviorAnormalText = (() => {
    if (signesObserves.length > 0) {
      return `Comportements anormaux détectés — ${signesObserves.slice(0, 2).join(", ")}.`;
    }
    if (comptageEstimation !== null && comptageEstimation <= 1) {
      return "Comportement anormal détecté — observez attentivement cette volaille.";
    }
    return "Comportements anormaux détectés — observez vos volailles de plus près.";
  })();

  // ── Configs badges ─────────────────────────────────────────────────────────

  const mortalityCfg =
    mortalityDetected === true
      ? {
          color: C.red,
          bg: C.redLight,
          badge: `${nombreMorts ?? "?"} MORTE${(nombreMorts ?? 0) > 1 ? "S" : ""}`,
        }
      : mortalityDetected === false
        ? { color: C.greenMid, bg: C.greenLight, badge: "AUCUNE" }
        : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  const behaviorCfg =
    behaviorNormal === true
      ? { color: C.greenMid, bg: C.greenLight, badge: "NORMAL" }
      : behaviorNormal === false
        ? { color: "#D97706", bg: C.amberLight, badge: "ANORMAL" }
        : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  const maladieCfg =
    maladieSuspicion === true
      ? { color: C.red }
      : maladieSuspicion === false
        ? { color: C.greenMid, bg: C.greenLight, badge: "RAS" }
        : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  const comptageCfg =
    comptageEstimation !== null && comptageEstimation !== undefined
      ? {
          color: C.blue,
          bg: C.blueLight,
          badge: `~ ${comptageEstimation} vol.`,
        }
      : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={S.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── En-tête ── */}
      <View style={S.header}>
        <TouchableOpacity
          style={S.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Santé du troupeau</Text>
          <Text style={S.headerSub} numberOfLines={1}>
            {poultryName}
          </Text>
        </View>
        <View
          style={[S.livePill, isLoading && { backgroundColor: C.amberLight }]}
        >
          <View
            style={[S.liveDot, isLoading && { backgroundColor: "#D97706" }]}
          />
          <Text style={[S.liveText, isLoading && { color: C.amberText }]}>
            {isLoading ? "EN COURS" : "ACTIF"}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          S.scroll,
          { paddingBottom: 96 + Math.max(insets.bottom, 0) },
        ]}
      >
        {/* ── Zone image ── */}
        <View style={[S.imageZone, imageUri && S.imageZoneFull]}>
          {phase === "capturing" ? (
            <View style={S.imagePlaceholder}>
              <View style={[S.imageIconWrap, { backgroundColor: C.blueLight }]}>
                <MaterialIcons
                  name="settings-remote"
                  size={28}
                  color={C.blue}
                />
              </View>
              <Text style={[S.imagePlaceholderTitle, { color: C.blue }]}>
                Caméra en cours...
              </Text>
              <Text style={S.imagePlaceholderSub}>
                La caméra va prendre une photo du poulailler
              </Text>
            </View>
          ) : imageUri ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              <View style={S.imageOverlay}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={S.imagePill}>
                    <MaterialIcons name="camera-alt" size={11} color="#fff" />
                    <Text style={S.imagePillText}>ESP32-CAM</Text>
                  </View>
                  {healthScore !== null && (
                    <View
                      style={[
                        S.imagePill,
                        {
                          backgroundColor:
                            urgencyLevel === "critique"
                              ? "rgba(220,38,38,0.9)"
                              : urgencyLevel === "attention"
                                ? "rgba(217,119,6,0.9)"
                                : "rgba(99,153,34,0.9)",
                        },
                      ]}
                    >
                      <Text style={S.imagePillText}>{healthScore} / 100</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={S.imagePlaceholder}>
              <View style={S.imageIconWrap}>
                <MaterialIcons name="camera-alt" size={28} color={C.greenMid} />
              </View>
              <Text style={S.imagePlaceholderTitle}>Prêt à analyser</Text>
              <Text style={S.imagePlaceholderSub}>
                Appuyez sur{" "}
                <Text style={{ color: C.greenMid, fontWeight: "700" }}>
                  Analyser
                </Text>{" "}
                pour déclencher la caméra
              </Text>
            </View>
          )}
        </View>

        {/* ── Progression ── */}
        {isLoading && (
          <View style={S.card}>
            <PhaseSteps currentPhase={phase} />
            <View style={S.progressBg}>
              <Animated.View
                style={[
                  S.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              <Text style={S.progressLabel}>
                {phaseLabel || "Analyse en cours..."}
              </Text>
              <Text
                style={[
                  S.progressLabel,
                  { color: C.greenMid, fontWeight: "700" },
                ]}
              >
                {progress}%
              </Text>
            </View>
            <Text style={S.progressModel}>Llama Vision · Cloudflare AI</Text>
          </View>
        )}

        {/* ── Résultats ── */}
        {phase === "done" && result && (
          <Animated.View style={{ opacity: fadeAnim, gap: 10 }}>
            {/* Bannières urgence */}
            {urgencyLevel === "critique" && (
              <View
                style={[
                  S.banner,
                  { backgroundColor: C.redLight, borderColor: "#F7C1C1" },
                ]}
              >
                <MaterialIcons name="error" size={20} color={C.red} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.bannerTitle, { color: C.redText }]}>
                    Intervention urgente requise
                  </Text>
                  <Text style={[S.bannerDesc, { color: C.red }]}>
                    Vérifiez immédiatement votre troupeau
                  </Text>
                </View>
              </View>
            )}
            {urgencyLevel === "attention" && (
              <View
                style={[
                  S.banner,
                  { backgroundColor: C.amberLight, borderColor: "#FAC775" },
                ]}
              >
                <MaterialIcons name="warning" size={20} color={C.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={[S.bannerTitle, { color: C.amberText }]}>
                    Surveillance renforcée conseillée
                  </Text>
                  <Text style={[S.bannerDesc, { color: C.amber }]}>
                    Contrôlez les capteurs et observez vos volailles
                  </Text>
                </View>
              </View>
            )}

            {/* Carte score + diagnostic */}
            <View style={S.card}>
              <View style={S.scoreRow}>
                <ScoreCircle score={healthScore} size={84} />
                <View style={{ flex: 1, gap: 7 }}>
                  <UrgencyBadge level={urgencyLevel} large />
                  {result.confidence != null && (
                    <Text style={S.confText}>
                      Confiance IA : {result.confidence}%
                    </Text>
                  )}
                  <Text style={S.confText}>
                    {result.imageUsable
                      ? "Image analysée"
                      : "Analyse capteurs uniquement"}
                  </Text>
                </View>
              </View>

              <View style={S.diagBox}>
                <Text style={S.diagText}>
                  {result.diagnostic || "Analyse effectuée."}
                </Text>
              </View>

              {/* ── Ce que l'IA a vu ── */}
              <SectionHeader icon="biotech" label="Ce que l'IA a vu" />
              <View style={{ gap: 8 }}>
                {/* Volailles mortes */}
                <DetCard
                  icon="warning"
                  title="Volailles mortes"
                  badge={mortalityCfg.badge}
                  badgeColor={mortalityCfg.color}
                  badgeBg={mortalityCfg.bg}
                  isNull={
                    mortalityDetected === null ||
                    mortalityDetected === undefined
                  }
                >
                  {mortalityDetected === true ? (
                    nombreMorts > 0 ? (
                      <>
                        <DetRow
                          icon="report"
                          iconColor={C.red}
                          text={`${nombreMorts} volaille${nombreMorts > 1 ? "s" : ""} morte${nombreMorts > 1 ? "s" : ""} détectée${nombreMorts > 1 ? "s" : ""} sur l'image.`}
                          textColor={C.red}
                        />
                        <View style={[S.vetBadge, { marginTop: 8 }]}>
                          <MaterialIcons
                            name="local-hospital"
                            size={14}
                            color={C.red}
                          />
                          <Text style={[S.vetBadgeText, { color: C.red }]}>
                            Appelez un vétérinaire immédiatement
                          </Text>
                        </View>
                      </>
                    ) : (
                      <DetRow
                        icon="report"
                        iconColor={C.red}
                        text="Des volailles mortes ont été détectées. Contactez un vétérinaire."
                        textColor={C.red}
                      />
                    )
                  ) : (
                    <DetRow
                      icon="check-circle"
                      iconColor={C.greenMid}
                      text="Aucune volaille au sol ou immobile détectée sur l'image."
                    />
                  )}
                </DetCard>

                {/* Comptage */}
                <DetCard
                  icon="groups"
                  title="Volailles comptées sur l'image"
                  badge={comptageCfg.badge}
                  badgeColor={comptageCfg.color}
                  badgeBg={comptageCfg.bg}
                  isNull={
                    comptageEstimation === null ||
                    comptageEstimation === undefined
                  }
                >
                  {comptageEstimation !== null &&
                  comptageEstimation !== undefined ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={S.comptageBox}>
                        <Text style={S.comptageNum}>{comptageEstimation}</Text>
                        <Text style={S.comptageSub}>visibles</Text>
                      </View>
                      <View style={{ flex: 1, gap: 5 }}>
                        {comptage.fiabilite && (
                          <View
                            style={[
                              S.fiabBadge,
                              {
                                backgroundColor:
                                  comptage.fiabilite === "bonne"
                                    ? C.greenLight
                                    : comptage.fiabilite === "moyenne"
                                      ? C.amberLight
                                      : C.grayLight,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                S.fiabText,
                                {
                                  color:
                                    comptage.fiabilite === "bonne"
                                      ? C.green
                                      : comptage.fiabilite === "moyenne"
                                        ? C.amber
                                        : C.gray,
                                },
                              ]}
                            >
                              Fiabilité {comptage.fiabilite}
                            </Text>
                          </View>
                        )}
                        {comptage.note && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: C.textMuted,
                              lineHeight: 16,
                            }}
                          >
                            {comptage.note}
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <DetRow
                      icon="help-outline"
                      iconColor={C.gray}
                      text="Comptage impossible — visibilité insuffisante."
                    />
                  )}
                </DetCard>

                {/* Signes cliniques / maladie */}
                <DetCard
                  icon="coronavirus"
                  title="Signes observés sur l'image"
                  badge={maladieCfg.badge}
                  badgeColor={maladieCfg.color}
                  badgeBg={maladieCfg.bg}
                  isNull={
                    maladieSuspicion === null || maladieSuspicion === undefined
                  }
                >
                  {maladieSuspicion === true ? (
                    <View style={{ gap: 8 }}>
                      {signesObserves.length > 0 && (
                        <View style={S.signesBox}>
                          {signesObserves.map((s, i) => (
                            <View
                              key={i}
                              style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: 6,
                                marginTop: 3,
                              }}
                            >
                              <View style={S.signeDot} />
                              <Text style={S.signeText}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {maladie.urgence_veterinaire && (
                        <View style={S.vetBadge}>
                          <MaterialIcons
                            name="local-hospital"
                            size={14}
                            color={C.red}
                          />
                          <Text style={S.vetBadgeText}>
                            Consultation vétérinaire urgente
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <DetRow
                      icon="check-circle"
                      iconColor={C.greenMid}
                      text="Aucun signe clinique suspect (plumes, posture, yeux, crête)."
                    />
                  )}
                </DetCard>

                {/* Comportement */}
                <DetCard
                  icon="psychology"
                  title="Comportement du troupeau"
                  badge={behaviorCfg.badge}
                  badgeColor={behaviorCfg.color}
                  badgeBg={behaviorCfg.bg}
                  isNull={
                    behaviorNormal === null || behaviorNormal === undefined
                  }
                >
                  {behaviorNormal === true ? (
                    <DetRow
                      icon="check-circle"
                      iconColor={C.greenMid}
                      text="Activité normale — les volailles se comportent bien."
                    />
                  ) : (
                    // ── FIX: texte dynamique selon contexte, pas de "regroupements" pour 1 volaille ──
                    <DetRow
                      icon="warning"
                      iconColor="#D97706"
                      text={behaviorAnormalText}
                      textColor={C.amberText}
                    />
                  )}
                </DetCard>
              </View>

              {/* ── Capteurs ── */}
              <SectionHeader icon="sensors" label="Capteurs du poulailler" />
              <SensorsSection sensors={sensors} />

              {/* ── Recommandations ── */}
              {advices.length > 0 && (
                <>
                  <SectionHeader icon="lightbulb" label="Ce qu'il faut faire" />
                  <View style={{ gap: 7 }}>
                    {advices.map((a, i) => (
                      <AdviceItem
                        key={i}
                        text={a}
                        index={i}
                        urgent={urgencyLevel === "critique" && i === 0}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── État idle sans résultat ── */}
        {phase === "idle" && !result && (
          <View
            style={[
              S.card,
              { alignItems: "center", paddingVertical: 28, gap: 10 },
            ]}
          >
            <View
              style={[
                S.imageIconWrap,
                { width: 64, height: 64, borderRadius: 32 },
              ]}
            >
              <MaterialIcons name="biotech" size={30} color={C.greenMid} />
            </View>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: C.textPrimary }}
            >
              Prêt à analyser
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: C.textSecondary,
                textAlign: "center",
                lineHeight: 20,
                paddingHorizontal: 12,
              }}
            >
              L'IA déclenche la caméra, prend une photo et analyse l'état de
              santé de votre troupeau en quelques secondes.
            </Text>
          </View>
        )}

        {/* ── Historique ── */}
        <View style={S.card}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <MaterialIcons name="history" size={17} color={C.textPrimary} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: C.textPrimary,
                }}
              >
                Historique
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("AIHistory", {
                  poultryId,
                  poultryName,
                })
              }
            >
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: C.greenMid }}
              >
                Voir tout
              </Text>
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <Text
              style={{
                color: C.textMuted,
                fontSize: 13,
                textAlign: "center",
                paddingVertical: 16,
              }}
            >
              Aucune analyse effectuée pour l'instant
            </Text>
          ) : (
            history
              .slice(0, 3)
              .map((item, i) => (
                <HistoryItem
                  key={i}
                  item={item}
                  onPress={() => goToDetail(item)}
                />
              ))
          )}
        </View>
      </ScrollView>

      {/* ── Barre d'actions ── */}
      <View
        style={[
          S.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 16) + 10 },
        ]}
      >
        <TouchableOpacity
          style={[S.testBtn, (isLoading || testLoading) && { opacity: 0.4 }]}
          onPress={handleTestImage}
          disabled={isLoading || testLoading}
          activeOpacity={0.8}
        >
          {testLoading ? (
            <ActivityIndicator size="small" color={C.purple} />
          ) : (
            <>
              <MaterialIcons name="photo-library" size={15} color={C.purple} />
              <Text style={S.testBtnText}>Tester</Text>
            </>
          )}
        </TouchableOpacity>

        {phase === "done" && (
          <TouchableOpacity
            style={S.resetBtn}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color={C.gray} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[S.analyzeBtn, isLoading && S.analyzeBtnDisabled]}
          onPress={handleAnalyze}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="biotech" size={20} color="#fff" />
              <Text style={S.analyzeBtnText}>
                {phase === "done" ? "Nouvelle analyse" : "Analyser"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((p) => ({ ...p, visible: false }))}
      />
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════════════

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.grayLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "800", color: C.textPrimary },
  headerSub: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.greenLight,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.greenMid,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.greenText,
    letterSpacing: 0.5,
  },

  scroll: { paddingTop: 12, paddingHorizontal: 12, gap: 10 },

  imageZone: {
    height: 210,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: C.greenMid,
    backgroundColor: C.greenLight,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  imageZoneFull: { borderStyle: "solid", borderColor: "transparent" },
  imagePlaceholder: { alignItems: "center", gap: 10, paddingHorizontal: 28 },
  imageIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.greenLight,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.textPrimary,
  },
  imagePlaceholderSub: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 12,
  },
  imagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  imagePillText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  phaseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  phaseStep: { alignItems: "center", gap: 5, flex: 1 },
  phaseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.grayLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: C.greenMid,
  },
  progressLabel: { fontSize: 11, color: C.textMuted },
  progressModel: {
    fontSize: 10,
    color: "#CBD5E1",
    marginTop: 5,
    textAlign: "center",
  },

  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  bannerTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  bannerDesc: { fontSize: 12, lineHeight: 18 },

  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 14,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  badgeText: { fontWeight: "700" },
  confText: { fontSize: 11, color: C.textMuted },

  diagBox: {
    backgroundColor: "#F8FAF6",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.greenMid,
    marginBottom: 18,
  },
  diagText: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 21,
    fontWeight: "500",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: C.textMuted,
  },

  detCard: { borderRadius: 14, backgroundColor: "#F8FAF6", overflow: "hidden" },
  detHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  detIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: C.textPrimary },
  detBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  detBadgeText: { fontSize: 10, fontWeight: "800" },
  detBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    gap: 6,
  },
  detNull: {
    fontSize: 11,
    color: "#CBD5E1",
    fontStyle: "italic",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  detRowText: {
    flex: 1,
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 18,
    fontWeight: "500",
  },

  comptageBox: {
    backgroundColor: C.blueLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 68,
  },
  comptageNum: {
    fontSize: 22,
    fontWeight: "800",
    color: C.blue,
    lineHeight: 26,
  },
  comptageSub: { fontSize: 9, fontWeight: "600", color: "#93C5FD" },
  fiabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  fiabText: { fontSize: 11, fontWeight: "700" },

  signesBox: { backgroundColor: C.white, borderRadius: 9, padding: 9 },
  signeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.red,
    marginTop: 5,
  },
  signeText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  vetBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.redLight,
    borderRadius: 9,
    padding: 8,
  },
  vetBadgeText: { fontSize: 12, fontWeight: "700", color: C.red },

  sensorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sensorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAF6",
    width: (width - 24 - 8 - 36) / 2,
  },
  sensorIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sensorVal: { fontSize: 15, fontWeight: "800", color: C.textPrimary },
  sensorUnit: { fontSize: 10, fontWeight: "600", color: C.textMuted },
  sensorLabel: {
    fontSize: 10,
    color: C.textSecondary,
    marginTop: 1,
    fontWeight: "600",
  },
  noSensor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAF6",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.border,
  },
  noSensorText: {
    fontSize: 12,
    color: C.textMuted,
    fontStyle: "italic",
    flex: 1,
  },

  adviceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: C.greenLight,
    borderRadius: 12,
    padding: 11,
  },
  adviceNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  adviceNumText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  adviceText: {
    flex: 1,
    fontSize: 13,
    color: C.greenText,
    lineHeight: 20,
    fontWeight: "500",
  },

  histItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAF6",
    marginBottom: 6,
  },
  histThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  histDate: { fontSize: 11, fontWeight: "600", color: C.textMuted },
  histScore: { fontSize: 13, fontWeight: "700", marginTop: 2 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.white,
    paddingHorizontal: 12,
    paddingTop: 12,
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 13,
    paddingHorizontal: 13,
    borderRadius: 14,
    backgroundColor: C.purpleLight,
    borderWidth: 1.5,
    borderColor: "#C4B5FD",
  },
  testBtnText: { fontSize: 12, fontWeight: "700", color: C.purple },
  resetBtn: {
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.grayLight,
  },
  analyzeBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.greenMid,
  },
  analyzeBtnDisabled: { backgroundColor: "#94A3B8" },
  analyzeBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
