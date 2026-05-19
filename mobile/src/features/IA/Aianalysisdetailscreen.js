// screens/AIAnalysisDetailScreen.js
// FIX : Platform ajouté dans les imports react-native (manquant → ReferenceError → bundle 500)

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Share,
  Alert,
  Platform, // ✅ FIX : était utilisé dans StyleSheet mais jamais importé
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import api from "../../services/api";
import Toast from "../../components/Toast";

const { width } = Dimensions.get("window");

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUrgencyConfig(level) {
  switch (level) {
    case "critique":
      return {
        color: "#EF4444",
        bg: "#FEF2F2",
        textColor: "#991B1B",
        label: "CRITIQUE",
        icon: "error",
        gradientStart: "#FF6B6B",
        gradientEnd: "#EF4444",
      };
    case "attention":
      return {
        color: "#F59E0B",
        bg: "#FEF3C7",
        textColor: "#92400E",
        label: "ATTENTION",
        icon: "warning",
        gradientStart: "#FFD93D",
        gradientEnd: "#F59E0B",
      };
    default:
      return {
        color: "#22C55E",
        bg: "#F0FDF4",
        textColor: "#166534",
        label: "NORMAL",
        icon: "check-circle",
        gradientStart: "#6EE7B7",
        gradientEnd: "#22C55E",
      };
  }
}

function getTriggeredByLabel(triggeredBy) {
  switch (triggeredBy) {
    case "auto":
    case "esp32-auto":
    case "cron":
      return { label: "Automatique (CRON)", icon: "schedule" };
    case "manual":
      return { label: "Manuel (app mobile)", icon: "touch-app" };
    default:
      return { label: triggeredBy || "Inconnu", icon: "help-outline" };
  }
}

// ─── Score Circle ──────────────────────────────────────────────────────────

