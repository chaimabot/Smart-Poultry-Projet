import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LineChart } from "react-native-chart-kit";
import { useTheme } from "../../../context/ThemeContext";
import { getMeasureHistory } from "../../../services/poultry";

const { width } = Dimensions.get("window");

const PERIODS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
];

const SENSORS = [
  {
    key: "temperature",
    label: "Température",
    unit: "°C",
    color: "#22C55E",
    icon: "thermostat",
  },
  {
    key: "humidity",
    label: "Humidité",
    unit: "%",
    color: "#3B82F6",
    icon: "water-drop",
  },
  { key: "co2", label: "CO₂", unit: "ppm", color: "#F97316", icon: "air" },
  { key: "nh3", label: "NH₃", unit: "ppm", color: "#8B5CF6", icon: "science" },
  {
    key: "dust",
    label: "Poussière",
    unit: "µg/m³",
    color: "#F59E0B",
    icon: "blur-on",
  },
  {
    key: "waterLevel",
    label: "Niveau Eau",
    unit: "%",
    color: "#06B6D4",
    icon: "water",
  },
];

const formatLabel = (timestamp, period) => {
  const date = new Date(timestamp);
  if (period === "30d") {
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
  }
  if (period === "7d") {
    return date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
    });
  }
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sampleData = (arr, n = 6) => {
  if (!arr || arr.length === 0) return [];
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr[i * step]);
};

