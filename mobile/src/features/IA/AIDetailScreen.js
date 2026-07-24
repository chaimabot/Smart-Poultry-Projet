// screens/ai/AIDetailScreen.js
// Détail complet d'une analyse — cohérent avec AIAnalysisScreen & AIHistoryScreen

import React, { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Dimensions,
  Share,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

const { width } = Dimensions.get("window");

// ─── Couleurs (miroir de AIAnalysisScreen) ────────────────────────────────────

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

function hasSensorValue(v) {
  return v !== null && v !== undefined && !isNaN(Number(v));
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
  const out = {
    temperature: pick("temperature", "temp", "Temperature", "temperatureC"),
    humidity: pick("humidity", "humidite", "hum", "Humidity"),
    waterLevel: pick("waterLevel", "water_level", "waterLevelPercent", "niveauEau"),
    airQualityPercent: pick("airQualityPercent", "air_quality", "airQuality", "iaq"),
    co2: pick("co2", "CO2", "co2_ppm"),
    nh3: pick("nh3", "NH3", "ammonia"),
  };
  return Object.values(out).some((v) => v !== undefined) ? out : null;
}

function extractRawSensors(source) {
  if (!source) return null;
  const notEmpty = (obj) => obj && typeof obj === "object" && Object.keys(obj).length > 0;
  if (notEmpty(source.sensors)) return source.sensors;
  if (notEmpty(source.result?.sensors)) return source.result.sensors;
  if (notEmpty(source.sensorData)) return source.sensorData;
  if (notEmpty(source.result?.sensorData)) return source.result.sensorData;
  if (
    hasSensorValue(source.result?.waterLevel) ||
    hasSensorValue(source.result?.temperature) ||
    hasSensorValue(source.result?.humidity)
  )
    return source.result;
  return null;
}

function urgencyConfig(level) {
  if (level === "critique")
    return {
      color: C.red,
      darkColor: "#A32D2D",
      bg: C.redLight,
      diagBg: "#FFF5F5",
      textColor: C.redText,
      accent: "#EF4444",
      label: "Critique",
      labelLong: "Intervention urgente",
      icon: "error",
    };
  if (level === "attention")
    return {
      color: C.amber,
      darkColor: "#854F0B",
      bg: C.amberLight,
      diagBg: "#FFFBF2",
      textColor: C.amberText,
      accent: "#F59E0B",
      label: "Attention",
      labelLong: "Surveillance renforcée",
      icon: "warning",
    };
  if (level === "normal")
    return {
      color: C.green,
      darkColor: C.green,
      bg: C.greenLight,
      diagBg: "#F8FAF6",
      textColor: C.greenText,
      accent: C.greenMid,
      label: "Normal",
      labelLong: "Tout va bien",
      icon: "check-circle",
    };
  return {
    color: C.gray,
    darkColor: "#475569",
    bg: C.grayLight,
    diagBg: "#F8FAFC",
    textColor: "#334155",
    accent: "#94A3B8",
    label: "Inconnu",
    labelLong: "Données insuffisantes",
    icon: "help-outline",
  };
}

function scoreColor(score) {
  if (score === null || score === undefined) return C.gray;
  if (score >= 70) return C.greenMid;
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function fmtDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Composants ───────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }) {
  return (
    <View style={S.sectionHeader}>
      <MaterialIcons name={icon} size={14} color={C.textMuted} />
      <Text style={S.sectionLabel}>{label}</Text>
    </View>
  );
}

function ScoreArc({ score, size = 110 }) {
  const color = scoreColor(score);
  const isNull = score === null || score === undefined;
  const pct = isNull ? 0 : Math.min(Math.max(score, 0), 100);
  const circumference = Math.PI * (size - 14);
  const dash = (pct / 100) * circumference;

  return (
    <View style={{ width: size, height: size / 2 + 20, alignItems: "center" }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {/* Track arc */}
        <View
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 10,
            borderColor: C.grayLight,
          }}
        />
        {/* Score arc (approximation) */}
        {!isNull && (
          <View
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 10,
              borderColor: color,
              borderRightColor: "transparent",
              borderBottomColor: pct > 50 ? color : "transparent",
              transform: [{ rotate: "-135deg" }],
            }}
          />
        )}
        <Text style={{ fontSize: 30, fontWeight: "800", color, lineHeight: 34 }}>
          {isNull ? "—" : score}
        </Text>
        <Text style={{ fontSize: 11, color: C.textMuted, fontWeight: "600" }}>
          {isNull ? "inconnu" : "/ 100"}
        </Text>
      </View>
    </View>
  );
}

