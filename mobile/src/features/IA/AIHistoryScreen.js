// screens/ai/AIHistoryScreen.js
// ============================================================
// Historique des analyses IA — Smart Poultry
// Connecté à GET /api/ai/history/:id et /api/ai/stats/:id
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Modal,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";

import { useAIAnalysis } from "../../hooks/useAIAnalysis";

const { width } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

const getStatusColor = (status) => {
  switch (status) {
    case "ok":
      return "#22C55E";
    case "warn":
      return "#F59E0B";
    case "danger":
      return "#EF4444";
    default:
      return "#CBD5E1";
  }
};

const getBadgeStyle = (status) => {
  switch (status) {
    case "ok":
      return { bg: "#F0FDF4", text: "#166534" };
    case "warn":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "danger":
      return { bg: "#FEF2F2", text: "#991B1B" };
    default:
      return { bg: "#F1F5F9", text: "#64748B" };
  }
};

const getScoreColor = (score) => {
  if (score >= 70) return "#22C55E";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
};

function fmtRelative(iso) {
  if (!iso) return "--";
  const now = Date.now();
  const diff = now - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Il y a moins d'1h";
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  return `Il y a ${days}j`;
}

function fmtDateGroup(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today - d) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return "Cette semaine";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}

// ── Composants ────────────────────────────────────────────────────────────────

const ScoreBar = ({ score, status }) => {
  const segments = 10;
  const filledCount = Math.round((score / 100) * segments);
  const color = getStatusColor(status);

  return (
    <View style={styles.scoreBar}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.scoreSegment,
            i < filledCount && { backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
};

const DateSeparator = ({ label }) => (
  <View style={styles.dateSep}>
    <View style={styles.dateSepLine} />
    <Text style={styles.dateSepText}>{label}</Text>
    <View style={styles.dateSepLine} />
  </View>
);

const HistoryCard = ({ item, onPressDetail, onPressChat }) => {
  const badgeStyle = getBadgeStyle(item.status);

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={styles.historyThumb}>
          <Text style={styles.thumbText}>📸</Text>
        </View>

        <View style={styles.historyInfo}>
          <Text style={styles.historyTime}>
            {item.time} • {fmtRelative(item.createdAt)}
          </Text>
          <View style={styles.scoreRow}>
            <ScoreBar score={item.healthScore} status={item.status} />
            <Text
              style={[
                styles.scoreNumber,
                { color: getScoreColor(item.healthScore) },
              ]}
            >
              {item.healthScore}
            </Text>
          </View>
        </View>

        <View style={[styles.badge, { backgroundColor: badgeStyle.bg }]}>
          <Text style={[styles.badgeText, { color: badgeStyle.text }]}>
            {item.badge}
          </Text>
        </View>
      </View>

      <View style={styles.diagnosticBox}>
        <Text style={styles.diagnosticText} numberOfLines={3}>
          {item.diagnostic || "Aucun diagnostic disponible."}
        </Text>
      </View>

      <View style={styles.historyFooter}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onPressChat}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnText}>💬 Chat IA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnPrimary}
          onPress={onPressDetail}
          activeOpacity={0.7}
        >
          <Text style={styles.actionBtnPrimaryText}>⋮ Détails</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const FILTER_OPTIONS = ["Tout", "Normal", "Attention", "Critique"];