export default function HistoryScreen({ route, navigation }) {
  const { poultryId } = route.params || {};
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [selectedPeriod, setSelectedPeriod] = useState("24h");
  const [selectedSensor, setSelectedSensor] = useState("temperature");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawData, setRawData] = useState([]);

  const sensor = SENSORS.find((s) => s.key === selectedSensor);

  const loadData = useCallback(async () => {
    if (!poultryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMeasureHistory(
        poultryId,
        selectedSensor,
        selectedPeriod,
      );
      if (res.success) {
        setRawData(res.data || []);
      } else {
        setError("Impossible de charger l'historique");
        setRawData([]);
      }
    } catch (e) {
      setError("Erreur de connexion");
      setRawData([]);
    } finally {
      setLoading(false);
    }
  }, [poultryId, selectedSensor, selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sampled = sampleData(rawData, 6);
  const chartLabels = sampled.map((d) =>
    formatLabel(d.timestamp, selectedPeriod),
  );
  const chartValues = sampled.map((d) => parseFloat(d.value) || 0);

  const chartData = {
    labels:
      chartLabels.length > 0
        ? chartLabels
        : ["--", "--", "--", "--", "--", "--"],
    datasets: [
      {
        data: chartValues.length > 0 ? chartValues : [0, 0, 0, 0, 0, 0],
        color: () => sensor.color,
        strokeWidth: 3,
      },
    ],
  };

  const currentBg = darkMode ? colors.slate950 : colors.slate50;
  const cardBg = darkMode ? colors.slate800 : colors.white;
  const currentText = darkMode ? colors.white : colors.slate900;
  const subText = "#94a3b8";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: currentBg }]}
      edges={["left", "right"]}
    >
      <StatusBar style={darkMode ? "light" : "dark"} />

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: cardBg },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={currentText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: currentText }]}>
          Historique complet
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.sensorSection, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionLabel, { color: subText }]}>CAPTEUR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.sensorRow}>
              {SENSORS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.sensorChip,
                    selectedSensor === s.key && {
                      backgroundColor: s.color + "20",
                      borderColor: s.color,
                    },
                  ]}
                  onPress={() => setSelectedSensor(s.key)}
                >
                  <MaterialIcons
                    name={s.icon}
                    size={14}
                    color={selectedSensor === s.key ? s.color : subText}
                  />
                  <Text
                    style={[
                      styles.sensorChipText,
                      { color: selectedSensor === s.key ? s.color : subText },
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ── Sélection période ──────────────────────────────────────────────── */}
        <View style={[styles.periodSection, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionLabel, { color: subText }]}>PÉRIODE</Text>
          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[
                  styles.periodBtn,
                  selectedPeriod === p.key && { backgroundColor: "#22C55E" },
                ]}
                onPress={() => setSelectedPeriod(p.key)}
              >
                <Text
                  style={[
                    styles.periodBtnText,
                    selectedPeriod === p.key && { color: "#fff" },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 16, marginTop: 16 }}>
          {/* ── Graphique ────────────────────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.cardTopRow}>
              <View
                style={[styles.sensorDot, { backgroundColor: sensor.color }]}
              />
              <Text style={[styles.cardTitle, { color: currentText }]}>
                {sensor.label} ({sensor.unit})
              </Text>
              <Text style={[styles.countBadge, { color: subText }]}>
                {rawData.length} mesures
              </Text>
            </View>

            {loading ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color="#22C55E" />
                <Text style={[styles.placeholderText, { color: subText }]}>
                  Chargement...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.placeholder}>
                <MaterialIcons name="error-outline" size={32} color="#ef4444" />
                <Text
                  style={{ color: "#ef4444", fontWeight: "600", marginTop: 8 }}
                >
                  {error}
                </Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                  <Text style={styles.retryText}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <LineChart
                data={chartData}
                width={width - 64}
                height={220}
                chartConfig={{
                  backgroundColor: "transparent",
                  backgroundGradientFrom: darkMode ? "#1e293b" : "#ffffff",
                  backgroundGradientTo: darkMode ? "#1e293b" : "#ffffff",
                  decimalPlaces: 1,
                  color: () => sensor.color,
                  labelColor: () => subText,
                  propsForDots: {
                    r: "4",
                    strokeWidth: "2",
                    stroke: sensor.color,
                  },
                }}
                bezier
                withInnerLines={false}
                withOuterLines={false}
                style={styles.chart}
              />
            )}
          </View>

          {/* ── Stats rapides ─────────────────────────────────────────────────── */}
          {!loading &&
            !error &&
            rawData.length > 0 &&
            (() => {
              const values = rawData.map((d) => parseFloat(d.value));
              const min = Math.min(...values).toFixed(1);
              const max = Math.max(...values).toFixed(1);
              const avg = (
                values.reduce((a, b) => a + b, 0) / values.length
              ).toFixed(1);
              return (
                <View style={styles.statsRow}>
                  {[
                    { label: "MIN", value: min, color: "#3B82F6" },
                    { label: "MOY", value: avg, color: "#22C55E" },
                    { label: "MAX", value: max, color: "#EF4444" },
                  ].map((stat) => (
                    <View
                      key={stat.label}
                      style={[styles.statCard, { backgroundColor: cardBg }]}
                    >
                      <Text style={[styles.statLabel, { color: subText }]}>
                        {stat.label}
                      </Text>
                      <Text style={[styles.statValue, { color: stat.color }]}>
                        {stat.value}
                      </Text>
                      <Text style={[styles.statUnit, { color: subText }]}>
                        {sensor.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}

          {/* ── Tableau ───────────────────────────────────────────────────────── */}
          {!loading && !error && rawData.length > 0 && (
            <View
              style={[styles.card, { backgroundColor: cardBg, padding: 0 }]}
            >
              {/* En-tête tableau */}
              <View
                style={[
                  styles.tableHeader,
                  { borderBottomColor: darkMode ? "#334155" : "#f1f5f9" },
                ]}
              >
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>
                  Date / Heure
                </Text>
                <Text
                  style={[
                    styles.tableHeaderCell,
                    { flex: 1, textAlign: "center" },
                  ]}
                >
                  Valeur
                </Text>
                <Text
                  style={[
                    styles.tableHeaderCell,
                    { flex: 1, textAlign: "right" },
                  ]}
                >
                  Unité
                </Text>
              </View>

              {/* Lignes */}
              {rawData.slice(0, 50).map((item, index) => (
                <View
                  key={index}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && {
                      backgroundColor: darkMode
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                    },
                    { borderBottomColor: darkMode ? "#1e293b" : "#f8fafc" },
                  ]}
                >
                  <Text
                    style={[styles.tableCell, { flex: 2, color: currentText }]}
                  >
                    {formatLabel(item.timestamp, selectedPeriod)}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        flex: 1,
                        textAlign: "center",
                        color: sensor.color,
                        fontWeight: "700",
                      },
                    ]}
                  >
                    {parseFloat(item.value).toFixed(1)}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      { flex: 1, textAlign: "right", color: subText },
                    ]}
                  >
                    {sensor.unit}
                  </Text>
                </View>
              ))}

              {rawData.length > 50 && (
                <View style={styles.moreRow}>
                  <Text
                    style={{ color: subText, fontSize: 12, fontWeight: "600" }}
                  >
                    + {rawData.length - 50} mesures supplémentaires
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Aucune donnée ─────────────────────────────────────────────────── */}
          {!loading && !error && rawData.length === 0 && (
            <View
              style={[
                styles.card,
                styles.placeholder,
                { backgroundColor: cardBg },
              ]}
            >
              <MaterialIcons name="bar-chart" size={40} color={subText} />
              <Text style={{ color: subText, fontWeight: "600", marginTop: 8 }}>
                Aucune donnée pour cette période
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    elevation: 2,
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "800" },

  sensorSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 2,
  },
  periodSection: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
  },

  sensorRow: { flexDirection: "row", gap: 8 },
  sensorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  sensorChipText: { fontSize: 12, fontWeight: "700" },

  periodRow: { flexDirection: "row", gap: 10 },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
  },
  periodBtnText: { fontSize: 13, fontWeight: "700", color: "#64748b" },

  card: {
    borderRadius: 20,
    padding: 16,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sensorDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  countBadge: { fontSize: 12, fontWeight: "500" },
  chart: { marginLeft: -8, borderRadius: 12 },

  statsRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    elevation: 2,
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statUnit: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderRadius: 20,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tableCell: { fontSize: 13, fontWeight: "600" },
  moreRow: {
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },

  placeholder: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 20,
  },
  placeholderText: { fontSize: 14, fontWeight: "500" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#22C55E",
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
