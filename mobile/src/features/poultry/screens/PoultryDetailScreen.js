import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Animated,
  Platform,
  Image,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import { BlurView } from "expo-blur";
import { LinearGradient as LG } from "expo-linear-gradient";
import { LineChart } from "react-native-chart-kit";

// Services
import {
  getMonitoringData,
  getPoultryById,
  deletePoultry,
} from "../../../services/poultry";
import Toast from "../../../components/Toast";
import ActuatorControl from "../../../components/ActuatorControl";
import MeasurementHistory from "../../../components/MeasurementHistory";

const { width } = Dimensions.get("window");

export default function PoultryDetailScreen({ route, navigation }) {
  const { poultryId, poultryName } = route.params || {};
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [poultryInfo, setPoultryInfo] = useState({
    name: poultryName || "Poulailler",
    location: "Chargement...",
    animalCount: 0,
    photoUrl: null,
  });
  const [actuators, setActuators] = useState({
    door: {
      status: "Fermée",
      mode: "Auto",
      icon: "door-front",
      color: "#10b981",
    },
    ventilation: {
      status: "Arrêt",
      mode: "Auto",
      icon: "toys",
      color: "#3b82f6",
    },
  });
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  // State pour le toggle du graphique
  const [selectedChart, setSelectedChart] = useState("temp");

  // Padding dynamique
  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  // Animation live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const poultryRes = await getPoultryById(poultryId);
      if (poultryRes.success && poultryRes.data) {
        setPoultryInfo({
          name: poultryRes.data.name,
          location: poultryRes.data.location || "Non spécifié",
          animalCount: poultryRes.data.animalCount || 0,
          photoUrl: poultryRes.data.photoUrl,
        });
      }

      const res = await getMonitoringData(poultryId);
      if (res.success && res.data) {
        const getVal = (field) => {
          const val = res.data[field];
          if (val && typeof val.current === "number") return val.current;
          if (typeof val === "number") return val;
          return 0;
        };

        setData({
          temperature: getVal("temperature").toFixed(1),
          humidity: getVal("humidity").toFixed(1),
          co2: getVal("co2").toFixed(0),
          nh3: getVal("nh3").toFixed(1),
          dust: getVal("dust").toFixed(0),
          waterLevel: getVal("waterLevel") || 85,
          status: "online",
          lastUpdated: new Date(
            res.data.timestamp || Date.now(),
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          history: res.data.history || [],
        });

        if (res.data.actuatorStates) {
          setActuators({
            door: {
              status:
                res.data.actuatorStates.door === "open" ? "Ouverte" : "Fermée",
              mode: "Auto",
              icon: "door-front",
              color:
                res.data.actuatorStates.door === "open" ? "#10b981" : "#64748b",
            },
            ventilation: {
              status:
                res.data.actuatorStates.ventilation === "on"
                  ? "Actif"
                  : "Arrêt",
              mode: "Auto",
              icon: "toys",
              color:
                res.data.actuatorStates.ventilation === "on"
                  ? "#3b82f6"
                  : "#64748b",
            },
          });
        }
      }
    } catch (e) {
      console.log("Monitoring fetch error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [poultryId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleDelete = () => {
    Alert.alert(
      "Supprimer le poulailler",
      "Êtes-vous sûr ? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await deletePoultry(poultryId);
              if (res) {
                setToast({
                  visible: true,
                  message: "Poulailler supprimé",
                  type: "success",
                });
                setTimeout(() => navigation.goBack(), 1500);
              }
            } catch (error) {
              setToast({
                visible: true,
                message: "Impossible de supprimer",
                type: "error",
              });
            }
          },
        },
      ],
    );
  };

  const currentText = darkMode ? colors.white : colors.slate900;
  const currentBg = darkMode ? colors.slate950 : colors.slate50;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: currentBg }]}
      edges={["left", "right"]}
    >
      <StatusBar style={darkMode ? "light" : "dark"} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: dynamicPaddingBottom },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          {poultryInfo.photoUrl ? (
            <Image
              source={{ uri: poultryInfo.photoUrl }}
              style={styles.heroImage}
            />
          ) : (
            <LG
              colors={["#134e4a", "#065f46", "#022c22"]}
              style={styles.heroImage}
            />
          )}

          <LG
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={StyleSheet.absoluteFill}
          />

          <View style={[styles.headerActions, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.goBack()}
            >
              <BlurView intensity={40} style={StyleSheet.absoluteFill} />
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() =>
                  navigation.navigate("AlertSettings", { poultryId })
                }
              >
                <BlurView intensity={40} style={StyleSheet.absoluteFill} />
                <Ionicons name="notifications-outline" size={22} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleDelete}
              >
                <BlurView intensity={40} style={StyleSheet.absoluteFill} />
                <Ionicons name="trash-outline" size={22} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          {/* Summary Card */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: darkMode ? colors.slate800 : colors.white },
            ]}
          >
            <View style={styles.summaryInfo}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.poultryNameText, { color: currentText }]}>
                  {poultryInfo.name}
                </Text>
                <View style={styles.locationRow}>
                  <MaterialIcons name="location-on" size={14} color="#94a3b8" />
                  <Text style={styles.locationText}>
                    {poultryInfo.location}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.birdCountBadge,
                  {
                    backgroundColor: darkMode
                      ? "rgba(34,197,94,0.15)"
                      : "#f0fdf4",
                  },
                ]}
              >
                <Text style={styles.birdCountText}>
                  {poultryInfo.animalCount}
                </Text>
                <Text style={{ fontSize: 18 }}>🐔</Text>
              </View>
            </View>

            {/* Live indicator */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 12,
              }}
            >
              <Animated.View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#22c55e",
                  transform: [{ scale: pulseAnim }],
                }}
              />
              <Text
                style={{ fontSize: 12, color: "#94a3b8", fontWeight: "600" }}
              >
                {data?.lastUpdated
                  ? `Mis à jour ${data.lastUpdated}`
                  : "En ligne"}
              </Text>
            </View>
          </View>

          {loading && !refreshing ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#22c55e" />
              <Text style={[styles.loaderText, { color: currentText }]}>
                Synchronisation...
              </Text>
            </View>
          ) : (
            <>
              {/* Grille des capteurs */}
              <View style={styles.grid}>
                {/* Température */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons
                      name="thermostat"
                      size={18}
                      color="#ef4444"
                    />
                    <Text style={styles.cardLabel}>TEMPÉRATURE</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.temperature || "24.5"}
                    </Text>
                    <Text style={styles.valueUnit}>°C</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(34,197,94,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#22c55e" }]}>
                      OPTIMAL
                    </Text>
                  </View>
                </View>

                {/* Humidité */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons
                      name="water-drop"
                      size={18}
                      color="#3b82f6"
                    />
                    <Text style={styles.cardLabel}>HUMIDITÉ</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.humidity || "62"}
                    </Text>
                    <Text style={styles.valueUnit}>%</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(59,130,246,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#3b82f6" }]}>
                      NORMAL
                    </Text>
                  </View>
                </View>

                {/* CO₂ */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="air" size={18} color="#f97316" />
                    <Text style={styles.cardLabel}>CO₂</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.co2 || "950"}
                    </Text>
                    <Text style={styles.valueUnit}>ppm</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(34,197,94,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#22c55e" }]}>
                      BON
                    </Text>
                  </View>
                </View>

                {/* NH₃ */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="science" size={18} color="#a855f7" />
                    <Text style={styles.cardLabel}>NH₃</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.nh3 || "8.5"}
                    </Text>
                    <Text style={styles.valueUnit}>ppm</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(34,197,94,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#22c55e" }]}>
                      BON
                    </Text>
                  </View>
                </View>

                {/* Poussière */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="blur-on" size={18} color="#f59e0b" />
                    <Text style={styles.cardLabel}>POUSSIÈRE</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.dust || "45"}
                    </Text>
                    <Text style={styles.valueUnit}>µg/m³</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(34,197,94,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#22c55e" }]}>
                      FAIBLE
                    </Text>
                  </View>
                </View>

                {/* Niveau d'eau */}
                <View
                  style={[
                    styles.gridCard,
                    {
                      backgroundColor: darkMode
                        ? colors.slate800
                        : colors.white,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <MaterialIcons name="water" size={18} color="#06b6d4" />
                    <Text style={styles.cardLabel}>NIVEAU EAU</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <Text style={[styles.valueText, { color: currentText }]}>
                      {data?.waterLevel || "85"}
                    </Text>
                    <Text style={styles.valueUnit}>%</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: "rgba(34,197,94,0.15)" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: "#22c55e" }]}>
                      SUFFISANT
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tendance 24h avec toggle complet */}
              <View
                style={[
                  styles.panel,
                  {
                    backgroundColor: darkMode ? colors.slate800 : colors.white,
                  },
                ]}
              >
                <View style={styles.chartHeader}>
                  <Text style={[styles.panelTitle, { color: currentText }]}>
                    Tendance 24h
                  </Text>
                  <View style={{ height: 12 }} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.periodToggle}>
                      {[
                        { key: "temp", label: "Temp" },
                        { key: "humid", label: "Hum" },
                        { key: "co2", label: "CO₂" },
                        { key: "nh3", label: "NH₃" },
                        { key: "dust", label: "Poussière" },
                        { key: "water", label: "Eau" },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            styles.toggleBtn,
                            selectedChart === item.key &&
                              styles.toggleBtnActive,
                          ]}
                          onPress={() => setSelectedChart(item.key)}
                        >
                          <Text
                            style={[
                              styles.toggleText,
                              selectedChart === item.key && {
                                color: "#fff",
                              },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <LineChart
                  data={{
                    labels: ["00h", "04h", "08h", "12h", "16h", "20h"],
                    datasets: [
                      {
                        data:
                          data?.history?.length > 0
                            ? data.history
                            : [20, 25, 28, 24, 22, 26],
                        color: (opacity = 1) =>
                          selectedChart === "temp"
                            ? `rgba(34, 197, 94, ${opacity})`
                            : selectedChart === "humid"
                              ? `rgba(59, 130, 246, ${opacity})`
                              : selectedChart === "co2"
                                ? `rgba(249, 115, 22, ${opacity})`
                                : selectedChart === "nh3"
                                  ? `rgba(139, 92, 246, ${opacity})`
                                  : selectedChart === "dust"
                                    ? `rgba(245, 158, 11, ${opacity})`
                                    : `rgba(6, 182, 212, ${opacity})`,
                        strokeWidth: 3,
                      },
                    ],
                  }}
                  width={width - 56}
                  height={220}
                  withVerticalLines={false}
                  withHorizontalLines={false}
                  chartConfig={{
                    backgroundColor: "transparent",
                    backgroundGradientFrom: darkMode ? "#1e293b" : "#ffffff",
                    backgroundGradientTo: darkMode ? "#1e293b" : "#ffffff",
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    labelColor: () => "#94a3b8",
                    propsForDots: { r: "4", strokeWidth: "2" },
                    style: { borderRadius: 16 },
                  }}
                  bezier
                  style={styles.chart}
                />
              </View>

              {/* Actionneurs */}
              <ActuatorControl
                actuators={actuators}
                poultryId={poultryId}
                darkMode={darkMode}
                colors={colors}
              />

              {/* Espace entre ActuatorControl et MeasurementHistory */}
              <View style={{ height: 32 }} />

              {/* Historique */}
              <MeasurementHistory
                poultryId={poultryId}
                darkMode={darkMode}
                colors={colors}
              />

              {/* Espace entre historique et boutons */}
              <View style={{ height: 32 }} />

              {/* Boutons d'action */}
              <View style={styles.actionButtonsContainer}>
                <TouchableOpacity
                  style={styles.solidBtn}
                  onPress={() =>
                    navigation.navigate("AlertSettings", { poultryId })
                  }
                >
                  <LG
                    colors={["#22c55e", "#16a34a"]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                  <Ionicons name="settings-outline" size={20} color="#fff" />
                  <Text style={styles.solidBtnText}>
                    Configuration des seuils
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => navigation.navigate("History", { poultryId })}
                >
                  <Ionicons name="time-outline" size={20} color="#22C55E" />
                  <Text style={styles.outlineBtnText}>Historique complet</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 110 },
  heroContainer: { height: 320, width: "100%", position: "relative" },
  heroImage: { width: "100%", height: "100%", resizeMode: "cover" },
  headerActions: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  contentContainer: { marginTop: -48, paddingHorizontal: 16 },
  summaryCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 20,
  },
  summaryInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  poultryNameText: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  locationText: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
  birdCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  birdCountText: { fontSize: 18, fontWeight: "800", color: "#22C55E" },
  loaderContainer: {
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: { marginTop: 12, fontSize: 14, fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
  },
  gridCard: {
    width: (width - 44) / 2,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 0.5,
  },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  valueText: { fontSize: 26, fontWeight: "800" },
  valueUnit: { fontSize: 14, fontWeight: "700", color: "#64748b" },
  statusPill: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  periodToggle: { flexDirection: "row", gap: 6 },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  toggleBtnActive: { backgroundColor: "#22C55E" },
  toggleText: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  panel: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  panelTitle: { fontSize: 16, fontWeight: "700" },
  panelSubtitle: { fontSize: 12, fontWeight: "700", color: "#94a3b8" },
  chart: { marginLeft: -16 },
  sectionHeader: { marginBottom: 16, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  actionButtonsContainer: { gap: 12 },
  solidBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 4,
    shadowColor: "#22C55E",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    overflow: "hidden",
  },
  solidBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  outlineBtn: {
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#22C55E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  outlineBtnText: { color: "#22C55E", fontSize: 15, fontWeight: "700" },
});
