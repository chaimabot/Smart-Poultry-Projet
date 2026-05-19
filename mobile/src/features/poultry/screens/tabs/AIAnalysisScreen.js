// screens/AIAnalysisScreen.js
// ─────────────────────────────────────────────────────────────────────────────
// CORRECTIONS v4 :
//   1. normalizeSensors : garde NaN + 30+ aliases backend
//   2. rawSensors lookup : 5 chemins de fallback (sensors/sensorData/result root)
//   3. isResultPoorImage : fallback texte diagnostic
//   4. imageQuality merge : préserve usable/score + lit depuis la racine
// ─────────────────────────────────────────────────────────────────────────────

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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import api from "../../../../services/api";
import Toast from "../../../../components/Toast";

const { width } = Dimensions.get("window");

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Détecte si le résultat correspond à une image inexploitable.
 * Couvre tous les shapes connus du backend + fallback texte diagnostic.
 */
function isResultPoorImage(result) {
  if (!result) return false;

  // 1. Flags booléens / statut explicite
  if (
    result.imageQuality?.status === "poor" ||
    result.imageUsable === false ||
    result.imageAvailable === false ||
    result.imageQuality?.usable === false ||
    result.result?.imageQuality?.status === "poor" ||
    result.result?.imageUsable === false
  )
    return true;

  // 2. Score imageQuality trop bas (< 30)
  const iqScore = result.imageQuality?.score;
  if (iqScore != null && Number(iqScore) < 30) return true;

  // 3. Fallback texte : le diagnostic mentionne explicitement l'image floue
  const diag =
    typeof result.diagnostic === "string"
      ? result.diagnostic.toLowerCase()
      : "";
  if (
    diag.includes("inexploitable") ||
    diag.includes("image floue") ||
    diag.includes("image trop floue") ||
    diag.includes("image non") ||
    diag.includes("sans image")
  )
    return true;

  return false;
}

/**
 * Normalise l'objet capteurs brut du backend vers la shape canonique
 * attendue par SensorsSection.
 *   Garde NaN, couvre 30+ alias de noms de champs backend.
 */
function normalizeSensors(raw) {
  if (!raw || typeof raw !== "object") return null;

  // Cherche la première clé valide et retourne un Number propre
  const pick = (...keys) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== null && v !== undefined) {
        const n = Number(v);
        if (!isNaN(n)) return n; //   garde NaN
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
      "ambientTemp",
      "ambient_temp",
    ),
    humidity: pick(
      "humidity",
      "humidite",
      "hum",
      "Humidity",
      "humidityPercent",
      "humidity_percent",
      "relativeHumidity",
      "relative_humidity",
    ),
    waterLevel: pick(
      "waterLevel",
      "water_level",
      "waterLevelPercent",
      "water_level_percent",
      "water",
      "WaterLevel",
      "waterLvl",
      "water_lvl",
      "niveauEau",
      "niveau_eau",
      "waterPercent",
      "water_percent",
    ),
    airQualityPercent: pick(
      "airQualityPercent",
      "air_quality",
      "airQuality",
      "air",
      "AirQuality",
      "air_quality_percent",
      "airIndex",
      "air_index",
      "iaq",
      "IAQ",
    ),
    co2: pick(
      "co2",
      "CO2",
      "co2_ppm",
      "co2Ppm",
      "carbonDioxide",
      "carbon_dioxide",
    ),
    nh3: pick("nh3", "NH3", "ammonia", "nh3_ppm", "ammoniac", "nh3Ppm"),
  };

  const hasAny = Object.values(normalized).some((v) => v !== undefined);
  return hasAny ? normalized : null;
}

/**
 * Extrait l'objet capteurs brut depuis toutes les shapes connues du backend.
 * Retourne le premier objet non-vide trouvé.
 */
function extractRawSensors(source) {
  if (!source) return null;

  // Helpers
  const notEmpty = (obj) =>
    obj && typeof obj === "object" && Object.keys(obj).length > 0;

  // 1. source.sensors
  if (notEmpty(source.sensors)) return source.sensors;

  // 2. source.sensorData
  if (notEmpty(source.sensorData)) return source.sensorData;

  // 3. source.result.sensors
  if (notEmpty(source.result?.sensors)) return source.result.sensors;

  // 4. source.result.sensorData
  if (notEmpty(source.result?.sensorData)) return source.result.sensorData;

  // 5. source.analysis.sensors
  if (notEmpty(source.analysis?.sensors)) return source.analysis.sensors;

  // 6. source.analysis.sensorData
  if (notEmpty(source.analysis?.sensorData)) return source.analysis.sensorData;

  // 7. Les valeurs capteurs sont directement sur source.result (root flat)
  if (
    hasSensorValue(source.result?.waterLevel) ||
    hasSensorValue(source.result?.temperature) ||
    hasSensorValue(source.result?.humidity) ||
    hasSensorValue(source.result?.water_level) ||
    hasSensorValue(source.result?.waterLevelPercent)
  )
    return source.result;

  // 8. Les valeurs capteurs sont directement sur source (root flat)
  if (
    hasSensorValue(source.waterLevel) ||
    hasSensorValue(source.temperature) ||
    hasSensorValue(source.humidity) ||
    hasSensorValue(source.water_level) ||
    hasSensorValue(source.waterLevelPercent)
  )
    return source;

  return null;
}

