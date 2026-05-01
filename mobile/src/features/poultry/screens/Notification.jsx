// screens/Notifications.jsx
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  SafeAreaView,
  Platform,
  StatusBar,
  RefreshControl,
  SectionList,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  if (!ts) return "À l'instant";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function severityConfig(severity) {
  if (severity === "danger")
    return {
      bg: "#FEF2F2",
      dot: "#EF4444",
      badgeBg: "#FEF2F2",
      badgeColor: "#B91C1C",
      badgeBorder: "#FCA5A5",
      label: "Danger",
      icon: "warning",
      iconColor: "#EF4444",
    };
  if (severity === "warn")
    return {
      bg: "#FFFBEB",
      dot: "#F59E0B",
      badgeBg: "#FFFBEB",
      badgeColor: "#92400E",
      badgeBorder: "#FCD34D",
      label: "Attention",
      icon: "error-outline",
      iconColor: "#F59E0B",
    };
  return {
    bg: "#F0FDF4",
    dot: "#22C55E",
    badgeBg: "#F0FDF4",
    badgeColor: "#15803D",
    badgeBorder: "#86EFAC",
    label: "Normal",
    icon: "check-circle-outline",
    iconColor: "#22C55E",
  };
}

// ─── MOCK DATA (remplacer par vos hooks/API réels) ───────────────────────────
// Structure attendue depuis usePoultryState() ou votre contexte global
const MOCK_POULAILLERS = [
  { _id: "p1", name: "Poulailler A – Lot 12", location: "Secteur Nord" },
  { _id: "p2", name: "Poulailler B – Lot 7", location: "Secteur Est" },
  { _id: "p3", name: "Poulailler C – Lot 3", location: "Secteur Sud" },
];

