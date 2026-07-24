// screens/ai/AIHistoryScreen.js

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import api from "../../services/api";

const { width } = Dimensions.get("window");

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyConfig(level) {
  if (level === "critique")
    return {
      color: "#DC2626",
      darkColor: "#A32D2D",
      bg: "#FCEBEB",
      diagBg: "#FFF5F5",
      textColor: "#791F1F",
      accent: "#EF4444",
      label: "Critique",
      icon: "error-outline",
    };
  if (level === "attention")
    return {
      color: "#D97706",
      darkColor: "#854F0B",
      bg: "#FAEEDA",
      diagBg: "#FFFBF2",
      textColor: "#633806",
      accent: "#F59E0B",
      label: "Attention",
      icon: "warning-amber",
    };
  if (level === "normal")
    return {
      color: "#639922",
      darkColor: "#3B6D11",
      bg: "#EAF3DE",
      diagBg: "#F8FAF6",
      textColor: "#27500A",
      accent: "#639922",
      label: "Normal",
      icon: "check-circle-outline",
    };
  return {
    color: "#64748B",
    darkColor: "#475569",
    bg: "#F1F5F9",
    diagBg: "#F8FAFC",
    textColor: "#334155",
    accent: "#94A3B8",
    label: "Inconnu",
    icon: "help-outline",
  };
}

