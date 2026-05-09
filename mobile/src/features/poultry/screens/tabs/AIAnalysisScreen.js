// screens/AIAnalysisScreen.js
// ============================================================
// Écran Analyse IA Santé — Smart Poultry
// Capture photo → Analyse Gemma 3 → Résultat + Chat
// ============================================================

import React, { useState, useCallback, useRef } from "react";
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
  Alert,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { useAIAnalysis } from "../../../../hooks/useAIAnalysis";
import Toast from "../../../../components/Toast";

const { width } = Dimensions.get("window");

// ─── Score Circle Component ────────────────────────────────────────────────

function ScoreCircle({ score, size = 90 }) {
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
            width: size - 14,
            height: size - 14,
            borderRadius: (size - 14) / 2,
            backgroundColor: "#fff",
          },
        ]}
      >
        <Text style={[styles.scoreCircleValue, { color }]}>{score}</Text>
      </View>
      {/* SVG-like conic gradient using multiple segments */}
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
              borderWidth: 7,
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
                borderWidth: 7,
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

// ─── Detection Item ────────────────────────────────────────────────────────

function DetectionItem({ icon, label, desc, confidence, status = "ok" }) {
  const colors = {
    ok: { bg: "#F0FDF4", icon: "#22C55E", text: "#166534" },
    warn: { bg: "#FEF3C7", icon: "#F59E0B", text: "#92400E" },
    danger: { bg: "#FEF2F2", icon: "#EF4444", text: "#991B1B" },
  };
  const c = colors[status] || colors.ok;

  return (
    <View style={styles.detectionItem}>
      <View style={[styles.detectionIcon, { backgroundColor: c.bg }]}>
        <MaterialIcons name={icon} size={20} color={c.icon} />
      </View>
      <View style={styles.detectionContent}>
        <Text style={styles.detectionName}>{label}</Text>
        <Text style={styles.detectionDesc}>{desc}</Text>
        <View style={styles.detectionBar}>
          <View
            style={[
              styles.detectionBarFill,
              { width: `${confidence}%`, backgroundColor: c.icon },
            ]}
          />
        </View>
        <Text style={[styles.detectionConfidence, { color: c.icon }]}>
          {confidence}% confiance
        </Text>
      </View>
    </View>
  );
}

// ─── Sensor Mini Card ──────────────────────────────────────────────────────