const MOCK_ALERTS = [
  {
    _id: "a1",
    poultryId: "p1",
    severity: "danger",
    read: false,
    type: "Température",
    message:
      "Température critique : 38°C détectée dans la zone 2. Vérification immédiate requise.",
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    _id: "a2",
    poultryId: "p1",
    severity: "warn",
    read: false,
    type: "Humidité",
    message: "Taux d'humidité élevé (85%). Vérifiez la ventilation.",
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    _id: "a3",
    poultryId: "p2",
    severity: "danger",
    read: false,
    type: "Alimentation",
    message: "Silo d'aliments presque vide. Rechargement urgent nécessaire.",
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    _id: "a4",
    poultryId: "p2",
    severity: "normal",
    read: true,
    type: "Eau",
    message: "Consommation d'eau normale. Tout est en ordre.",
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    _id: "a5",
    poultryId: "p3",
    severity: "warn",
    read: false,
    type: "Éclairage",
    message: "Cycle d'éclairage décalé de 15 minutes. Recalibrer le minuteur.",
    createdAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
  },
  {
    _id: "a6",
    poultryId: "p3",
    severity: "normal",
    read: true,
    type: "Poids",
    message: "Poids moyen du lot conforme aux objectifs de la semaine.",
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
  {
    _id: "a7",
    poultryId: "p1",
    severity: "normal",
    read: true,
    type: "Mortalité",
    message: "Taux de mortalité journalier dans les normes acceptables.",
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "danger", label: "Danger" },
  { key: "warn", label: "Attention" },
  { key: "normal", label: "Normal" },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBadge({ count, color, bg }) {
  if (!count) return null;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 7,
        paddingVertical: 2,
        minWidth: 22,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{count}</Text>
    </View>
  );
}

function PoultryFilterTab({ poultry, isSelected, unreadCount, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: isSelected ? "#22C55E" : "#F1F5F9",
        marginRight: 8,
      }}
    >
      <MaterialIcons
        name="home"
        size={14}
        color={isSelected ? "#fff" : "#64748B"}
      />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "700",
          color: isSelected ? "#fff" : "#475569",
          maxWidth: 110,
        }}
        numberOfLines={1}
      >
        {poultry === "all" ? "Tous les poulaillers" : poultry.name}
      </Text>
      {unreadCount > 0 && (
        <View
          style={{
            backgroundColor: isSelected ? "rgba(255,255,255,0.3)" : "#EF4444",
            borderRadius: 8,
            paddingHorizontal: 5,
            paddingVertical: 1,
            minWidth: 18,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#fff" }}>
            {unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function AlertCard({ alert, poultryName, onMarkRead }) {
  const s = severityConfig(alert.severity);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => !alert.read && onMarkRead(alert._id)}
      style={{
        backgroundColor: alert.read ? "#fff" : s.bg,
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: alert.read ? "#E2E8F0" : s.badgeBorder,
        padding: 14,
        flexDirection: "row",
        gap: 12,
        alignItems: "flex-start",
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: alert.read ? 0.03 : 0.06,
        shadowRadius: 4,
        elevation: alert.read ? 1 : 2,
      }}
    >
      {/* Icône severity */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: alert.read ? "#F8FAFC" : s.badgeBg,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderWidth: 1,
          borderColor: alert.read ? "#E2E8F0" : s.badgeBorder,
        }}
      >
        <MaterialIcons
          name={s.icon}
          size={18}
          color={alert.read ? "#CBD5E1" : s.iconColor}
        />
      </View>

      <View style={{ flex: 1 }}>
        {/* Ligne badge + type + heure */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {/* Badge severity */}
            <View
              style={{
                backgroundColor: alert.read ? "#F1F5F9" : s.badgeBg,
                borderRadius: 20,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: alert.read ? "#E2E8F0" : s.badgeBorder,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: alert.read ? "#94A3B8" : s.badgeColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {s.label}
              </Text>
            </View>
            {/* Type */}
            {alert.type && (
              <Text
                style={{ fontSize: 10, color: "#94A3B8", fontWeight: "500" }}
              >
                {alert.type}
              </Text>
            )}
          </View>
          {/* Heure */}
          <Text style={{ fontSize: 10, color: "#CBD5E1", fontWeight: "500" }}>
            {relativeTime(alert.createdAt)}
          </Text>
        </View>

        {/* Message */}
        <Text
          style={{
            fontSize: 13,
            color: alert.read ? "#64748B" : "#1E293B",
            fontWeight: alert.read ? "400" : "600",
            lineHeight: 19,
            marginBottom: 6,
          }}
        >
          {alert.message}
        </Text>

        {/* Nom du poulailler (si on affiche "tous") */}
        {poultryName && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <MaterialIcons name="home" size={11} color="#94A3B8" />
            <Text style={{ fontSize: 10, color: "#94A3B8", fontWeight: "500" }}>
              {poultryName}
            </Text>
          </View>
        )}
      </View>

      {/* Indicateur non lu */}
      {!alert.read && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: s.dot,
            marginTop: 2,
            flexShrink: 0,
          }}
        />
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ filterLabel }) {
  return (
    <View
      style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 24 }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      >
        <MaterialIcons name="notifications-none" size={30} color="#CBD5E1" />
      </View>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: "#334155",
          marginBottom: 6,
        }}
      >
        Aucune notification
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#94A3B8",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {filterLabel
          ? `Aucune alerte « ${filterLabel} » pour cette sélection.`
          : "Tout est en ordre. Aucune alerte active pour vos poulaillers."}
      </Text>
    </View>
  );
}

// ─── Summary Cards ───────────────────────────────────────────────────────────

