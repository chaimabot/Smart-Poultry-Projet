import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { LineChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";
import { getMeasureHistory } from "../services/poultry";

const { width } = Dimensions.get("window");

const PERIODS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7j" },
  { key: "30d", label: "30j" },
];

const SENSORS = [
  { key: "temperature", label: "Temp", unit: "°C", color: "#22C55E" },
  { key: "humidity", label: "Hum", unit: "%", color: "#3B82F6" },
  { key: "co2", label: "CO₂", unit: "ppm", color: "#F97316" },
  { key: "nh3", label: "NH₃", unit: "ppm", color: "#8B5CF6" },
  { key: "dust", label: "Pouss", unit: "µg", color: "#F59E0B" },
  { key: "waterLevel", label: "Eau", unit: "%", color: "#06B6D4" },
];

// ── Formatage de l'heure/date selon la période ────────────────────────────────
const formatLabel = (timestamp, period) => {
  const date = new Date(timestamp);
  if (period === "30d") {
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    });
  }
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── Échantillonner à N points max pour le graphique ───────────────────────────
const sampleData = (arr, n = 6) => {
  if (!arr || arr.length === 0) return [];
  if (arr.length <= n) return arr;
  const step = Math.floor(arr.length / n);
  return Array.from({ length: n }, (_, i) => arr[i * step]);
};

export default function MeasurementHistory({ darkMode = false, poultryId }) {
  const [selectedPeriod, setSelectedPeriod] = useState("24h");
  const [selectedSensor, setSelectedSensor] = useState("temperature");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawData, setRawData] = useState([]); // données complètes du backend

  const sensor = SENSORS.find((s) => s.key === selectedSensor);

  // ── Chargement des données ─────────────────────────────────────────────────
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

  // ── Données pour le graphique (6 points) ──────────────────────────────────
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

  const chartConfig = {
    backgroundColor: "transparent",
    backgroundGradientFrom: darkMode ? "#1e293b" : "#ffffff",
    backgroundGradientTo: darkMode ? "#1e293b" : "#ffffff",
    decimalPlaces: 1,
    color: () => sensor.color,
    labelColor: () => "#94a3b8",
    propsForDots: { r: "4", strokeWidth: "2", stroke: sensor.color },
  };

  const cardBg = darkMode
    ? "rgba(30, 41, 59, 0.7)"
    : "rgba(255, 255, 255, 0.7)";
  const textColor = darkMode ? "#fff" : "#0f172a";
  const secondaryText = "#64748b";

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>
        Historique des Mesures
      </Text>

      {/* ── Sélection période ─────────────────────────────────────────── */}
      <View style={styles.row}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.pill, selectedPeriod === p.key && styles.pillActive]}
            onPress={() => setSelectedPeriod(p.key)}
          >
            <Text
              style={[
                styles.pillText,
                selectedPeriod === p.key && styles.pillTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Sélection capteur ─────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.row, { gap: 8 }]}>
          {SENSORS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[
                styles.sensorPill,
                selectedSensor === s.key && {
                  backgroundColor: s.color,
                  borderColor: s.color,
                },
              ]}
              onPress={() => setSelectedSensor(s.key)}
            >
              <Text
                style={[
                  styles.sensorPillText,
                  selectedSensor === s.key && { color: "#fff" },
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ── Graphique ─────────────────────────────────────────────────── */}
      {loading ? (
        <View style={[styles.placeholder, { backgroundColor: cardBg }]}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={[styles.placeholderText, { color: secondaryText }]}>
            Chargement...
          </Text>
        </View>
      ) : error ? (
        <View style={[styles.placeholder, { backgroundColor: cardBg }]}>
          <Text style={{ color: "#ef4444", fontWeight: "600" }}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <BlurView
          intensity={20}
          tint={darkMode ? "dark" : "light"}
          style={[styles.chartCard, { backgroundColor: cardBg }]}
        >
          {/* Info capteur sélectionné */}
          <View style={styles.chartLegend}>
            <View
              style={[styles.legendDot, { backgroundColor: sensor.color }]}
            />
            <Text style={[styles.legendLabel, { color: textColor }]}>
              {sensor.label} ({sensor.unit})
            </Text>
            <Text style={[styles.legendCount, { color: secondaryText }]}>
              {rawData.length} mesures
            </Text>
          </View>

          <LineChart
            data={chartData}
            width={width - 72}
            height={200}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
            withInnerLines={false}
            withOuterLines={false}
          />
        </BlurView>
      )}

      {/* ── Tableau des dernières mesures ─────────────────────────────── */}
      {!loading && !error && rawData.length > 0 && (
        <BlurView
          intensity={20}
          tint={darkMode ? "dark" : "light"}
          style={[styles.tableCard, { backgroundColor: cardBg }]}
        >
          {/* En-tête */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellTime]}>
              Date / Heure
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellValue]}>
              {sensor.label}
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellUnit]}>Unité</Text>
          </View>

          {/* Lignes */}
          <ScrollView style={styles.tableBody} nestedScrollEnabled>
            {rawData.slice(0, 20).map((item, index) => (
              <View
                key={index}
                style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
              >
                <Text
                  style={[
                    styles.tableCell,
                    styles.cellTime,
                    { color: textColor },
                  ]}
                >
                  {formatLabel(item.timestamp, selectedPeriod)}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.cellValue,
                    { color: sensor.color },
                  ]}
                >
                  {parseFloat(item.value).toFixed(1)}
                </Text>
                <Text
                  style={[
                    styles.tableCell,
                    styles.cellUnit,
                    { color: secondaryText },
                  ]}
                >
                  {sensor.unit}
                </Text>
              </View>
            ))}
          </ScrollView>
        </BlurView>
      )}

      {/* ── Aucune donnée ─────────────────────────────────────────────── */}
      {!loading && !error && rawData.length === 0 && (
        <View style={[styles.placeholder, { backgroundColor: cardBg }]}>
          <Text style={{ color: secondaryText, fontWeight: "600" }}>
            Aucune donnée pour cette période
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },

  row: { flexDirection: "row", gap: 8 },

  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
  },
  pillActive: { backgroundColor: "#22C55E" },
  pillText: { fontSize: 13, fontWeight: "700", color: "#64748b" },
  pillTextActive: { color: "#fff" },

  sensorPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
  },
  sensorPillText: { fontSize: 12, fontWeight: "700", color: "#64748b" },

  placeholder: {
    height: 180,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  placeholderText: { fontSize: 14, fontWeight: "500" },

  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#22C55E",
  },
  retryText: { color: "#fff", fontWeight: "700" },

  chartCard: { borderRadius: 20, padding: 16, overflow: "hidden" },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 14, fontWeight: "700", flex: 1 },
  legendCount: { fontSize: 12, fontWeight: "500" },
  chart: { marginLeft: -16, borderRadius: 16 },

  tableCard: { borderRadius: 20, overflow: "hidden", maxHeight: 300 },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableBody: { maxHeight: 220 },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  tableRowAlt: { backgroundColor: "rgba(0,0,0,0.02)" },
  tableCell: { fontSize: 13, fontWeight: "600" },
  cellTime: { flex: 2 },
  cellValue: { flex: 1, textAlign: "center" },
  cellUnit: { flex: 1, textAlign: "right" },
});