function ScoreCircle({ score, size = 110 }) {
  const rotation = (score / 100) * 360;
  const color = score >= 70 ? "#22C55E" : score >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <View
      style={[
        styles.scoreCircleOuter,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <View
        style={[
          styles.scoreCircleInner,
          {
            width: size - 16,
            height: size - 16,
            borderRadius: (size - 16) / 2,
            backgroundColor: "#fff",
          },
        ]}
      >
        <Text
          style={[styles.scoreCircleValue, { color, fontSize: size * 0.28 }]}
        >
          {score}
        </Text>
        <Text style={[styles.scoreCircleLabel, { color }]}>/100</Text>
      </View>
      <View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: "-90deg" }] }]}
      >
        <View
          style={[
            styles.scoreArc,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 8,
              borderColor: color,
              borderLeftColor: "transparent",
              borderBottomColor: "transparent",
              transform: [{ rotate: `${Math.min(rotation, 180)}deg` }],
            },
          ]}
        />
        {rotation > 180 && (
          <View
            style={[
              styles.scoreArc,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 8,
                borderColor: color,
                borderTopColor: "transparent",
                borderRightColor: "transparent",
                transform: [{ rotate: `${rotation - 180}deg` }],
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

// ─── Detection Row ─────────────────────────────────────────────────────────

function DetectionRow({ icon, label, desc, ok, confidence }) {
  const color = ok ? "#22C55E" : "#EF4444";
  const bg = ok ? "#F0FDF4" : "#FEF2F2";
  return (
    <View style={styles.detectionRow}>
      <View style={[styles.detectionIconWrap, { backgroundColor: bg }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.detectionBody}>
        <View style={styles.detectionTopRow}>
          <Text style={styles.detectionLabel}>{label}</Text>
          <View style={[styles.detectionBadge, { backgroundColor: bg }]}>
            <Text style={[styles.detectionBadgeText, { color }]}>
              {ok ? "OK" : "ALERTE"}
            </Text>
          </View>
        </View>
        <Text style={styles.detectionDesc}>{desc}</Text>
        {confidence != null && (
          <View style={styles.detectionBarWrap}>
            <View style={styles.detectionBarBg}>
              <View
                style={[
                  styles.detectionBarFill,
                  { width: `${confidence}%`, backgroundColor: color },
                ]}
              />
            </View>
            <Text style={[styles.detectionPct, { color }]}>{confidence}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Sensor Card ───────────────────────────────────────────────────────────

function SensorCard({
  icon,
  label,
  value,
  unit,
  color,
  threshold,
  thresholdLabel,
}) {
  const hasValue = value !== null && value !== undefined;
  return (
    <View style={[styles.sensorCard, { borderLeftColor: color }]}>
      <View style={[styles.sensorCardIcon, { backgroundColor: color + "18" }]}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <View style={styles.sensorCardBody}>
        <Text style={styles.sensorCardLabel}>{label}</Text>
        <Text style={[styles.sensorCardValue, { color }]}>
          {hasValue ? `${value}` : "—"}
          {hasValue && <Text style={styles.sensorCardUnit}> {unit}</Text>}
        </Text>
        {threshold != null && (
          <Text style={styles.sensorCardThreshold}>{thresholdLabel}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────

function SectionHeader({ icon, title }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialIcons name={icon} size={15} color="#94A3B8" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Tech Row ──────────────────────────────────────────────────────────────

function TechRow({ label, value, mono = false }) {
  return (
    <View style={styles.techRow}>
      <Text style={styles.techRowLabel}>{label}</Text>
      <Text
        style={[styles.techRowValue, mono && styles.techRowMono]}
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export default function AIAnalysisDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const params = route?.params || {};
  const analysisId = params.analysisId;
  const poultryId = params.poultryId || params.poulaillerId;
  const poultryName =
    params.poultryName || params.poulaillerName || "Poulailler";

  // Si l'analyse est passée directement (depuis l'historique), on l'utilise
  const [analysis, setAnalysis] = useState(params.analysis || null);
  const [loading, setLoading] = useState(!params.analysis);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const [imageError, setImageError] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  // ── Chargement ────────────────────────────────────────────────────────
  useEffect(() => {
    if (analysis) {
      animateIn();
      return;
    }
    if (analysisId) {
      fetchAnalysis();
    }
  }, []);

  async function fetchAnalysis() {
    try {
      setLoading(true);
      const res = await api.get(`/ai/analysis/${analysisId}`);
      if (res.data?.success && res.data.data) {
        setAnalysis(res.data.data);
        animateIn();
      } else {
        showToast("Analyse introuvable", "error");
      }
    } catch (err) {
      showToast(err.response?.data?.error || "Erreur de chargement", "error");
    } finally {
      setLoading(false);
    }
  }

  function animateIn() {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // ── Partage ───────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!analysis) return;
    try {
      const r = analysis.result;
      const msg =
        `📊 Rapport IA — ${poultryName}\n` +
        `📅 ${formatDateShort(analysis.createdAt)}\n\n` +
        `🩺 Score santé : ${r.healthScore}/100\n` +
        `🚦 Niveau : ${r.urgencyLevel?.toUpperCase()}\n` +
        `📋 Diagnostic : ${r.diagnostic}\n\n` +
        `Conseils :\n${(r.advices || []).map((a, i) => `${i + 1}. ${a}`).join("\n")}`;
      await Share.share({ message: msg, title: "Rapport IA Smart Poultry" });
    } catch (err) {
      showToast("Partage indisponible", "error");
    }
  }, [analysis, poultryName]);

  // ── Chat contextuel ───────────────────────────────────────────────────
  const handleChat = useCallback(() => {
    navigation.navigate("AIChat", {
      poultryId,
      poultryName,
      context: analysis?.result,
    });
  }, [navigation, poultryId, poultryName, analysis]);

  // ── Nouvelle analyse ──────────────────────────────────────────────────
  const handleNewAnalysis = useCallback(() => {
    navigation.navigate("AIAnalysis", { poultryId, poultryName });
  }, [navigation, poultryId, poultryName]);

  const showToast = (message, type = "success") =>
    setToast({ visible: true, message, type });

  // ── Render loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détail analyse</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={styles.loadingText}>Chargement de l'analyse...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!analysis) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détail analyse</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.loadingContainer}>
          <MaterialIcons name="search-off" size={48} color="#CBD5E1" />
          <Text style={styles.emptyText}>Analyse introuvable</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.retryBtnText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const result = analysis.result || {};
  const sensors = analysis.sensors || result.sensors || {};
  const detections = result.detections || {};
  const urgency = getUrgencyConfig(result.urgencyLevel);
  const trigger = getTriggeredByLabel(analysis.triggeredBy);
  const imageUrl = analysis.image?.url || null;
  const thumbnailUrl = analysis.image?.thumbnailUrl || imageUrl;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Rapport d'analyse</Text>
          <Text style={styles.headerSub}>{poultryName}</Text>
        </View>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <MaterialIcons name="ios-share" size={20} color="#22C55E" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 110 + Math.max(insets.bottom, 0) },
        ]}
      >
        {/* ── Image + Score hero ── */}
        <View style={styles.heroCard}>
          {/* Image */}
          <View style={styles.heroImageWrap}>
            {imageUrl && !imageError ? (
              <>
                <Image
                  source={{ uri: thumbnailUrl || imageUrl }}
                  style={styles.heroImage}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
                <View style={styles.heroImageOverlay} />
              </>
            ) : (
              <View style={styles.heroImagePlaceholder}>
                <MaterialIcons
                  name="image-not-supported"
                  size={32}
                  color="#CBD5E1"
                />
                <Text style={styles.heroImagePlaceholderText}>
                  {imageError ? "Image non disponible" : "Aucune image"}
                </Text>
              </View>
            )}

            {/* Badge urgence sur l'image */}
            {imageUrl && !imageError && (
              <View
                style={[
                  styles.heroUrgencyBadge,
                  { backgroundColor: urgency.color },
                ]}
              >
                <MaterialIcons name={urgency.icon} size={13} color="#fff" />
                <Text style={styles.heroUrgencyBadgeText}>{urgency.label}</Text>
              </View>
            )}

            {/* Badge caméra */}
            {analysis.cameraMac && imageUrl && !imageError && (
              <View style={styles.heroCamBadge}>
                <MaterialIcons name="camera-alt" size={12} color="#fff" />
                <Text style={styles.heroCamText}>{analysis.cameraMac}</Text>
              </View>
            )}
          </View>

          {/* Score + meta */}
          <View style={styles.heroScoreSection}>
            <ScoreCircle score={result.healthScore ?? 0} size={110} />

            <View style={styles.heroScoreInfo}>
              <View
                style={[styles.urgencyBadge, { backgroundColor: urgency.bg }]}
              >
                <MaterialIcons
                  name={urgency.icon}
                  size={15}
                  color={urgency.color}
                />
                <Text
                  style={[
                    styles.urgencyBadgeText,
                    { color: urgency.textColor },
                  ]}
                >
                  {urgency.label}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialIcons name="verified" size={13} color="#94A3B8" />
                <Text style={styles.metaText}>
                  Confiance : {result.confidence ?? "—"}%
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialIcons name={trigger.icon} size={13} color="#94A3B8" />
                <Text style={styles.metaText}>{trigger.label}</Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialIcons name="access-time" size={13} color="#94A3B8" />
                <Text style={styles.metaText}>
                  {formatDateShort(analysis.createdAt)}
                </Text>
              </View>

              {analysis.imageQuality?.status === "optimized" && (
                <View style={styles.metaRow}>
                  <MaterialIcons
                    name="photo-size-select-actual"
                    size={13}
                    color="#94A3B8"
                  />
                  <Text style={styles.metaText}>
                    Image : {analysis.imageQuality?.sizeKb ?? "—"} Ko
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Date complète */}
          <View style={styles.heroDivider} />
          <View style={styles.heroDateRow}>
            <MaterialIcons name="event" size={14} color="#94A3B8" />
            <Text style={styles.heroDateText}>
              {formatDate(analysis.createdAt)}
            </Text>
          </View>
        </View>

        {/* ── Diagnostic ── */}
        <View style={styles.card}>
          <SectionHeader icon="medical-services" title="Diagnostic" />
          <View
            style={[styles.diagnosticBox, { borderLeftColor: urgency.color }]}
          >
            <Text style={styles.diagnosticText}>
              {result.diagnostic || "Aucun diagnostic disponible."}
            </Text>
          </View>
        </View>

        {/* ── Détections visuelles ── */}
        <View style={styles.card}>
          <SectionHeader icon="search" title="Détections visuelles" />
          <View style={styles.detectionList}>
            <DetectionRow
              icon="psychology"
              label="Comportement"
              desc="Activité et posture des volailles dans l'image"
              ok={detections.behaviorNormal !== false}
              confidence={95}
            />
            <DetectionRow
              icon="favorite"
              label="Mortalité"
              desc="Présence de cadavres détectée visuellement"
              ok={!detections.mortalityDetected}
              confidence={99}
            />
            <DetectionRow
              icon="group"
              label="Densité"
              desc="Répartition et densité des volailles au m²"
              ok={detections.densityOk !== false}
              confidence={88}
            />
            <DetectionRow
              icon="cleaning-services"
              label="Environnement"
              desc="État de la litière et propreté générale"
              ok={detections.cleanEnvironment !== false}
              confidence={92}
            />
            <DetectionRow
              icon="air"
              label="Ventilation"
              desc="Circulation d'air et signes de condensation"
              ok={detections.ventilationAdequate !== false}
              confidence={90}
            />
          </View>
        </View>

        {/* ── Capteurs au moment de l'analyse ── */}
        <View style={styles.card}>
          <SectionHeader
            icon="sensors"
            title="Capteurs au moment de l'analyse"
          />
          <View style={styles.sensorGrid}>
            <SensorCard
              icon="thermostat"
              label="Température"
              value={sensors.temperature}
              unit="°C"
              color={
                sensors.temperature == null
                  ? "#94A3B8"
                  : sensors.temperature < 15 || sensors.temperature > 31
                    ? "#EF4444"
                    : sensors.temperature < 18 || sensors.temperature > 28
                      ? "#F59E0B"
                      : "#22C55E"
              }
              threshold={null}
            />
            <SensorCard
              icon="water-drop"
              label="Humidité"
              value={sensors.humidity}
              unit="%"
              color={
                sensors.humidity == null
                  ? "#94A3B8"
                  : sensors.humidity < 40 || sensors.humidity > 70
                    ? "#F59E0B"
                    : "#22C55E"
              }
            />
            <SensorCard
              icon="air"
              label="Qualité air"
              value={sensors.airQualityPercent}
              unit="%"
              color={
                sensors.airQualityPercent == null
                  ? "#94A3B8"
                  : sensors.airQualityPercent < 20
                    ? "#EF4444"
                    : sensors.airQualityPercent < 40
                      ? "#F59E0B"
                      : "#22C55E"
              }
            />
            <SensorCard
              icon="water"
              label="Niveau eau"
              value={sensors.waterLevel}
              unit="%"
              color={
                sensors.waterLevel == null
                  ? "#94A3B8"
                  : sensors.waterLevel < 20
                    ? "#EF4444"
                    : "#22C55E"
              }
            />
          </View>

          {/* Infos élevage */}
          {(sensors.animalCount || sensors.surface) && (
            <View style={styles.farmInfoRow}>
              {sensors.animalCount != null && (
                <View style={styles.farmInfoChip}>
                  <MaterialIcons
                    name="emoji-nature"
                    size={14}
                    color="#64748B"
                  />
                  <Text style={styles.farmInfoText}>
                    {sensors.animalCount} volailles
                  </Text>
                </View>
              )}
              {sensors.surface != null && (
                <View style={styles.farmInfoChip}>
                  <MaterialIcons name="square-foot" size={14} color="#64748B" />
                  <Text style={styles.farmInfoText}>{sensors.surface} m²</Text>
                </View>
              )}
              {sensors.animalCount != null && sensors.surface != null && (
                <View style={styles.farmInfoChip}>
                  <MaterialIcons name="dashboard" size={14} color="#64748B" />
                  <Text style={styles.farmInfoText}>
                    {(sensors.animalCount / sensors.surface).toFixed(1)} vol/m²
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Recommandations ── */}
        {(result.advices || []).length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="lightbulb" title="Recommandations IA" />
            <View style={styles.adviceList}>
              {result.advices.map((advice, i) => (
                <View key={i} style={styles.adviceItem}>
                  <View
                    style={[
                      styles.adviceNumber,
                      {
                        backgroundColor:
                          i === 0 ? "#22C55E" : i === 1 ? "#3B82F6" : "#8B5CF6",
                      },
                    ]}
                  >
                    <Text style={styles.adviceNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.adviceText}>{advice}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Infos techniques ── */}
        <View style={[styles.card, styles.cardLast]}>
          <SectionHeader icon="info" title="Informations techniques" />
          <View style={styles.techInfoList}>
            <TechRow label="ID analyse" value={analysis._id || "—"} mono />
            <TechRow
              label="Modèle IA"
              value="Gemma 3 / LLaVA 1.5 (Cloudflare)"
            />
            <TechRow
              label="Qualité image"
              value={
                analysis.imageQuality?.status === "optimized"
                  ? `Optimisée (${analysis.imageQuality?.sizeKb ?? "—"} Ko)`
                  : analysis.imageQuality?.status === "poor"
                    ? "Faible (capteurs uniquement)"
                    : analysis.imageQuality?.status || "—"
              }
            />
            {analysis.cameraMac && (
              <TechRow label="Caméra MAC" value={analysis.cameraMac} mono />
            )}
            <TechRow label="Déclenchement" value={trigger.label} />
            <TechRow label="Créé le" value={formatDate(analysis.createdAt)} />
            {analysis.updatedAt &&
              analysis.updatedAt !== analysis.createdAt && (
                <TechRow
                  label="Mis à jour"
                  value={formatDate(analysis.updatedAt)}
                />
              )}
          </View>
        </View>
      </Animated.ScrollView>

      {/* ── Bottom actions ── */}
      <View
        style={[
          styles.bottomActions,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <TouchableOpacity
          style={styles.bottomBtnSecondary}
          onPress={handleChat}
          activeOpacity={0.7}
        >
          <MaterialIcons name="chat" size={18} color="#64748B" />
          <Text style={styles.bottomBtnSecondaryText}>Chat IA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bottomBtnPrimary}
          onPress={handleNewAnalysis}
          activeOpacity={0.8}
        >
          <MaterialIcons name="biotech" size={18} color="#fff" />
          <Text style={styles.bottomBtnPrimaryText}>Nouvelle analyse</Text>
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

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAF9" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  headerSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
    marginTop: 1,
  },
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: { paddingTop: 16, paddingHorizontal: 16 },

  // Loading / empty
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: { fontSize: 14, color: "#94A3B8", fontWeight: "500" },
  emptyText: { fontSize: 15, color: "#94A3B8", fontWeight: "600" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#22C55E",
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Card générique
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardLast: { marginBottom: 0 },

  // Hero card
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 12,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  heroImageWrap: {
    height: 220,
    backgroundColor: "#F1F5F9",
    position: "relative",
  },
  heroImage: { width: "100%", height: "100%" },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  heroImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroImagePlaceholderText: {
    fontSize: 13,
    color: "#CBD5E1",
    fontWeight: "500",
  },
  heroUrgencyBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroUrgencyBadgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  heroCamBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  heroCamText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  heroScoreSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    padding: 20,
  },
  heroScoreInfo: { flex: 1, gap: 8 },

  urgencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  urgencyBadgeText: { fontSize: 13, fontWeight: "800" },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: "#64748B", fontWeight: "500", flex: 1 },

  heroDivider: { height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 20 },
  heroDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  heroDateText: { fontSize: 13, color: "#94A3B8", fontWeight: "500", flex: 1 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#94A3B8",
  },

  // Diagnostic
  diagnosticBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
  },
  diagnosticText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    lineHeight: 23,
  },

  // Détections
  detectionList: { gap: 10 },
  detectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
  },
  detectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detectionBody: { flex: 1, gap: 4 },
  detectionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detectionLabel: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  detectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  detectionBadgeText: { fontSize: 10, fontWeight: "800" },
  detectionDesc: { fontSize: 11, color: "#94A3B8" },
  detectionBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  detectionBarBg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
  },
  detectionBarFill: { height: "100%", borderRadius: 2 },
  detectionPct: {
    fontSize: 10,
    fontWeight: "700",
    width: 32,
    textAlign: "right",
  },

  // Capteurs
  sensorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  sensorCard: {
    width: (width - 32 - 20 - 10) / 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderLeftWidth: 3,
  },
  sensorCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sensorCardBody: { flex: 1 },
  sensorCardLabel: { fontSize: 10, fontWeight: "600", color: "#94A3B8" },
  sensorCardValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 2,
  },
  sensorCardUnit: { fontSize: 12, fontWeight: "500" },
  sensorCardThreshold: { fontSize: 10, color: "#CBD5E1", marginTop: 2 },

  farmInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  farmInfoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
  },
  farmInfoText: { fontSize: 12, fontWeight: "600", color: "#64748B" },

  // Recommandations
  adviceList: { gap: 10 },
  adviceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
  },
  adviceNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  adviceNumberText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  adviceText: {
    flex: 1,
    fontSize: 13,
    color: "#166534",
    lineHeight: 21,
    fontWeight: "500",
  },

  // Infos techniques
  techInfoList: { gap: 0 },
  techRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 12,
  },
  techRowLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "600", flex: 1 },
  techRowValue: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  techRowMono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", // ✅ Platform maintenant importé
    fontSize: 11,
  },

  // Score circle
  scoreCircleOuter: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  scoreCircleInner: {
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  scoreCircleValue: { fontWeight: "800" },
  scoreCircleLabel: { fontSize: 11, fontWeight: "600", marginTop: -2 },
  scoreArc: { position: "absolute", top: 0, left: 0, borderRadius: 100 },

  // Bottom actions
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 10,
  },
  bottomBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
  },
  bottomBtnSecondaryText: { fontSize: 14, fontWeight: "700", color: "#64748B" },
  bottomBtnPrimary: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#22C55E",
  },
  bottomBtnPrimaryText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