function SummaryBar({ alerts }) {
  const danger = alerts.filter(
    (a) => a.severity === "danger" && !a.read,
  ).length;
  const warn = alerts.filter((a) => a.severity === "warn" && !a.read).length;
  const total = alerts.filter((a) => !a.read).length;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 16,
        paddingBottom: 14,
      }}
    >
      {/* Total non lus */}
      <View
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: "#E2E8F0",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: "#94A3B8",
            fontWeight: "600",
            marginBottom: 2,
          }}
        >
          Non lues
        </Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#1E293B" }}>
          {total}
        </Text>
      </View>

      {/* Danger */}
      <View
        style={{
          flex: 1,
          backgroundColor: danger > 0 ? "#FEF2F2" : "#F8FAFC",
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: danger > 0 ? "#FCA5A5" : "#E2E8F0",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: danger > 0 ? "#B91C1C" : "#94A3B8",
            fontWeight: "600",
            marginBottom: 2,
          }}
        >
          Danger
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: danger > 0 ? "#EF4444" : "#CBD5E1",
          }}
        >
          {danger}
        </Text>
      </View>

      {/* Attention */}
      <View
        style={{
          flex: 1,
          backgroundColor: warn > 0 ? "#FFFBEB" : "#F8FAFC",
          borderRadius: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: warn > 0 ? "#FCD34D" : "#E2E8F0",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: warn > 0 ? "#92400E" : "#94A3B8",
            fontWeight: "600",
            marginBottom: 2,
          }}
        >
          Attention
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: warn > 0 ? "#F59E0B" : "#CBD5E1",
          }}
        >
          {warn}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

/**
 * Notifications.jsx
 *
 * Props (si navigation React Navigation) :
 *   - alerts       : array – toutes les alertes de l'éleveur (depuis contexte/API)
 *   - poulaillers  : array – liste des poulaillers { _id, name, location }
 *   - onMarkRead   : (id: string) => void
 *   - onMarkAllRead: () => void
 *   - onRefresh    : () => Promise<void>
 *
 * En développement les données MOCK ci-dessus sont utilisées.
 */