function StatCard({ icon, iconColor, iconBg, label, value, valueColor, sub }) {
  return (
    <View style={S.statCard}>
      <View style={[S.statIcon, { backgroundColor: iconBg }]}>
        <MaterialIcons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[S.statValue, valueColor && { color: valueColor }]}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
      {sub ? <Text style={S.statSub}>{sub}</Text> : null}
    </View>
  );
}

function DetRow({ icon, iconColor, text, textColor }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
      <MaterialIcons name={icon} size={14} color={iconColor} style={{ marginTop: 2 }} />
      <Text style={[S.detRowText, textColor && { color: textColor }]}>{text}</Text>
    </View>
  );
}

function DetCard({ icon, title, badge, badgeColor, badgeBg, isNull, children }) {
  return (
    <View style={[S.detCard, isNull && { opacity: 0.5 }]}>
      <View style={S.detHead}>
        <View style={[S.detIcon, { backgroundColor: badgeBg + "30" }]}>
          <MaterialIcons name={icon} size={17} color={badgeColor} />
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

function SensorRow({ icon, label, value, unit, color, alert }) {
  return (
    <View style={[S.sensorRow, alert && { borderLeftWidth: 2, borderLeftColor: color }]}>
      <View style={[S.sensorIcon, { backgroundColor: color + "18" }]}>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <Text style={S.sensorLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text style={[S.sensorVal, { color: alert ? color : C.textPrimary }]}>{value}</Text>
        <Text style={S.sensorUnit}>{unit}</Text>
      </View>
      {alert && <MaterialIcons name="warning" size={13} color={color} />}
    </View>
  );
}

function SensorsSection({ sensors }) {
  if (!sensors)
    return (
      <View style={S.noSensor}>
        <MaterialIcons name="sensors-off" size={17} color={C.textMuted} />
        <Text style={S.noSensorText}>Capteurs non connectés</Text>
      </View>
    );

  const rows = [];

  if (hasSensorValue(sensors.temperature)) {
    const v = Number(sensors.temperature);
    const alert = v > 30 || v < 15;
    rows.push(
      <SensorRow
        key="temp"
        icon="thermostat"
        label="Température"
        value={v.toFixed(1)}
        unit="°C"
        color={alert ? C.red : "#D97706"}
        alert={alert}
      />
    );
  }
  if (hasSensorValue(sensors.humidity)) {
    const v = Number(sensors.humidity);
    const alert = v > 80 || v < 30;
    rows.push(
      <SensorRow
        key="hum"
        icon="water-drop"
        label="Humidité"
        value={Math.round(v)}
        unit="%"
        color={alert ? C.red : C.blue}
        alert={alert}
      />
    );
  }
  if (hasSensorValue(sensors.waterLevel)) {
    const v = Number(sensors.waterLevel);
    const alert = v < 20;
    const color = v < 20 ? C.red : v < 40 ? "#D97706" : C.greenMid;
    rows.push(
      <SensorRow
        key="water"
        icon="local-drink"
        label="Niveau d'eau"
        value={Math.round(v)}
        unit="%"
        color={color}
        alert={alert}
      />
    );
  }
  if (hasSensorValue(sensors.airQualityPercent)) {
    const v = Number(sensors.airQualityPercent);
    const alert = v < 40;
    rows.push(
      <SensorRow
        key="air"
        icon="air"
        label="Qualité de l'air"
        value={Math.round(v)}
        unit="%"
        color={alert ? C.red : C.purple}
        alert={alert}
      />
    );
  }
  if (hasSensorValue(sensors.co2)) {
    const v = Number(sensors.co2);
    const alert = v > 3000;
    rows.push(
      <SensorRow
        key="co2"
        icon="cloud"
        label="CO₂"
        value={Math.round(v)}
        unit="ppm"
        color={alert ? C.red : C.gray}
        alert={alert}
      />
    );
  }
  if (hasSensorValue(sensors.nh3)) {
    const v = Number(sensors.nh3);
    const alert = v > 25;
    rows.push(
      <SensorRow
        key="nh3"
        icon="science"
        label="Ammoniac (NH₃)"
        value={v.toFixed(1)}
        unit="ppm"
        color={alert ? C.red : "#D97706"}
        alert={alert}
      />
    );
  }

  if (rows.length === 0)
    return (
      <View style={S.noSensor}>
        <MaterialIcons name="sensors-off" size={17} color={C.textMuted} />
        <Text style={S.noSensorText}>Aucune donnée capteur disponible</Text>
      </View>
    );

  return <View style={S.sensorList}>{rows}</View>;
}

function AdviceItem({ text, index, urgent }) {
  return (
    <View style={[S.adviceItem, urgent && { backgroundColor: C.redLight }]}>
      <View style={[S.adviceNum, { backgroundColor: urgent ? C.red : C.greenMid }]}>
        <Text style={S.adviceNumText}>{index + 1}</Text>
      </View>
      <Text style={[S.adviceText, urgent && { color: C.redText }]}>{text}</Text>
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function AIDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { analysis, poultryId, poultryName } = route?.params || {};

  // Normalisation des données (tolère les deux structures possible)
  const result = analysis?.result ?? analysis ?? {};
  const urgencyLevel = result?.urgencyLevel ?? "inconnu";
  const healthScore = Number.isFinite(result?.healthScore) ? result.healthScore : null;
  const cfg = urgencyConfig(urgencyLevel);

  const imageUrl = analysis?.image?.url ?? null;
  const createdAt = analysis?.createdAt ?? null;

  const sensors = normalizeSensors(extractRawSensors(analysis));

  const det = result?.detections || {};
  const comptage = result?.comptage ?? {};
  const maladie = result?.maladie_suspectee || {};
  const advices = Array.isArray(result?.advices) ? result.advices : [];
  const imageQuality = result?.imageQuality ?? {};

  const mortalityDetected = result?.imageUsable === false ? null : (det.mortalityDetected ?? null);
  const nombreMorts = Number.isFinite(det.nombreMorts) ? det.nombreMorts : null;
  const behaviorNormal = result?.imageUsable === false ? null : (det.behaviorNormal ?? null);
  const maladieSuspicion = result?.imageUsable === false ? null : (maladie.suspicion ?? null);
  const signesObserves = Array.isArray(maladie?.signes_observes) ? maladie.signes_observes : [];
  const comptageEstimation = comptage?.estimation ?? null;

  const mortalityCfg =
    mortalityDetected === true
      ? { color: C.red, bg: C.redLight, badge: `${nombreMorts ?? "?"} MORTE${(nombreMorts ?? 0) > 1 ? "S" : ""}` }
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
      ? { color: C.red, bg: C.redLight, badge: "SUSPECTE" }
      : maladieSuspicion === false
      ? { color: C.greenMid, bg: C.greenLight, badge: "RAS" }
      : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  const comptageCfg =
    comptageEstimation !== null
      ? { color: C.blue, bg: C.blueLight, badge: `~ ${comptageEstimation} vol.` }
      : { color: C.gray, bg: C.grayLight, badge: "N/A" };

  const handleShare = async () => {
    const score = healthScore !== null ? `${healthScore}/100` : "—";
    const msg = `📊 Analyse poulailler "${poultryName ?? ""}"\nScore santé : ${score} — ${cfg.label}\n${result?.diagnostic ?? ""}`;
    try {
      await Share.share({ message: msg });
    } catch (_) {}
  };

  const goToChat = () =>
    navigation.navigate("AIChat", {
      poultryId,
      poultryName,
      context: analysis,
    });

  return (
    <SafeAreaView style={S.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity
          style={S.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={19} color="#1A2E0A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Détails de l'analyse</Text>
          {poultryName ? (
            <View style={S.headerSubRow}>
              <View style={S.headerDot} />
              <Text style={S.headerSub} numberOfLines={1}>
                {poultryName}
              </Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={S.shareBtn} onPress={handleShare} activeOpacity={0.7}>
          <MaterialIcons name="share" size={17} color={C.greenMid} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[S.scroll, { paddingBottom: 90 + Math.max(insets.bottom, 0) }]}
      >
        {/* ── Bannière urgence ── */}
        {urgencyLevel === "critique" && (
          <View style={[S.banner, { backgroundColor: C.redLight, borderColor: "#F7C1C1" }]}>
            <MaterialIcons name="error" size={20} color={C.red} />
            <View style={{ flex: 1 }}>
              <Text style={[S.bannerTitle, { color: C.redText }]}>Intervention urgente requise</Text>
              <Text style={[S.bannerDesc, { color: C.red }]}>Vérifiez immédiatement votre troupeau</Text>
            </View>
          </View>
        )}
        {urgencyLevel === "attention" && (
          <View style={[S.banner, { backgroundColor: C.amberLight, borderColor: "#FAC775" }]}>
            <MaterialIcons name="warning" size={20} color={C.amber} />
            <View style={{ flex: 1 }}>
              <Text style={[S.bannerTitle, { color: C.amberText }]}>Surveillance renforcée conseillée</Text>
              <Text style={[S.bannerDesc, { color: C.amber }]}>Contrôlez les capteurs et observez vos volailles</Text>
            </View>
          </View>
        )}

        {/* ── Hero image + score ── */}
        <View style={S.heroCard}>
          {/* Image */}
          <View style={[S.imageZone, imageUrl && S.imageZoneFull]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={S.imagePlaceholder}>
                <MaterialIcons name="image-not-supported" size={32} color={C.textMuted} />
                <Text style={S.imagePlaceholderText}>Aucune image disponible</Text>
              </View>
            )}
            {imageUrl && (
              <View style={S.imageOverlay}>
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
            )}
          </View>

          {/* Score + date + badge */}
          <View style={S.heroBody}>
            <ScoreArc score={healthScore} size={100} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[S.urgencyBadge, { backgroundColor: cfg.bg }]}>
                <MaterialIcons name={cfg.icon} size={15} color={cfg.color} />
                <Text style={[S.urgencyBadgeText, { color: cfg.color }]}>{cfg.labelLong}</Text>
              </View>
              {result.confidence != null && (
                <Text style={S.metaText}>Confiance IA : {result.confidence}%</Text>
              )}
              <Text style={S.metaText}>
                {result.imageUsable ? "✓ Image analysée" : "Analyse capteurs uniquement"}
              </Text>
              {createdAt && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialIcons name="access-time" size={11} color={C.textMuted} />
                  <Text style={S.metaDate} numberOfLines={2}>
                    {fmtDate(createdAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Stats résumé ── */}
        <View style={S.statsRow}>
          <StatCard
            icon="warning"
            iconColor={mortalityDetected ? C.red : C.greenMid}
            iconBg={mortalityDetected ? C.redLight : C.greenLight}
            label="Mortalité"
            value={mortalityDetected === null ? "—" : mortalityDetected ? `${nombreMorts ?? "?"}` : "0"}
            valueColor={mortalityDetected ? C.red : C.greenMid}
            sub={mortalityDetected === true ? "morte(s)" : mortalityDetected === false ? "détectée" : null}
          />
          <StatCard
            icon="groups"
            iconColor={C.blue}
            iconBg={C.blueLight}
            label="Comptage"
            value={comptageEstimation !== null ? `~${comptageEstimation}` : "—"}
            valueColor={C.blue}
            sub={comptageEstimation !== null ? "volailles" : null}
          />
          <StatCard
            icon="psychology"
            iconColor={behaviorNormal === false ? "#D97706" : C.greenMid}
            iconBg={behaviorNormal === false ? C.amberLight : C.greenLight}
            label="Comportement"
            value={behaviorNormal === null ? "—" : behaviorNormal ? "OK" : "!"}
            valueColor={behaviorNormal === false ? "#D97706" : C.greenMid}
            sub={behaviorNormal === null ? null : behaviorNormal ? "normal" : "anormal"}
          />
        </View>

        {/* ── Diagnostic ── */}
        <View style={S.card}>
          <SectionHeader icon="medical-services" label="Diagnostic IA" />
          <View style={[S.diagBox, { borderLeftColor: cfg.accent }]}>
            <Text style={S.diagText}>{result.diagnostic || "Analyse effectuée."}</Text>
          </View>

          {/* ── Détections ── */}
          <SectionHeader icon="biotech" label="Ce que l'IA a vu" />
          <View style={{ gap: 8 }}>
            {/* Mortalité */}
            <DetCard
              icon="warning"
              title="Volailles mortes"
              badge={mortalityCfg.badge}
              badgeColor={mortalityCfg.color}
              badgeBg={mortalityCfg.bg}
              isNull={mortalityDetected === null}
            >
              {mortalityDetected === true ? (
                <>
                  <DetRow
                    icon="report"
                    iconColor={C.red}
                    text={
                      nombreMorts !== null && nombreMorts > 0
                        ? `${nombreMorts} volaille${nombreMorts > 1 ? "s" : ""} morte${nombreMorts > 1 ? "s" : ""} détectée${nombreMorts > 1 ? "s" : ""} sur l'image.`
                        : "Des volailles mortes ont été détectées. Contactez un vétérinaire."
                    }
                    textColor={C.red}
                  />
                  <View style={S.vetBadge}>
                    <MaterialIcons name="local-hospital" size={14} color={C.red} />
                    <Text style={[S.vetBadgeText, { color: C.red }]}>
                      Appelez un vétérinaire immédiatement
                    </Text>
                  </View>
                </>
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
              title="Volailles comptées"
              badge={comptageCfg.badge}
              badgeColor={comptageCfg.color}
              badgeBg={comptageCfg.bg}
              isNull={comptageEstimation === null}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
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
                    <Text style={{ fontSize: 11, color: C.textMuted, lineHeight: 16 }}>
                      {comptage.note}
                    </Text>
                  )}
                </View>
              </View>
            </DetCard>

            {/* Signes cliniques */}
            <DetCard
              icon="coronavirus"
              title="Signes cliniques"
              badge={maladieCfg.badge}
              badgeColor={maladieCfg.color}
              badgeBg={maladieCfg.bg}
              isNull={maladieSuspicion === null}
            >
              {maladieSuspicion === true ? (
                <View style={{ gap: 8 }}>
                  {signesObserves.length > 0 && (
                    <View style={S.signesBox}>
                      {signesObserves.map((s, i) => (
                        <View
                          key={i}
                          style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: i > 0 ? 4 : 0 }}
                        >
                          <View style={S.signeDot} />
                          <Text style={S.signeText}>{s}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {maladie.urgence_veterinaire && (
                    <View style={S.vetBadge}>
                      <MaterialIcons name="local-hospital" size={14} color={C.red} />
                      <Text style={S.vetBadgeText}>Consultation vétérinaire urgente</Text>
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
              isNull={behaviorNormal === null}
            >
              {behaviorNormal === true ? (
                <DetRow
                  icon="check-circle"
                  iconColor={C.greenMid}
                  text="Activité normale — les volailles se comportent bien."
                />
              ) : (
                <DetRow
                  icon="warning"
                  iconColor="#D97706"
                  text={
                    signesObserves.length > 0
                      ? `Comportements anormaux détectés — ${signesObserves.slice(0, 2).join(", ")}.`
                      : "Comportements anormaux détectés — observez vos volailles de plus près."
                  }
                  textColor={C.amberText}
                />
              )}
            </DetCard>
          </View>

          {/* ── Qualité image ── */}
          {imageQuality?.status && (
            <>
              <SectionHeader icon="image-search" label="Qualité de l'image" />
              <View
                style={[
                  S.imageQualityBox,
                  {
                    backgroundColor:
                      imageQuality.status === "poor"
                        ? C.amberLight
                        : imageQuality.status === "unusable"
                        ? C.redLight
                        : C.greenLight,
                    borderColor:
                      imageQuality.status === "poor"
                        ? "#FAC775"
                        : imageQuality.status === "unusable"
                        ? "#F7C1C1"
                        : "#C0DD97",
                  },
                ]}
              >
                <MaterialIcons
                  name={
                    imageQuality.status === "good"
                      ? "check-circle"
                      : imageQuality.status === "poor"
                      ? "warning"
                      : "error"
                  }
                  size={16}
                  color={
                    imageQuality.status === "good"
                      ? C.greenMid
                      : imageQuality.status === "poor"
                      ? C.amber
                      : C.red
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      S.imageQualityLabel,
                      {
                        color:
                          imageQuality.status === "good"
                            ? C.greenText
                            : imageQuality.status === "poor"
                            ? C.amberText
                            : C.redText,
                      },
                    ]}
                  >
                    {imageQuality.status === "good"
                      ? "Bonne qualité"
                      : imageQuality.status === "poor"
                      ? "Qualité médiocre"
                      : "Image inutilisable"}
                  </Text>
                  {imageQuality.reason && (
                    <Text
                      style={[
                        S.imageQualityReason,
                        {
                          color:
                            imageQuality.status === "good"
                              ? C.greenText
                              : imageQuality.status === "poor"
                              ? C.amberText
                              : C.redText,
                        },
                      ]}
                    >
                      {imageQuality.reason}
                    </Text>
                  )}
                </View>
              </View>
            </>
          )}

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

        {/* ── Métadonnées techniques ── */}
        <View style={[S.card, { gap: 8 }]}>
          <SectionHeader icon="info-outline" label="Informations techniques" />
          {[
            { label: "Modèle IA", value: "Llama Vision · Cloudflare AI" },
            { label: "ID analyse", value: analysis?._id ?? analysis?.id ?? "—" },
            { label: "Déclenchement", value: analysis?.triggerType ?? "manuel" },
            {
              label: "Image disponible",
              value: result?.imageAvailable ? "Oui" : "Non",
            },
          ].map((row) => (
            <View key={row.label} style={S.metaRow}>
              <Text style={S.metaRowLabel}>{row.label}</Text>
              <Text style={S.metaRowValue} numberOfLines={1} selectable>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── Barre d'actions flottante ── */}
      <View style={[S.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        <TouchableOpacity
          style={S.chatBtn}
          onPress={goToChat}
          activeOpacity={0.8}
        >
          <MaterialIcons name="chat-bubble-outline" size={16} color={C.greenMid} />
          <Text style={S.chatBtnText}>Poser une question</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.shareActionBtn]}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <MaterialIcons name="share" size={18} color="#fff" />
          <Text style={S.shareActionBtnText}>Partager</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.07)",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F4F6F3",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 14, fontWeight: "700", color: C.textPrimary, letterSpacing: -0.2 },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  headerDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.greenMid },
  headerSub: { fontSize: 11, color: C.textMuted },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.greenLight,
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },

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

  // Hero card
  heroCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: "hidden",
  },
  imageZone: {
    height: 200,
    backgroundColor: C.greenLight,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  imageZoneFull: {},
  imagePlaceholder: { alignItems: "center", gap: 8 },
  imagePlaceholderText: { fontSize: 13, color: C.textMuted },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
  },
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
  metaText: { fontSize: 11, color: C.textMuted },
  metaDate: { fontSize: 10, color: C.textMuted, flex: 1 },

  // Stats
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: C.textPrimary },
  statLabel: { fontSize: 9, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
  statSub: { fontSize: 10, color: C.textMuted, textAlign: "center" },

  // Card
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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

  diagBox: {
    backgroundColor: "#F8FAF6",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.greenMid,
    marginBottom: 4,
  },
  diagText: { fontSize: 13, color: C.textSecondary, lineHeight: 21, fontWeight: "500" },

  detCard: { borderRadius: 14, backgroundColor: "#F8FAF6", overflow: "hidden" },
  detHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  detIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: C.textPrimary },
  detBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  detBadgeText: { fontSize: 10, fontWeight: "800" },
  detBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.border, gap: 6 },
  detNull: { fontSize: 11, color: "#CBD5E1", fontStyle: "italic", paddingHorizontal: 12, paddingBottom: 10 },
  detRowText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 18, fontWeight: "500" },

  comptageBox: { backgroundColor: C.blueLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", minWidth: 68 },
  comptageNum: { fontSize: 22, fontWeight: "800", color: C.blue, lineHeight: 26 },
  comptageSub: { fontSize: 9, fontWeight: "600", color: "#93C5FD" },
  fiabBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  fiabText: { fontSize: 11, fontWeight: "700" },

  signesBox: { backgroundColor: C.white, borderRadius: 9, padding: 9 },
  signeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.red, marginTop: 5 },
  signeText: { flex: 1, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  vetBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.redLight, borderRadius: 9, padding: 8 },
  vetBadgeText: { fontSize: 12, fontWeight: "700", color: C.red },

  // Image quality
  imageQualityBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
  },
  imageQualityLabel: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  imageQualityReason: { fontSize: 11, lineHeight: 16 },

  // Sensors (liste verticale pour le détail)
  sensorList: { gap: 6 },
  sensorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAF6",
    borderRadius: 12,
    padding: 11,
    borderLeftWidth: 0,
  },
  sensorIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sensorLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: C.textPrimary },
  sensorVal: { fontSize: 16, fontWeight: "800" },
  sensorUnit: { fontSize: 10, fontWeight: "600", color: C.textMuted },
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
  noSensorText: { fontSize: 12, color: C.textMuted, fontStyle: "italic", flex: 1 },

  // Advices
  adviceItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: C.greenLight, borderRadius: 12, padding: 11 },
  adviceNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
  adviceNumText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  adviceText: { flex: 1, fontSize: 13, color: C.greenText, lineHeight: 20, fontWeight: "500" },

  // Meta rows
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  metaRowLabel: { fontSize: 12, color: C.textMuted, fontWeight: "600" },
  metaRowValue: { fontSize: 12, color: C.textPrimary, fontWeight: "700", maxWidth: "60%" },

  // Bottom bar
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
  chatBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: C.greenLight,
    borderWidth: 1.5,
    borderColor: "#C0DD97",
  },
  chatBtnText: { fontSize: 13, fontWeight: "700", color: C.greenMid },
  shareActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#1A2E0A",
  },
  shareActionBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
});