const FilterDropdown = ({ selected, onSelect }) => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.filterDropdown}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.filterIcon}>🔽</Text>
        <Text style={styles.filterText}>{selected}</Text>
        <Text style={styles.filterChevron}>▼</Text>
      </TouchableOpacity>

      <Modal
        transparent
        visible={visible}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setVisible(false)}
        >
          <View style={styles.modalContent}>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.modalItem,
                  opt === selected && styles.modalItemActive,
                ]}
                onPress={() => {
                  onSelect(opt);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.modalItemText,
                    opt === selected && styles.modalItemTextActive,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

// ── Écran principal ───────────────────────────────────────────────────────────
export default function AIHistoryScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { poultryId, poultryName } = route?.params || {};

  const { history, stats, fetchHistory, fetchStats } = useAIAnalysis(poultryId);

  const [filter, setFilter] = useState("Tout");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Chargement initial
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchHistory(), fetchStats()]);
      setLoading(false);
    })();
  }, []);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchHistory(), fetchStats()]);
    setRefreshing(false);
  }, [fetchHistory, fetchStats]);

  // Filtrage
  const filtered = history.filter((item) => {
    if (filter === "Tout") return true;
    if (filter === "Normal") return item.status === "ok";
    if (filter === "Attention") return item.status === "warn";
    if (filter === "Critique") return item.status === "danger";
    return true;
  });

  // Groupement par date
  const grouped = filtered.reduce((acc, item) => {
    const group = fmtDateGroup(item.createdAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Historique IA {poultryName ? `— ${poultryName}` : ""}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={styles.loadingText}>Chargement de l'historique…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#22C55E"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── Stats ── */}
          {stats && (
            <View style={styles.chartSection}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Évolution santé</Text>
                <View style={styles.chartPeriod}>
                  <Text style={styles.chartPeriodText}>📅 10 dernières</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Text
                    style={[
                      styles.statPillValue,
                      { color: getScoreColor(stats.avgHealthScore) },
                    ]}
                  >
                    {stats.avgHealthScore}
                  </Text>
                  <Text style={styles.statPillLabel}>Score moyen</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statPillValue}>
                    {stats.totalAnalyses}
                  </Text>
                  <Text style={styles.statPillLabel}>Analyses</Text>
                </View>
                <View style={styles.statPill}>
                  <Text
                    style={[
                      styles.statPillValue,
                      stats.trend === "amelioration"
                        ? { color: "#22C55E" }
                        : stats.trend === "degradation"
                          ? { color: "#EF4444" }
                          : {},
                    ]}
                  >
                    {stats.trend === "amelioration"
                      ? "↑"
                      : stats.trend === "degradation"
                        ? "↓"
                        : "→"}
                  </Text>
                  <Text style={styles.statPillLabel}>Tendance</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Filtre ── */}
          <View style={styles.filterBar}>
            <FilterDropdown selected={filter} onSelect={setFilter} />
          </View>

          {/* ── Liste ── */}
          {Object.keys(grouped).length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>Aucune analyse</Text>
              <Text style={styles.emptyDesc}>
                {filter === "Tout"
                  ? "Lancez votre première analyse IA depuis l'écran principal."
                  : `Aucune analyse avec le statut "${filter}".`}
              </Text>
            </View>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <View key={group}>
                <DateSeparator label={group} />
                {items.map((item) => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    onPressDetail={() =>
                      navigation.navigate("AIDetail", {
                        analysisId: item.id,
                        poultryId,
                        poultryName,
                        data: item,
                      })
                    }
                    onPressChat={() =>
                      navigation.navigate("AIChat", {
                        poultryId,
                        poultryName,
                        context: item,
                      })
                    }
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAF9" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
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
  backBtnText: { fontSize: 18, color: "#1E293B" },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: "#1E293B" },

  // Loading
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { fontSize: 14, color: "#94A3B8", fontWeight: "600" },

  // Scroll
  scrollContent: { paddingBottom: 40 },

  // Chart / Stats
  chartSection: {
    margin: 20,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  chartTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  chartPeriod: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  chartPeriodText: { fontSize: 12, fontWeight: "600", color: "#64748B" },

  statsRow: { flexDirection: "row", gap: 12 },
  statPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  statPillValue: { fontSize: 20, fontWeight: "800", color: "#1E293B" },
  statPillLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 4,
  },

  // Filtre
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flex: 1,
  },
  filterIcon: { fontSize: 14 },
  filterText: { fontSize: 13, fontWeight: "600", color: "#1E293B", flex: 1 },
  filterChevron: { fontSize: 10, color: "#94A3B8" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalItem: { paddingVertical: 14, paddingHorizontal: 20 },
  modalItemActive: { backgroundColor: "#F0FDF4" },
  modalItemText: { fontSize: 15, color: "#1E293B", fontWeight: "500" },
  modalItemTextActive: { color: "#166534", fontWeight: "700" },

  // Date sep
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    marginTop: 8,
  },
  dateSepLine: { flex: 1, height: 1, backgroundColor: "#F1F5F9" },
  dateSepText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // History Card
  historyCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
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
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  historyThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { fontSize: 24 },
  historyInfo: { flex: 1 },
  historyTime: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  scoreBar: { flexDirection: "row", gap: 2 },
  scoreSegment: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#F1F5F9",
  },
  scoreNumber: { fontSize: 16, fontWeight: "800" },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },

  diagnosticBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
  },
  diagnosticText: { fontSize: 13, color: "#475569", lineHeight: 20 },

  historyFooter: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  actionBtnPrimary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
});