// Vérifie si une valeur capteur est réellement disponible
function hasSensorValue(value) {
  return value !== null && value !== undefined && !isNaN(Number(value));
}

// ─── Score Circle ────────────────────────────────────────────────────────────

function ScoreCircle({ score, size = 88, dimmed = false }) {
  const isUnknown = score === null || score === undefined;
  const color =
    isUnknown || dimmed
      ? "#94A3B8"
      : score >= 70
        ? "#22C55E"
        : score >= 40
          ? "#F59E0B"
          : "#EF4444";

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
          borderColor: "#F1F5F9",
          position: "absolute",
        }}
      />
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
          opacity: isUnknown ? 0 : 1,
        }}
      />
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        <Text
          style={{ fontSize: 26, fontWeight: "800", color, lineHeight: 30 }}
        >
          {isUnknown ? "—" : score}
        </Text>
        <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "600" }}>
          {isUnknown ? "inconnu" : dimmed ? "capteurs" : "/ 100"}
        </Text>
      </View>
    </View>
  );
}

// ─── Urgency Badge ───────────────────────────────────────────────────────────

function UrgencyBadge({ level }) {
  const isUnknown = !level || level === "inconnu";
  const config = isUnknown
    ? {
        bg: "#F1F5F9",
        color: "#64748B",
        icon: "help-outline",
        label: "INCONNU",
      }
    : level === "critique"
      ? { bg: "#FEF2F2", color: "#EF4444", icon: "error", label: "CRITIQUE" }
      : level === "attention"
        ? {
            bg: "#FEF3C7",
            color: "#F59E0B",
            icon: "warning",
            label: "ATTENTION",
          }
        : {
            bg: "#F0FDF4",
            color: "#22C55E",
            icon: "check-circle",
            label: "NORMAL",
          };

  return (
    <View style={[styles.urgencyBadge, { backgroundColor: config.bg }]}>
      <MaterialIcons name={config.icon} size={14} color={config.color} />
      <Text style={[styles.urgencyBadgeText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

// ─── Detection Row ───────────────────────────────────────────────────────────

function DetectionRow({ icon, label, desc, value, isMortality = false }) {
  const isNull = value === null || value === undefined;
  const ok = isNull ? null : isMortality ? !value : value;
  const color = isNull ? "#94A3B8" : ok ? "#22C55E" : "#EF4444";
  const bg = isNull ? "#F8FAFC" : ok ? "#F0FDF4" : "#FEF2F2";
  const badgeLabel = isNull ? "N/A" : ok ? "OK" : "ALERTE";

  return (
    <View style={[styles.detectionRow, { opacity: isNull ? 0.55 : 1 }]}>
      <View style={[styles.detectionIcon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={19} color={color} />
      </View>
      <View style={styles.detectionContent}>
        <View style={styles.detectionTopRow}>
          <Text style={[styles.detectionName, isNull && { color: "#94A3B8" }]}>
            {label}
          </Text>
          <View style={[styles.detectionBadge, { backgroundColor: bg }]}>
            <Text style={[styles.detectionBadgeText, { color }]}>
              {badgeLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.detectionDesc}>{desc}</Text>
        {isNull && (
          <Text style={styles.detectionNa}>
            Non évalué — image indisponible
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Sensor Card ─────────────────────────────────────────────────────────────

function SensorCard({
  icon,
  label,
  value,
  unit,
  color = "#22C55E",
  alert = false,
}) {
  const bg = alert ? color + "18" : color + "12";
  return (
    <View
      style={[
        styles.sensorCard,
        alert && { borderWidth: 1, borderColor: color + "60" },
      ]}
    >
      <View style={[styles.sensorCardIcon, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <View style={styles.sensorCardBody}>
        <Text
          style={[styles.sensorCardValue, { color: alert ? color : "#1E293B" }]}
        >
          {value}
          <Text style={styles.sensorCardUnit}> {unit}</Text>
        </Text>
        <Text style={styles.sensorCardLabel}>{label}</Text>
      </View>
      {alert && (
        <MaterialIcons
          name="warning"
          size={14}
          color={color}
          style={{ marginLeft: "auto" }}
        />
      )}
    </View>
  );
}

// ─── Sensors Section ─────────────────────────────────────────────────────────

function SensorsSection({ sensors, thresholds }) {
  if (!sensors) {
    return (
      <View style={styles.noSensorBox}>
        <MaterialIcons name="sensors-off" size={18} color="#94A3B8" />
        <Text style={styles.noSensorText}>
          Capteurs non connectés — aucune donnée disponible
        </Text>
      </View>
    );
  }

  const rows = [];

  if (hasSensorValue(sensors.temperature)) {
    const thresh = thresholds?.tempMax ?? 30;
    const alert = sensors.temperature > thresh;
    rows.push(
      <SensorCard
        key="temp"
        icon="thermostat"
        label="Température"
        value={`${Number(sensors.temperature).toFixed(1)}`}
        unit="°C"
        color={alert ? "#EF4444" : "#F97316"}
        alert={alert}
      />,
    );
  }

  if (hasSensorValue(sensors.humidity)) {
    const thresh = thresholds?.humidityMax ?? 75;
    const alert = sensors.humidity > thresh;
    rows.push(
      <SensorCard
        key="hum"
        icon="water-drop"
        label="Humidité"
        value={`${Number(sensors.humidity).toFixed(0)}`}
        unit="%"
        color={alert ? "#EF4444" : "#3B82F6"}
        alert={alert}
      />,
    );
  }

  if (hasSensorValue(sensors.waterLevel)) {
    const alert = sensors.waterLevel < 20;
    rows.push(
      <SensorCard
        key="water"
        icon="local-drink"
        label="Niveau d'eau"
        value={`${Number(sensors.waterLevel).toFixed(0)}`}
        unit="%"
        color={
          alert ? "#EF4444" : sensors.waterLevel < 40 ? "#F59E0B" : "#22C55E"
        }
        alert={alert}
      />,
    );
  }

  if (hasSensorValue(sensors.airQualityPercent)) {
    const thresh = thresholds?.airQualityMin ?? 50;
    const alert = sensors.airQualityPercent < thresh;
    rows.push(
      <SensorCard
        key="air"
        icon="air"
        label="Qualité de l'air"
        value={`${Number(sensors.airQualityPercent).toFixed(0)}`}
        unit="%"
        color={alert ? "#EF4444" : "#8B5CF6"}
        alert={alert}
      />,
    );
  }

  if (hasSensorValue(sensors.co2)) {
    const alert = sensors.co2 > 3000;
    rows.push(
      <SensorCard
        key="co2"
        icon="cloud"
        label="CO₂"
        value={`${Math.round(sensors.co2)}`}
        unit="ppm"
        color={alert ? "#EF4444" : "#6B7280"}
        alert={alert}
      />,
    );
  }

  if (hasSensorValue(sensors.nh3)) {
    const alert = sensors.nh3 > 25;
    rows.push(
      <SensorCard
        key="nh3"
        icon="science"
        label="Ammoniac (NH₃)"
        value={`${Number(sensors.nh3).toFixed(1)}`}
        unit="ppm"
        color={alert ? "#EF4444" : "#F59E0B"}
        alert={alert}
      />,
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.noSensorBox}>
        <MaterialIcons name="sensors-off" size={18} color="#94A3B8" />
        <Text style={styles.noSensorText}>
          Capteurs non connectés — aucune donnée disponible
        </Text>
      </View>
    );
  }

  return <View style={styles.sensorGrid}>{rows}</View>;
}

// ─── Advice Item ─────────────────────────────────────────────────────────────

function AdviceItem({ text, index }) {
  return (
    <View style={styles.adviceItem}>
      <View style={styles.adviceNumber}>
        <Text style={styles.adviceNumberText}>{index + 1}</Text>
      </View>
      <Text style={styles.adviceText}>{text}</Text>
    </View>
  );
}

// ─── History Item ────────────────────────────────────────────────────────────

function HistoryItem({ item, onPress }) {
  const urgency = item.result?.urgencyLevel;
  const score = item.result?.healthScore; //   peut être null

  const color =
    urgency === "critique"
      ? "#EF4444"
      : urgency === "attention"
        ? "#F59E0B"
        : urgency === "inconnu"
          ? "#94A3B8"
          : "#22C55E";

  const label =
    urgency === "critique"
      ? "Critique"
      : urgency === "attention"
        ? "Attention"
        : urgency === "inconnu"
          ? "Inconnu"
          : "Normal";

  const poor = isResultPoorImage(item);

  const date = new Date(item.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  //   Affiche "—" si score null, sinon "70/100"
  const scoreText =
    score !== null && score !== undefined ? `${score}/100` : "—";

  return (
    <TouchableOpacity
      style={styles.historyItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.historyThumb}>
        {item.image?.url ? (
          <Image
            source={{ uri: item.image.thumbnailUrl || item.image.url }}
            style={[
              { width: 48, height: 48, borderRadius: 12 },
              poor && { opacity: 0.4 },
            ]}
            resizeMode="cover"
          />
        ) : (
          <MaterialIcons name="image-not-supported" size={20} color="#94A3B8" />
        )}
        {poor && (
          <View style={styles.historyThumbBadge}>
            <MaterialIcons name="blur-on" size={10} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyDate}>{date}</Text>
        {/*   scoreText jamais vide */}
        <Text style={[styles.historyScore, { color }]}>
          {scoreText} — {label}
          {poor ? " (sans image)" : ""}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

// ─── Phase Step Indicator ────────────────────────────────────────────────────

function PhaseSteps({ currentPhase }) {
  const steps = [
    {
      key: "capturing",
      icon: "settings-remote",
      label: "Déclenchement caméra",
    },
    { key: "uploading", icon: "cloud-upload", label: "Envoi de la photo" },
    { key: "analyzing", icon: "biotech", label: "Analyse IA en cours" },
  ];

  const phaseOrder = ["capturing", "uploading", "analyzing"];
  const currentIdx = phaseOrder.indexOf(currentPhase);

  return (
    <View style={styles.phaseSteps}>
      {steps.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const color = done ? "#22C55E" : active ? "#3B82F6" : "#CBD5E1";
        return (
          <View key={step.key} style={styles.phaseStep}>
            <View
              style={[
                styles.phaseStepIcon,
                {
                  backgroundColor: done
                    ? "#F0FDF4"
                    : active
                      ? "#EFF6FF"
                      : "#F8FAFC",
                  borderWidth: active ? 2 : 1,
                  borderColor: color,
                },
              ]}
            >
              {done ? (
                <MaterialIcons name="check" size={14} color="#22C55E" />
              ) : (
                <MaterialIcons name={step.icon} size={14} color={color} />
              )}
            </View>
            <Text
              style={[
                styles.phaseStepLabel,
                { color: active ? "#1E293B" : done ? "#22C55E" : "#94A3B8" },
              ]}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function AIAnalysisScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route?.params || {};
  const poultryId = params.poultryId || params.poulaillerId;
  const poultryName = params.poultryName || params.poulaillerName;
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState("idle");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [imageUri, setImageUri] = useState(null);
  const [result, setResult] = useState(null);
  const [sensors, setSensors] = useState(null);
  const [history, setHistory] = useState([]);
  const [progress, setProgress] = useState(0);
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
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, []);

  useEffect(() => {
    if (!poultryId) return;
    loadHistory();
    loadLatestAnalysis();
  }, [poultryId]);

  // ── loadHistory ────────────────────────────────────────────────────────────

  const loadHistory = async () => {
    if (!poultryId) return;
    try {
      const res = await api.get(`/ai/history/${poultryId}`);
      if (res.data?.success && isMountedRef.current)
        setHistory(res.data.data || []);
    } catch (e) {
      console.warn("[AI] Erreur historique:", e.message);
    }
  };

  // ── loadLatestAnalysis ─────────────────────────────────────────────────────

  const loadLatestAnalysis = async () => {
    if (!poultryId) return;
    try {
      const res = await api.get(`/ai/latest/${poultryId}`);
      if (res.data?.success && res.data.data && isMountedRef.current) {
        const latest = res.data.data;

        //   Merge imageQuality depuis la racine ET depuis result
        const rootIQ = latest.imageQuality || {};
        const resultIQ = latest.result?.imageQuality || {};
        const mergedIQ = {
          ...resultIQ,
          ...rootIQ,
          status:
            rootIQ.status === "poor" || resultIQ.status === "poor"
              ? "poor"
              : rootIQ.status || resultIQ.status || "unknown",
          usable: rootIQ.usable !== undefined ? rootIQ.usable : resultIQ.usable,
          score: rootIQ.score !== undefined ? rootIQ.score : resultIQ.score,
        };

        setResult({
          ...latest.result,
          imageQuality: mergedIQ,
          imageUsable:
            latest.imageUsable !== undefined
              ? latest.imageUsable
              : latest.result?.imageUsable,
          imageAvailable:
            latest.imageAvailable !== undefined
              ? latest.imageAvailable
              : latest.result?.imageAvailable,
        });

        //   Extraction multi-chemins + normalisation des noms de champs
        const rawSensors = extractRawSensors(latest);
        console.log("[AI] rawSensors:", JSON.stringify(rawSensors, null, 2));
        console.log("[AI] normalized:", normalizeSensors(rawSensors));
        setSensors(normalizeSensors(rawSensors));

        if (latest.image?.url) setImageUri(latest.image.url);
        setPhase("done");
        fadeAnim.setValue(1);
      }
    } catch (e) {
      console.warn("[AI] Erreur dernière analyse:", e.message);
    }
  };

  // ── stopPolling ────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ visible: true, message, type });
  }, []);

  // ── startPolling ───────────────────────────────────────────────────────────

  const startPolling = useCallback(
    (requestId) => {
      setPhase("capturing");
      setPhaseLabel("Attente de l'image ESP32...");

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
            "La caméra n'a pas répondu (90s). Vérifiez la connexion et réessayez.",
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
          const statusData = statusRes.data?.data;
          if (!statusData) return;

          const phaseMap = {
            pending: {
              phase: "capturing",
              label: "Attente de l'image ESP32...",
            },
            capturing: {
              phase: "capturing",
              label: "La caméra prend la photo...",
            },
            uploading: {
              phase: "uploading",
              label: "Envoi de la photo vers le cloud...",
            },
            analyzing: {
              phase: "analyzing",
              label: "Analyse IA en cours (Gemma 3)...",
            },
          };
          if (phaseMap[statusData.status] && isMountedRef.current) {
            setPhase(phaseMap[statusData.status].phase);
            setPhaseLabel(phaseMap[statusData.status].label);
          }

          if (statusData.status === "completed") {
            stopPolling();
            if (!isMountedRef.current) return;

            setProgress(100);
            if (statusData.imageUrl) setImageUri(statusData.imageUrl);

            if (statusData.analysis) {
              //   Merge imageQuality
              const aIQ = statusData.analysis?.imageQuality || {};
              const sIQ = statusData.imageQuality || {};
              const mergedIQ = {
                ...aIQ,
                ...sIQ,
                status:
                  sIQ.status === "poor" || aIQ.status === "poor"
                    ? "poor"
                    : !statusData.imageUrl
                      ? "poor"
                      : sIQ.status || aIQ.status || "optimized",
                usable: sIQ.usable !== undefined ? sIQ.usable : aIQ.usable,
                score: sIQ.score !== undefined ? sIQ.score : aIQ.score,
              };
              setResult({
                ...statusData.analysis,
                imageQuality: mergedIQ,
                imageUsable:
                  statusData.imageUsable !== undefined
                    ? statusData.imageUsable
                    : statusData.analysis?.imageUsable,
                imageAvailable:
                  statusData.imageAvailable !== undefined
                    ? statusData.imageAvailable
                    : statusData.analysis?.imageAvailable,
              });
            }

            //   Extraction multi-chemins + normalisation
            const rawSensors = extractRawSensors(statusData);
            console.log(
              "[AI] rawSensors (poll):",
              JSON.stringify(rawSensors, null, 2),
            );
            setSensors(normalizeSensors(rawSensors));

            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start();
            setPhase("done");
            setPhaseLabel("");

            const poor =
              !statusData.imageUrl ||
              statusData.imageQuality?.status === "poor";
            showToast(
              poor
                ? `Analyse terminée — image floue. Score : ${statusData.analysis?.healthScore ?? "—"}/100`
                : `Analyse terminée — Score : ${statusData.analysis?.healthScore ?? "—"}/100`,
              poor ? "warn" : "success",
            );
            loadHistory();
          } else if (statusData.status === "failed") {
            stopPolling();
            if (isMountedRef.current) {
              setPhase("idle");
              setPhaseLabel("");
              showToast(statusRes.data?.error || "Analyse échouée", "error");
            }
          }
        } catch (err) {
          const httpStatus = err.response?.status;
          if (httpStatus === 404) {
            stopPolling();
            if (isMountedRef.current) {
              setPhase("idle");
              setPhaseLabel("");
              showToast("Session expirée. Relancez l'analyse.", "error");
            }
            return;
          }
          if (httpStatus === 500) {
            stopPolling();
            if (isMountedRef.current) {
              setPhase("idle");
              setPhaseLabel("");
              showToast(err.response?.data?.error || "Erreur serveur", "error");
            }
            return;
          }
          console.warn("[AI] Erreur polling réseau:", err.message);
        }
      }, 2000);
    },
    [stopPolling, fadeAnim, progressAnim, showToast],
  );

  // ── handleAnalyze ──────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (phase === "capturing" || phase === "uploading" || phase === "analyzing")
      return;

    stopPolling();
    fadeAnim.setValue(0);
    progressAnim.setValue(0);
    setProgress(0);
    setResult(null);
    setSensors(null);

    setPhase("capturing");
    setPhaseLabel("Envoi de la commande à la caméra...");
    showToast("Commande envoyée à la caméra ESP32...", "info");

    try {
      const captureRes = await api.post(`/ai/capture/${poultryId}`);
      if (!captureRes.data?.success)
        throw new Error(
          captureRes.data?.error || "Erreur déclenchement capture",
        );

      const requestId = captureRes.data.data?.requestId;
      const mqttSent = captureRes.data.data?.mqttSent;
      const cameraMac = captureRes.data.data?.cameraMac;

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
          ? "Caméra déclenchée — attente de la photo..."
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

  // ── handleReset ────────────────────────────────────────────────────────────

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

  const isLoading =
    phase === "capturing" || phase === "uploading" || phase === "analyzing";
  const poorImage = result ? isResultPoorImage(result) : false;
  const detections = result?.detections || {};

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Analyse IA — Santé</Text>
          {poultryName && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {poultryName}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.liveBadge,
            isLoading && { backgroundColor: "#FEF3C7" },
          ]}
        >
          <View
            style={[
              styles.liveDot,
              isLoading && { backgroundColor: "#F59E0B" },
            ]}
          />
          <Text style={[styles.liveText, isLoading && { color: "#92400E" }]}>
            {isLoading ? "EN COURS" : "ACTIF"}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 100 + Math.max(insets.bottom, 0) },
        ]}
      >
        {/* ── Zone image ── */}
        <View style={[styles.imageZone, imageUri && styles.imageZoneHasImage]}>
          {phase === "capturing" ? (
            <View style={styles.capturingOverlay}>
              <View style={styles.capturingIconWrap}>
                <MaterialIcons
                  name="settings-remote"
                  size={28}
                  color="#22C55E"
                />
              </View>
              <Text style={styles.capturingTitle}>Déclenchement caméra</Text>
              <Text style={styles.capturingHint}>
                La caméra va prendre une photo du poulailler
              </Text>
            </View>
          ) : imageUri ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={[StyleSheet.absoluteFill, poorImage && { opacity: 0.4 }]}
                resizeMode="cover"
              />
              {poorImage && (
                <View style={styles.poorImageOverlay}>
                  <MaterialIcons name="blur-on" size={28} color="#fff" />
                  <Text style={styles.poorImageText}>
                    Image floue — non exploitable
                  </Text>
                </View>
              )}
              <View style={styles.imageOverlay}>
                <View style={styles.imageOverlayTop}>
                  <View style={styles.imageBadge}>
                    <MaterialIcons name="camera-alt" size={11} color="#fff" />
                    <Text style={styles.imageBadgeText}>ESP32CAM</Text>
                  </View>
                  {result && (
                    <View
                      style={[
                        styles.imageBadge,
                        {
                          backgroundColor: poorImage
                            ? "rgba(100,116,139,0.85)"
                            : result.urgencyLevel === "critique"
                              ? "rgba(239,68,68,0.9)"
                              : result.urgencyLevel === "attention"
                                ? "rgba(245,158,11,0.9)"
                                : "rgba(34,197,94,0.9)",
                        },
                      ]}
                    >
                      <Text style={styles.imageBadgeText}>
                        {result.healthScore}/100{poorImage ? " ⚠" : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.imagePlaceholder}>
              <View style={styles.imageIconWrap}>
                <MaterialIcons name="camera-alt" size={30} color="#22C55E" />
              </View>
              <Text style={styles.imageHint}>
                Appuyez sur{" "}
                <Text style={styles.imageHintHighlight}>Analyser</Text>
                {"\n"}pour déclencher la caméra et obtenir un diagnostic
              </Text>
            </View>
          )}
        </View>

        {/* ── Progression analyse ── */}
        {isLoading && (
          <View style={styles.progressCard}>
            <PhaseSteps currentPhase={phase} />
            <View style={styles.progressBarBg}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>
                {phaseLabel || "Analyse en cours..."}
              </Text>
              <Text style={styles.progressPct}>{progress}%</Text>
            </View>
            <Text style={styles.progressModel}>Gemma 3 · Cloudflare AI</Text>
          </View>
        )}

        {/* ── Résultat ── */}
        {phase === "done" && result && (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Bannière image floue */}
            {poorImage && (
              <View style={styles.poorBanner}>
                <MaterialIcons name="camera-roll" size={18} color="#92400E" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.poorBannerTitle}>
                    Image inexploitable
                  </Text>
                  <Text style={styles.poorBannerDesc}>
                    Photo trop floue ou trop sombre. Le bilan est basé
                    uniquement sur les capteurs disponibles.
                  </Text>
                </View>
              </View>
            )}

            {/* Bannière aucune donnée */}
            {result.urgencyLevel === "inconnu" && (
              <View style={styles.unknownBanner}>
                <MaterialIcons name="sensors-off" size={18} color="#64748B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unknownBannerTitle}>
                    Aucune donnée disponible
                  </Text>
                  <Text style={styles.unknownBannerDesc}>
                    Capteurs non connectés et image inexploitable. Vérifiez vos
                    équipements.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Carte principale ── */}
            <View style={styles.resultCard}>
              {/* Score + Urgence */}
              <View style={styles.scoreRow}>
                <ScoreCircle
                  score={result.healthScore}
                  size={88}
                  dimmed={
                    result.healthScore === null ||
                    result.healthScore === undefined ||
                    poorImage ||
                    result.urgencyLevel === "inconnu"
                  }
                />
                <View style={styles.scoreInfo}>
                  <UrgencyBadge level={result.urgencyLevel} />
                  {result.confidence != null && (
                    <Text style={styles.confidenceText}>
                      Confiance : {result.confidence}%
                      {poorImage ? " (capteurs)" : ""}
                    </Text>
                  )}
                  <View style={styles.imageQualityRow}>
                    <MaterialIcons
                      name={poorImage ? "broken-image" : "photo-camera"}
                      size={12}
                      color={poorImage ? "#F59E0B" : "#94A3B8"}
                    />
                    <Text
                      style={[
                        styles.imageQualityText,
                        poorImage && { color: "#F59E0B" },
                      ]}
                    >
                      {poorImage ? "Sans image" : "Image analysée"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Diagnostic */}
              <View style={styles.diagnosticBox}>
                <Text style={styles.diagnosticText}>{result.diagnostic}</Text>
              </View>

              {/* ── Détections visuelles ── */}
              <View style={styles.sectionHeader}>
                <MaterialIcons name="search" size={15} color="#94A3B8" />
                <Text style={styles.sectionLabel}>Détections visuelles</Text>
              </View>

              {poorImage && (
                <View style={styles.unavailableRow}>
                  <MaterialIcons
                    name="visibility-off"
                    size={15}
                    color="#94A3B8"
                  />
                  <Text style={styles.unavailableText}>
                    Impossible sans image exploitable — relancez l'analyse
                  </Text>
                </View>
              )}

              <View style={styles.detectionList}>
                <DetectionRow
                  icon="psychology"
                  label="Comportement"
                  desc="Activité et posture des volailles"
                  value={poorImage ? null : detections.behaviorNormal}
                />
                <DetectionRow
                  icon="favorite"
                  label="Mortalité"
                  desc="Présence de cadavres dans l'image"
                  value={poorImage ? null : detections.mortalityDetected}
                  isMortality
                />
                <DetectionRow
                  icon="group"
                  label="Densité"
                  desc="Répartition des volailles au m²"
                  value={poorImage ? null : detections.densityOk}
                />
                <DetectionRow
                  icon="cleaning-services"
                  label="Litière"
                  desc="État et propreté de la litière"
                  value={poorImage ? null : detections.cleanEnvironment}
                />
                <DetectionRow
                  icon="air"
                  label="Ventilation"
                  desc="Circulation d'air visible"
                  value={poorImage ? null : detections.ventilationAdequate}
                />
              </View>

              {/* ── Capteurs ── */}
              <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                <MaterialIcons name="device-hub" size={15} color="#94A3B8" />
                <Text style={styles.sectionLabel}>Données capteurs</Text>
              </View>

              <SensorsSection
                sensors={sensors}
                thresholds={result?.thresholds}
              />

              {/* ── Recommandations ── */}
              {(result.advices || []).length > 0 &&
                !(poorImage && result.urgencyLevel === "inconnu") && (
                  <>
                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                      <MaterialIcons
                        name="lightbulb"
                        size={15}
                        color="#94A3B8"
                      />
                      <Text style={styles.sectionLabel}>Recommandations</Text>
                    </View>
                    <View style={styles.adviceList}>
                      {(result.advices || []).map((advice, i) => (
                        <AdviceItem key={i} text={advice} index={i} />
                      ))}
                    </View>
                  </>
                )}

              {/* CTA relancer si image floue */}
              {poorImage && (
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={handleAnalyze}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="camera-alt" size={16} color="#fff" />
                  <Text style={styles.retryBtnText}>
                    Relancer avec une nouvelle photo
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── État initial (idle sans résultat) ── */}
        {phase === "idle" && !result && (
          <View style={styles.idleCard}>
            <View style={styles.idleIconWrap}>
              <MaterialIcons name="biotech" size={32} color="#22C55E" />
            </View>
            <Text style={styles.idleTitle}>Prêt à analyser</Text>
            <Text style={styles.idleDesc}>
              L'IA va déclencher la caméra, prendre une photo et analyser l'état
              de santé de votre troupeau en quelques secondes.
            </Text>
          </View>
        )}

        {/* ── Historique ── */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View style={styles.historyTitleRow}>
              <MaterialIcons name="history" size={18} color="#1E293B" />
              <Text style={styles.historyTitle}>Historique</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate("AIHistory", { poultryId })}
            >
              <Text style={styles.historyLink}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <Text style={styles.historyEmpty}>
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

      {/* ── Barre de boutons ── */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={goToChat}
          activeOpacity={0.7}
        >
          <MaterialIcons name="chat" size={18} color="#475569" />
          <Text style={styles.chatBtnText}>Chat IA</Text>
        </TouchableOpacity>

        {phase === "done" && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color="#475569" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.analyzeBtn, isLoading && styles.analyzeBtnDisabled]}
          onPress={handleAnalyze}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="biotech" size={20} color="#fff" />
              <Text style={styles.analyzeBtnText}>
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAF9" },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
    lineHeight: 20,
  },
  headerSub: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#F0FDF4",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#16A34A",
    letterSpacing: 0.5,
  },

  scrollContent: { paddingTop: 12 },

  // ── Image zone
  imageZone: {
    marginHorizontal: 12,
    marginBottom: 12,
    height: 220,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#22C55E",
    backgroundColor: "#F0FDF4",
    overflow: "hidden",
  },
  imageZoneHasImage: { borderStyle: "solid", borderColor: "transparent" },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  imageIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#22C55E15",
    alignItems: "center",
    justifyContent: "center",
  },
  imageHint: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  imageHintHighlight: { color: "#22C55E", fontWeight: "700" },
  capturingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  capturingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F0FDF4",
    borderWidth: 2,
    borderColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  capturingTitle: { fontSize: 15, fontWeight: "700", color: "#22C55E" },
  capturingHint: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  poorImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  poorImageText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 12,
  },
  imageOverlayTop: { flexDirection: "row", justifyContent: "space-between" },
  imageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  imageBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  // ── Progress
  progressCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  phaseSteps: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  phaseStep: { alignItems: "center", gap: 6, flex: 1 },
  phaseStepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseStepLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: { fontSize: 11, color: "#64748B", flex: 1 },
  progressPct: { fontSize: 12, fontWeight: "700", color: "#22C55E" },
  progressModel: {
    fontSize: 10,
    color: "#CBD5E1",
    marginTop: 6,
    textAlign: "center",
  },

  // ── Banners
  poorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  poorBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 2,
  },
  poorBannerDesc: { fontSize: 12, color: "#92400E", lineHeight: 18 },
  unknownBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  unknownBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 2,
  },
  unknownBannerDesc: { fontSize: 12, color: "#64748B", lineHeight: 18 },

  // ── Result card
  resultCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── Score
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 16,
  },
  scoreInfo: { flex: 1, gap: 6 },
  urgencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  urgencyBadgeText: { fontSize: 12, fontWeight: "700" },
  confidenceText: { fontSize: 11, color: "#94A3B8" },
  imageQualityRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  imageQualityText: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },

  // ── Diagnostic
  diagnosticBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#22C55E",
    marginBottom: 18,
  },
  diagnosticText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 21,
    fontWeight: "500",
  },

  // ── Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    color: "#94A3B8",
  },

  // ── Detections
  detectionList: { gap: 8 },
  detectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  detectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detectionContent: { flex: 1 },
  detectionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  detectionName: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  detectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detectionBadgeText: { fontSize: 10, fontWeight: "800" },
  detectionDesc: { fontSize: 11, color: "#94A3B8" },
  detectionNa: {
    fontSize: 11,
    color: "#CBD5E1",
    fontStyle: "italic",
    marginTop: 3,
  },

  unavailableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  unavailableText: { fontSize: 12, color: "#94A3B8", fontWeight: "600" },

  // ── Sensors
  sensorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sensorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    width: (width - 24 - 8 - 40) / 2,
  },
  sensorCardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sensorCardBody: { flex: 1 },
  sensorCardValue: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  sensorCardUnit: { fontSize: 10, fontWeight: "600", color: "#94A3B8" },
  sensorCardLabel: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
    fontWeight: "600",
  },
  noSensorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#E2E8F0",
  },
  noSensorText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    flex: 1,
    lineHeight: 18,
  },

  // ── Advices
  adviceList: { gap: 7 },
  adviceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
  },
  adviceNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  adviceNumberText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  adviceText: {
    flex: 1,
    fontSize: 13,
    color: "#166534",
    lineHeight: 20,
    fontWeight: "500",
  },

  // ── Retry button
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#22C55E",
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 16,
  },
  retryBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // ── Idle state
  idleCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  idleIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  idleTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  idleDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },

  // ── History
  historyCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  historyTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  historyTitle: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  historyLink: { fontSize: 13, fontWeight: "700", color: "#22C55E" },
  historyEmpty: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    marginBottom: 7,
  },
  historyThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  historyThumbBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: { flex: 1 },
  historyDate: { fontSize: 11, fontWeight: "600", color: "#94A3B8" },
  historyScore: { fontSize: 13, fontWeight: "700", marginTop: 2 },

  // ── Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 12,
    flexDirection: "row",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
  },
  chatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  chatBtnText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  resetBtn: {
    width: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  analyzeBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#22C55E",
  },
  analyzeBtnDisabled: { backgroundColor: "#94A3B8" },
  analyzeBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