function scoreColor(score) {
  if (score >= 70) return "#639922";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function scoreAccent(score) {
  if (score >= 70) return "#639922";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function fmtDate(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateGroup(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today - d) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return "Cette semaine";
  if (diff < 30) return "Ce mois-ci";
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ── Composants ────────────────────────────────────────────────────────────────

function DateSeparator({ label }) {
  return (
    <View style={S.dateSep}>
      <View style={S.dateSepLine} />
      <Text style={S.dateSepText}>{label}</Text>
      <View style={S.dateSepLine} />
    </View>
  );
}

function ScoreBar({ score }) {
  if (score === null || score === undefined) return null;
  return (
    <View style={S.barTrack}>
      <View
        style={[
          S.barFill,
          { width: `${score}%`, backgroundColor: scoreAccent(score) },
        ]}
      />
    </View>
  );
}

function HistoryCard({ item, onPressDetail, onPressChat }) {
  const level = item.result?.urgencyLevel ?? item.urgencyLevel;
  const score = item.result?.healthScore ?? item.healthScore;
  const cfg = urgencyConfig(level);
  const diagnostic =
    item.result?.diagnostic ??
    item.diagnostic ??
    "Aucun diagnostic disponible.";

  return (
    <View style={S.card}>
      {/* Accent top bar */}
      <View style={[S.cardAccent, { backgroundColor: cfg.accent }]} />

      <View style={S.cardBody}>
        {/* Header */}
        <View style={S.cardTop}>
          <View style={[S.thumb, { backgroundColor: cfg.bg }]}>
            {item.image?.url ? (
              <Image
                source={{ uri: item.image.thumbnailUrl || item.image.url }}
                style={{ width: 48, height: 48, borderRadius: 14 }}
                resizeMode="cover"
              />
            ) : (
              <MaterialIcons name="pets" size={22} color={cfg.darkColor} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={S.cardDateRow}>
              <View style={S.cardDateWrap}>
                <MaterialIcons name="access-time" size={10} color="#A0AEC0" />
                <Text style={S.cardDate}>{fmtDate(item.createdAt)}</Text>
              </View>
              <View style={[S.badge, { backgroundColor: cfg.bg }]}>
                <MaterialIcons
                  name={cfg.icon}
                  size={10}
                  color={cfg.textColor}
                  style={{ marginRight: 3 }}
                />
                <Text style={[S.badgeText, { color: cfg.textColor }]}>
                  {cfg.label}
                </Text>
              </View>
            </View>

            <View style={S.scoreRow}>
              {score !== null && score !== undefined ? (
                <>
                  <Text style={[S.scoreBig, { color: scoreColor(score) }]}>
                    {score}
                  </Text>
                  <Text style={S.scoreDenom}>/100</Text>
                </>
              ) : (
                <Text style={[S.scoreBig, { color: "#CBD5E1" }]}>—</Text>
              )}
            </View>

            <ScoreBar score={score} />
          </View>
        </View>

        {/* Diagnostic */}
        <View style={[S.diagBox, { backgroundColor: cfg.diagBg }]}>
          <View style={[S.diagIconWrap, { backgroundColor: cfg.bg }]}>
            <MaterialIcons
              name="medical-services"
              size={11}
              color={cfg.darkColor}
            />
          </View>
          <Text
            style={[S.diagText, { color: cfg.textColor }]}
            numberOfLines={3}
          >
            {diagnostic}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={S.cardFooter}>
        <TouchableOpacity
          style={S.btnChat}
          onPress={onPressChat}
          activeOpacity={0.7}
        >
          <MaterialIcons name="chat-bubble-outline" size={13} color="#4B5E3A" />
          <Text style={S.btnChatText}>Chat IA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[S.btnDetail, { backgroundColor: cfg.darkColor }]}
          onPress={onPressDetail}
          activeOpacity={0.7}
        >
          <MaterialIcons name="bar-chart" size={13} color="#fff" />
          <Text style={S.btnDetailText}>Voir les détails</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const FILTER_OPTIONS = [
  { key: "all", label: "Tout", dotColor: "#1A2E0A" },
  { key: "normal", label: "Normal", dotColor: "#639922" },
  { key: "attention", label: "Attention", dotColor: "#F59E0B" },
  { key: "critique", label: "Critique", dotColor: "#EF4444" },
];

function FilterBar({ selected, onSelect, counts }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={S.filterRow}
    >
      {FILTER_OPTIONS.map((opt) => {
        const active = selected === opt.key;
        const count = counts?.[opt.key];
        return (
          <TouchableOpacity
            key={opt.key}
            style={[S.chip, active && S.chipActive]}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.7}
          >
            <View
              style={[
                S.chipDot,
                { backgroundColor: active ? "#fff" : opt.dotColor },
              ]}
            />
            <Text style={[S.chipText, active && S.chipTextActive]}>
              {opt.label}
            </Text>
            {count !== undefined && (
              <View style={[S.chipCount, active && S.chipCountActive]}>
                <Text
                  style={[S.chipCountText, active && S.chipCountTextActive]}
                >
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Hero Stats Banner ─────────────────────────────────────────────────────────

function HeroBanner({ stats, history }) {
  if (!stats && !history?.length) return null;

  const avg = stats?.avgHealthScore ?? null;
  const total = history?.length ?? 0;
  const normals =
    history?.filter(
      (i) => (i.result?.urgencyLevel ?? i.urgencyLevel) === "normal",
    ).length ?? 0;
  const critiques =
    history?.filter(
      (i) => (i.result?.urgencyLevel ?? i.urgencyLevel) === "critique",
    ).length ?? 0;

  return (
    <View style={S.hero}>
      <View style={S.heroBg1} />
      <View style={S.heroBg2} />

      <Text style={S.heroLabel}>Score santé moyen</Text>
      <View style={S.heroScoreRow}>
        <Text style={[S.heroScore, avg !== null && { color: "#fff" }]}>
          {avg ?? "—"}
        </Text>
        <Text style={S.heroScoreDenom}>/100</Text>
      </View>

      <View style={S.heroStats}>
        <View style={S.heroStat}>
          <Text style={S.heroStatVal}>{total}</Text>
          <Text style={S.heroStatLbl}>Analyses</Text>
        </View>
        <View style={[S.heroStatDiv]} />
        <View style={S.heroStat}>
          <Text style={[S.heroStatVal, { color: "#97C459" }]}>{normals} ↑</Text>
          <Text style={S.heroStatLbl}>Normales</Text>
        </View>
        <View style={S.heroStatDiv} />
        <View style={S.heroStat}>
          <Text style={[S.heroStatVal, { color: "#F09595" }]}>
            {critiques} ↓
          </Text>
          <Text style={S.heroStatLbl}>Critiques</Text>
        </View>
      </View>
    </View>
  );
}

// ── Écran principal ───────────────────────────────────────────────────────────

export default function AIHistoryScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { poultryId, poultryName } = route?.params || {};

  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!poultryId) return;
    try {
      const [histRes, statsRes] = await Promise.all([
        api.get(`/ai/history/${poultryId}`),
        api.get(`/ai/stats/${poultryId}`).catch(() => ({ data: null })),
      ]);
      if (histRes.data?.success) setHistory(histRes.data.data || []);
      if (statsRes.data?.success) setStats(statsRes.data.data || null);
    } catch (_) {}
  }, [poultryId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const counts = {
    all: history.length,
    normal: history.filter(
      (i) => (i.result?.urgencyLevel ?? i.urgencyLevel) === "normal",
    ).length,
    attention: history.filter(
      (i) => (i.result?.urgencyLevel ?? i.urgencyLevel) === "attention",
    ).length,
    critique: history.filter(
      (i) => (i.result?.urgencyLevel ?? i.urgencyLevel) === "critique",
    ).length,
  };

  const filtered = history.filter((item) => {
    if (filter === "all") return true;
    return (item.result?.urgencyLevel ?? item.urgencyLevel) === filter;
  });

  const grouped = filtered.reduce((acc, item) => {
    const group = fmtDateGroup(item.createdAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <SafeAreaView style={S.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity
          style={S.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={19} color="#1A2E0A" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={S.headerTitle}>Historique des analyses</Text>
          {poultryName ? (
            <View style={S.headerSubRow}>
              <View style={S.headerDot} />
              <Text style={S.headerSub} numberOfLines={1}>
                {poultryName}
              </Text>
            </View>
          ) : null}
        </View>
        {!loading && (
          <View style={S.countPill}>
            <MaterialIcons
              name="history"
              size={13}
              color="#97C459"
              style={{ marginRight: 4 }}
            />
            <Text style={S.countText}>{filtered.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={S.loadingCenter}>
          <View style={S.loadingIconWrap}>
            <ActivityIndicator size="large" color="#639922" />
          </View>
          <Text style={S.loadingTitle}>Chargement…</Text>
          <Text style={S.loadingSub}>Récupération de l'historique</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={S.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#639922"
              colors={["#639922"]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner */}
          <HeroBanner stats={stats} history={history} />

          {/* Filters */}
          <FilterBar selected={filter} onSelect={setFilter} counts={counts} />

          {/* Cards */}
          {Object.keys(grouped).length === 0 ? (
            <View style={S.emptyState}>
              <View style={S.emptyIconWrap}>
                <MaterialIcons name="history" size={38} color="#C0DD97" />
              </View>
              <Text style={S.emptyTitle}>Aucune analyse trouvée</Text>
              <Text style={S.emptyDesc}>
                {filter === "all"
                  ? "Lancez votre première analyse depuis l'écran principal."
                  : `Aucun résultat pour le filtre "${FILTER_OPTIONS.find((f) => f.key === filter)?.label}".`}
              </Text>
              {filter !== "all" && (
                <TouchableOpacity
                  style={S.emptyBtn}
                  onPress={() => setFilter("all")}
                  activeOpacity={0.7}
                >
                  <Text style={S.emptyBtnText}>Afficher tout</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <View key={group}>
                <DateSeparator
                  label={`${group} · ${items.length} analyse${items.length > 1 ? "s" : ""}`}
                />
                {items.map((item, i) => (
                  <HistoryCard
                    key={item._id || item.id || i}
                    item={item}
                    onPressDetail={() =>
                      navigation.navigate("AIDetail", {
                        analysis: item,
                        poultryName,
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

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EEF0EC" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
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
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A2E0A",
    letterSpacing: -0.2,
  },
  headerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  headerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#639922",
  },
  headerSub: { fontSize: 11, color: "#8A9B7A" },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2E0A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  // Loading
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  loadingTitle: { fontSize: 14, fontWeight: "700", color: "#1A2E0A" },
  loadingSub: { fontSize: 12, color: "#8A9B7A" },

  // Scroll
  scroll: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 50 },

  // Hero Banner
  hero: {
    backgroundColor: "#1A2E0A",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  heroBg1: {
    position: "absolute",
    right: -10,
    top: -10,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(99,153,34,0.15)",
  },
  heroBg2: {
    position: "absolute",
    right: 20,
    bottom: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(99,153,34,0.08)",
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8A9B7A",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  heroScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 16,
  },
  heroScore: { fontSize: 44, fontWeight: "800", color: "#fff", lineHeight: 48 },
  heroScoreDenom: { fontSize: 16, color: "#8A9B7A", fontWeight: "400" },
  heroStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 12,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatVal: { fontSize: 16, fontWeight: "700", color: "#fff" },
  heroStatLbl: { fontSize: 10, color: "#8A9B7A", marginTop: 2 },
  heroStatDiv: {
    width: 0.5,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignSelf: "stretch",
  },

  // Filters
  filterRow: { gap: 6, paddingBottom: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.07)",
  },
  chipActive: { backgroundColor: "#639922", borderColor: "#639922" },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTextActive: { color: "#fff" },
  chipCount: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.06)",
    minWidth: 18,
    alignItems: "center",
  },
  chipCountActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  chipCountText: { fontSize: 10, fontWeight: "700", color: "#64748B" },
  chipCountTextActive: { color: "#fff" },

  // Date separator
  dateSep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  dateSepLine: { flex: 1, height: 0.5, backgroundColor: "rgba(0,0,0,0.08)" },
  dateSepText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#A0AEC0",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.07)",
    marginBottom: 10,
    overflow: "hidden",
  },
  cardAccent: { height: 3 },
  cardBody: { padding: 14 },
  cardTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  cardDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  cardDateWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  cardDate: { fontSize: 10, color: "#A0AEC0", fontWeight: "500" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginBottom: 7,
  },
  scoreBig: { fontSize: 24, fontWeight: "800" },
  scoreDenom: { fontSize: 12, color: "#CBD5E1", fontWeight: "400" },
  barTrack: {
    height: 5,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    overflow: "hidden",
  },
  barFill: { height: 5, borderRadius: 10 },

  // Diagnostic box
  diagBox: {
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  diagIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  diagText: { fontSize: 12, lineHeight: 18, flex: 1 },

  // Card footer
  cardFooter: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  btnChat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F4F6F3",
  },
  btnChatText: { fontSize: 12, fontWeight: "700", color: "#4B5E3A" },
  btnDetail: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1A2E0A",
  },
  btnDetailText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 70,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#1A2E0A" },
  emptyDesc: {
    fontSize: 13,
    color: "#8A9B7A",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1A2E0A",
  },
  emptyBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
});