function SensorMini({ icon, label, value, unit, color = "#22C55E" }) {
  return (
    <View style={styles.sensorMini}>
      <View style={[styles.sensorMiniIcon, { backgroundColor: color + "15" }]}>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <View>
        <Text style={styles.sensorMiniValue}>
          {value}
          <Text style={styles.sensorMiniUnit}>{unit}</Text>
        </Text>
        <Text style={styles.sensorMiniLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

import { useNavigation, useRoute } from "@react-navigation/native";

export default function AIAnalysisScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { poultryId, poultryName } = route?.params || {};
  const insets = useSafeAreaInsets();

  const {
    analyzing,
    latestResult,
    captureImage,
    analyze,
    askVet,
    chatLoading,
  } = useAIAnalysis(poultryId);

  const [imageUri, setImageUri] = useState(null);
  const [progress, setProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Capture photo ────────────────────────────────────────────────────────
  const handleCapture = useCallback(
    async (source = "camera") => {
      try {
        const uri = await captureImage(source);
        if (uri) {
          setImageUri(uri);
          setShowResult(false);
          setProgress(0);
        }
      } catch (err) {
        setToast({
          visible: true,
          message: "Erreur capture: " + err.message,
          type: "error",
        });
      }
    },
    [captureImage],
  );

  // ── Lancer analyse ───────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!imageUri) {
      setToast({
        visible: true,
        message: "Prenez d'abord une photo",
        type: "error",
      });
      return;
    }

    setShowResult(false);
    setProgress(0);

    // Animation progress
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    // Progress steps
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setProgress(Math.min(p, 95));
      if (p >= 95) clearInterval(interval);
    }, 150);

    try {
      const result = await analyze(imageUri);
      clearInterval(interval);
      setProgress(100);

      // Fade in result
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();

      setShowResult(true);
      setToast({
        visible: true,
        message: `Analyse terminée — Score: ${result.healthScore}/100`,
        type: "success",
      });
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setToast({
        visible: true,
        message: err.message || "Erreur analyse IA",
        type: "error",
      });
    }
  }, [imageUri, analyze, fadeAnim, progressAnim]);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setImageUri(null);
    setShowResult(false);
    setProgress(0);
    progressAnim.setValue(0);
    fadeAnim.setValue(0);
  }, [progressAnim, fadeAnim]);

  // ── Navigation Chat ──────────────────────────────────────────────────────
  const goToChat = useCallback(() => {
    navigation.navigate("AIChat", {
      poultryId,
      poultryName,
      context: latestResult,
    });
  }, [navigation, poultryId, poultryName, latestResult]);

  // ── Navigation Detail ────────────────────────────────────────────────────
  const goToDetail = useCallback(() => {
    navigation.navigate("AIDetail");
  }, [navigation]);

  // ── Render ─────────────────────────────────────────────────────────────────
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
        <Text style={styles.headerTitle}>Analyse IA Santé</Text>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 100 + Math.max(insets.bottom, 0) },
        ]}
      >
        {/* Camera Zone */}
        <TouchableOpacity
          style={[styles.cameraZone, imageUri && styles.cameraZoneHasImage]}
          onPress={() => {
            Alert.alert("Source", "Choisir la source", [
              {
                text: "📷 Appareil photo",
                onPress: () => handleCapture("camera"),
              },
              { text: "🖼️ Galerie", onPress: () => handleCapture("library") },
              { text: "Annuler", style: "cancel" },
            ]);
          }}
          activeOpacity={0.8}
        >
          {imageUri ? (
            <>
              <Image
                source={{ uri: imageUri }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraOverlayTop}>
                  <View style={styles.cameraOverlayBadge}>
                    <MaterialIcons name="camera-alt" size={12} color="#fff" />
                    <Text style={styles.cameraOverlayBadgeText}>
                      Analyse IA
                    </Text>
                  </View>
                  {showResult && (
                    <View
                      style={[
                        styles.cameraOverlayBadge,
                        { backgroundColor: "rgba(34,197,94,0.9)" },
                      ]}
                    >
                      <Text style={styles.cameraOverlayBadgeText}>
                        {latestResult?.healthScore}/100
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={handleReset}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="refresh" size={18} color="#fff" />
                  <Text style={styles.retakeText}>Reprendre</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.cameraIcon}>
                <MaterialIcons name="camera-alt" size={28} color="#fff" />
              </View>
              <Text style={styles.cameraHint}>
                Appuyez pour{" "}
                <Text style={styles.cameraHintHighlight}>
                  prendre une photo
                </Text>
                {"ou choisir depuis la galerie"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Sensor Strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sensorStrip}
          contentContainerStyle={styles.sensorStripContent}
        >
          <SensorMini
            icon="thermostat"
            label="Température"
            value="24"
            unit="°C"
          />
          <SensorMini icon="water-drop" label="Humidité" value="58" unit="%" />
          <SensorMini icon="air" label="Qualité air" value="70" unit="%" />
          <SensorMini icon="waves" label="Niveau eau" value="55" unit="%" />
        </ScrollView>

        {/* Progress */}
        {analyzing && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <ActivityIndicator size="small" color="#22C55E" />
              <Text style={styles.progressTitle}>Analyse en cours...</Text>
            </View>
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
            <View style={styles.progressText}>
              <Text style={styles.progressLabel}>
                Détection visuelle + corrélation capteurs
              </Text>
              <Text style={styles.progressPercent}>{progress}%</Text>
            </View>
            <Text style={styles.progressModel}>Gemma 3 • Cloudflare AI</Text>
          </View>
        )}

        {/* Result Card */}
        {showResult && latestResult && (
          <Animated.View style={[styles.resultCard, { opacity: fadeAnim }]}>
            {/* Score */}
            <View style={styles.resultScoreSection}>
              <ScoreCircle score={latestResult.healthScore} size={90} />
              <View style={styles.resultScoreInfo}>
                <View
                  style={[
                    styles.resultStatusBadge,
                    {
                      backgroundColor:
                        latestResult.urgencyLevel === "critique"
                          ? "#FEF2F2"
                          : latestResult.urgencyLevel === "attention"
                            ? "#FEF3C7"
                            : "#F0FDF4",
                    },
                  ]}
                >
                  <MaterialIcons
                    name={
                      latestResult.urgencyLevel === "critique"
                        ? "error"
                        : latestResult.urgencyLevel === "attention"
                          ? "warning"
                          : "check-circle"
                    }
                    size={14}
                    color={
                      latestResult.urgencyLevel === "critique"
                        ? "#EF4444"
                        : latestResult.urgencyLevel === "attention"
                          ? "#F59E0B"
                          : "#22C55E"
                    }
                  />
                  <Text
                    style={[
                      styles.resultStatusText,
                      {
                        color:
                          latestResult.urgencyLevel === "critique"
                            ? "#991B1B"
                            : latestResult.urgencyLevel === "attention"
                              ? "#92400E"
                              : "#166534",
                      },
                    ]}
                  >
                    {latestResult.urgencyLevel === "critique"
                      ? "CRITIQUE"
                      : latestResult.urgencyLevel === "attention"
                        ? "ATTENTION"
                        : "NORMAL"}
                  </Text>
                </View>
                <Text style={styles.resultMeta}>
                  Confiance: {latestResult.confidence}% •{" "}
                  {latestResult.imageQuality?.sizeKb || "?"}Ko
                </Text>
              </View>
            </View>

            {/* Diagnostic */}
            <View style={styles.diagnosticBox}>
              <Text style={styles.diagnosticText}>
                {latestResult.diagnostic}
              </Text>
            </View>

            {/* Detections */}
            <Text style={styles.sectionTitle}>🔍 Détections</Text>
            <View style={styles.detectionList}>
              <DetectionItem
                icon="psychology"
                label="Comportement normal"
                desc="Volailles actives, pas de signes de stress"
                confidence={95}
                status={latestResult.detections?.behaviorNormal ? "ok" : "warn"}
              />
              <DetectionItem
                icon="favorite"
                label="Aucune mortalité"
                desc="Aucun cadavre visible dans l'image"
                confidence={99}
                status={
                  !latestResult.detections?.mortalityDetected ? "ok" : "danger"
                }
              />
              <DetectionItem
                icon="group"
                label="Densité adéquate"
                desc="100 volailles / 40m² = 2.5/m²"
                confidence={88}
                status={latestResult.detections?.densityOk ? "ok" : "warn"}
              />
              <DetectionItem
                icon="cleaning-services"
                label="Environnement propre"
                desc="Litière en bon état"
                confidence={92}
                status={
                  latestResult.detections?.cleanEnvironment ? "ok" : "warn"
                }
              />
              <DetectionItem
                icon="air"
                label="Ventilation correcte"
                desc="Circulation d'air visible"
                confidence={90}
                status={
                  latestResult.detections?.ventilationAdequate ? "ok" : "warn"
                }
              />
            </View>

            {/* Advices */}
            <Text style={styles.sectionTitle}>💡 Recommandations</Text>
            <View style={styles.adviceList}>
              {(latestResult.advices || []).map((advice, i) => (
                <View key={i} style={styles.adviceItem}>
                  <View style={styles.adviceNumber}>
                    <Text style={styles.adviceNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.adviceText}>{advice}</Text>
                </View>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.resultActions}>
              <TouchableOpacity
                style={styles.resultActionBtn}
                onPress={goToChat}
                activeOpacity={0.7}
              >
                <MaterialIcons name="chat" size={16} color="#64748B" />
                <Text style={styles.resultActionText}>Chat IA</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultActionBtn, styles.resultActionBtnPrimary]}
                onPress={goToDetail}
                activeOpacity={0.7}
              >
                <MaterialIcons name="open-in-new" size={16} color="#fff" />
                <Text style={styles.resultActionTextPrimary}>Détails</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* History Preview */}
        <View style={styles.historyPreview}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>📜 Historique</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("AIHistory", { poultryId })}
            >
              <Text style={styles.historyLink}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {/* Mock history items */}
          {[
            { date: "Auj 14:30", score: 80, status: "ok", label: "Normal" },
            {
              date: "Auj 08:15",
              score: 55,
              status: "warn",
              label: "Attention",
            },
            {
              date: "Hier 16:45",
              score: 30,
              status: "danger",
              label: "Critique",
            },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.historyItem}
              onPress={goToDetail}
              activeOpacity={0.7}
            >
              <View style={styles.historyThumb}>
                <MaterialIcons name="image" size={20} color="#94A3B8" />
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyDate}>{item.date}</Text>
                <Text
                  style={[
                    styles.historyScore,
                    item.status === "ok" && { color: "#22C55E" },
                    item.status === "warn" && { color: "#F59E0B" },
                    item.status === "danger" && { color: "#EF4444" },
                  ]}
                >
                  {item.score}/100 — {item.label}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      {!showResult && (
        <View
          style={[
            styles.bottomActions,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
        >
          <TouchableOpacity
            style={styles.bottomBtnSecondary}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={18} color="#64748B" />
            <Text style={styles.bottomBtnSecondaryText}>Réinitialiser</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomBtnPrimary}
            onPress={handleAnalyze}
            disabled={analyzing || !imageUri}
            activeOpacity={0.7}
          >
            {analyzing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="camera-alt" size={18} color="#fff" />
                <Text style={styles.bottomBtnPrimaryText}>Analyser</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
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
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    marginLeft: 12,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  liveText: { fontSize: 11, fontWeight: "700", color: "#22C55E" },

  // Scroll
  scrollContent: { paddingTop: 16 },

  // Camera Zone
  cameraZone: {
    marginHorizontal: 16,
    height: 280,
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#22C55E",
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    overflow: "hidden",
  },
  cameraZoneHasImage: { borderStyle: "solid", borderColor: "transparent" },
  cameraIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  cameraHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  cameraHintHighlight: { color: "#22C55E" },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 16,
  },
  cameraOverlayTop: { flexDirection: "row", justifyContent: "space-between" },
  cameraOverlayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  cameraOverlayBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  retakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  retakeText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  // Sensor Strip
  sensorStrip: { marginTop: 16, marginBottom: 16 },
  sensorStripContent: { paddingHorizontal: 16, gap: 10 },
  sensorMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
  },
  sensorMiniIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sensorMiniValue: { fontSize: 14, fontWeight: "800", color: "#1E293B" },
  sensorMiniUnit: { fontSize: 10, fontWeight: "600", color: "#94A3B8" },
  sensorMiniLabel: { fontSize: 10, fontWeight: "600", color: "#64748B" },

  // Progress
  progressSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  progressTitle: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  progressText: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressLabel: { fontSize: 12, color: "#94A3B8" },
  progressPercent: { fontSize: 12, fontWeight: "700", color: "#22C55E" },
  progressModel: {
    fontSize: 11,
    color: "#CBD5E1",
    marginTop: 8,
    textAlign: "center",
  },

  // Result Card
  resultCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  resultScoreSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 20,
  },
  resultScoreInfo: { flex: 1 },
  resultStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  resultStatusText: { fontSize: 13, fontWeight: "700" },
  resultMeta: { fontSize: 12, color: "#94A3B8" },

  diagnosticBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  diagnosticText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    lineHeight: 22,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#94A3B8",
    marginBottom: 12,
    marginTop: 4,
  },

  // Score Circle
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
  scoreCircleValue: { fontSize: 28, fontWeight: "800" },
  scoreArc: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 100,
  },

  // Detections
  detectionList: { gap: 10 },
  detectionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
  },
  detectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  detectionContent: { flex: 1 },
  detectionName: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  detectionDesc: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  detectionBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "#F1F5F9",
    marginTop: 8,
    overflow: "hidden",
  },
  detectionBarFill: { height: "100%", borderRadius: 2 },
  detectionConfidence: { fontSize: 10, fontWeight: "700", marginTop: 4 },

  // Advices
  adviceList: { gap: 8 },
  adviceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
  },
  adviceNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  adviceNumberText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  adviceText: {
    flex: 1,
    fontSize: 13,
    color: "#166534",
    lineHeight: 20,
    fontWeight: "500",
  },

  // Result Actions
  resultActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  resultActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  resultActionBtnPrimary: {
    backgroundColor: "#22C55E",
  },
  resultActionText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  resultActionTextPrimary: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // History Preview
  historyPreview: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  historyTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  historyLink: { fontSize: 13, fontWeight: "700", color: "#22C55E" },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    marginBottom: 8,
  },
  historyThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  historyInfo: { flex: 1 },
  historyDate: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  historyScore: { fontSize: 14, fontWeight: "700", marginTop: 2 },

  // Bottom Actions
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
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
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#22C55E",
  },
  bottomBtnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