export default function Notifications({
  alerts = MOCK_ALERTS,
  poulaillers = MOCK_POULAILLERS,
  onMarkRead = () => {},
  onMarkAllRead = () => {},
  onRefresh = () => Promise.resolve(),
  navigation,
}) {
  const [selectedPoultry, setSelectedPoultry] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Helpers lookup ──────────────────────────────────────────────────────────
  const poultryById = useMemo(() => {
    const map = {};
    poulaillers.forEach((p) => {
      map[p._id] = p;
    });
    return map;
  }, [poulaillers]);

  const unreadByPoultry = useMemo(() => {
    const map = { all: 0 };
    poulaillers.forEach((p) => {
      map[p._id] = 0;
    });
    alerts.forEach((a) => {
      if (!a.read) {
        map.all = (map.all || 0) + 1;
        if (map[a.poultryId] !== undefined) map[a.poultryId]++;
      }
    });
    return map;
  }, [alerts, poulaillers]);

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return alerts
      .filter(
        (a) => selectedPoultry === "all" || a.poultryId === selectedPoultry,
      )
      .filter((a) => severityFilter === "all" || a.severity === severityFilter)
      .filter((a) => !showUnreadOnly || !a.read)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [alerts, selectedPoultry, severityFilter, showUnreadOnly]);

  // ── Refresh ─────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  // ── Mark all read (filtré au poulailler courant) ─────────────────────────────
  const handleMarkAllRead = useCallback(() => {
    filtered.filter((a) => !a.read).forEach((a) => onMarkRead(a._id));
    if (onMarkAllRead) onMarkAllRead(selectedPoultry);
  }, [filtered, onMarkRead, onMarkAllRead, selectedPoultry]);

  const unreadCount = filtered.filter((a) => !a.read).length;
  const currentSeverityLabel = SEVERITY_FILTERS.find(
    (f) => f.key === severityFilter,
  )?.label;

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#F8FAFC",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        style={{ flex: 1 }}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#22C55E"]}
            tintColor="#22C55E"
          />
        }
      >
        {/* ── Header sticky ──────────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#F8FAFC",
            paddingTop: 8,
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: "#E2E8F0",
          }}
        >
          {/* Titre + bouton tout lire */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingBottom: 12,
            }}
          >
            <View>
              <Text
                style={{ fontSize: 22, fontWeight: "800", color: "#0F172A" }}
              >
                Notifications
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "#94A3B8",
                  fontWeight: "500",
                  marginTop: 1,
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                  : "Tout est lu"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* Filtre non lus seulement */}
              <TouchableOpacity
                onPress={() => setShowUnreadOnly((v) => !v)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 11,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: showUnreadOnly ? "#EFF6FF" : "#F1F5F9",
                  borderWidth: 1,
                  borderColor: showUnreadOnly ? "#BFDBFE" : "#E2E8F0",
                }}
              >
                <Ionicons
                  name={showUnreadOnly ? "eye-off" : "eye-outline"}
                  size={14}
                  color={showUnreadOnly ? "#3B82F6" : "#64748B"}
                />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: showUnreadOnly ? "#1D4ED8" : "#64748B",
                  }}
                >
                  {showUnreadOnly ? "Non lues" : "Toutes"}
                </Text>
              </TouchableOpacity>

              {/* Tout marquer lu */}
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllRead}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 11,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: "#F0FDF4",
                    borderWidth: 1,
                    borderColor: "#BBF7D0",
                  }}
                >
                  <MaterialIcons name="done-all" size={14} color="#22C55E" />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#15803D",
                    }}
                  >
                    Tout lu
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filtre par poulailler (horizontal scroll) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}
          >
            <PoultryFilterTab
              poultry="all"
              isSelected={selectedPoultry === "all"}
              unreadCount={unreadByPoultry.all}
              onPress={() => setSelectedPoultry("all")}
            />
            {poulaillers.map((p) => (
              <PoultryFilterTab
                key={p._id}
                poultry={p}
                isSelected={selectedPoultry === p._id}
                unreadCount={unreadByPoultry[p._id] || 0}
                onPress={() => setSelectedPoultry(p._id)}
              />
            ))}
          </ScrollView>

          {/* Filtre par sévérité */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 10,
              gap: 6,
            }}
          >
            {SEVERITY_FILTERS.map((f) => {
              const active = severityFilter === f.key;
              const cfg = f.key !== "all" ? severityConfig(f.key) : null;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setSeverityFilter(f.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 20,
                    marginRight: 6,
                    backgroundColor: active
                      ? cfg
                        ? cfg.badgeBg
                        : "#1E293B"
                      : "#fff",
                    borderWidth: 1,
                    borderColor: active
                      ? cfg
                        ? cfg.badgeBorder
                        : "#1E293B"
                      : "#E2E8F0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: active
                        ? cfg
                          ? cfg.badgeColor
                          : "#fff"
                        : "#64748B",
                    }}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Résumé chiffres ────────────────────────────────────────────────── */}
        <View style={{ paddingTop: 16 }}>
          <SummaryBar alerts={filtered} />
        </View>

        {/* ── Contexte poulailler sélectionné ───────────────────────────────── */}
        {selectedPoultry !== "all" && poultryById[selectedPoultry] && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#F0FDF4",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="home" size={18} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}
              >
                {poultryById[selectedPoultry].name}
              </Text>
              {poultryById[selectedPoultry].location && (
                <Text
                  style={{ fontSize: 11, color: "#94A3B8", fontWeight: "500" }}
                >
                  {poultryById[selectedPoultry].location}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "500" }}>
              {filtered.length} alerte{filtered.length > 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {/* ── Liste des alertes ──────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <EmptyState
            filterLabel={severityFilter !== "all" ? currentSeverityLabel : null}
          />
        ) : (
          <View style={{ paddingBottom: 32 }}>
            {filtered.map((alert) => (
              <AlertCard
                key={alert._id}
                alert={alert}
                // Afficher le nom du poulailler seulement en vue "Tous"
                poultryName={
                  selectedPoultry === "all"
                    ? poultryById[alert.poultryId]?.name
                    : null
                }
                onMarkRead={onMarkRead}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
