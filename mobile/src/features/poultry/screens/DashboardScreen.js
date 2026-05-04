import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  Ionicons,
} from "@expo/vector-icons";
import DashboardBottomNav from "../../../components/DashboardBottomNav";
import Toast from "../../../components/Toast";
import { useTheme } from "../../../context/ThemeContext";
import { useFocusEffect } from "@react-navigation/native";
import {
  getPoultries,
  getPoultriesSummary,
  deletePoultry,
  archivePoultry,
  getAlerts,
  markAlertAsRead,
} from "../../../services/poultry";
import { getUserData } from "../../../services/auth";

const { width } = Dimensions.get("window");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAirQuality(co2, nh3, dust) {
  if (co2 === null && nh3 === null && dust === null)
    return { label: "—", color: "#94A3B8" };
  if (
    (co2 !== null && co2 > 1500) ||
    (nh3 !== null && nh3 > 25) ||
    (dust !== null && dust > 150)
  )
    return { label: "Mauvaise", color: "#EF4444" };
  if (
    (co2 !== null && co2 > 1000) ||
    (nh3 !== null && nh3 > 15) ||
    (dust !== null && dust > 100)
  )
    return { label: "Moyenne", color: "#F97316" };
  return { label: "Excellente", color: "#22C55E" };
}

function getTimeAgo(timestamp) {
  if (!timestamp) return "—";
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

// ─── Badge config (statuts poulailler) ──────────────────────────────────────

const BADGE_CONFIG = {
  en_attente_module: {
    label: "En attente",
    bg: "#F1F5F9",
    textColor: "#64748B",
    dot: "#94A3B8",
  },
  connecte: {
    label: "Connecté",
    bg: "rgba(255,255,255,0.9)",
    textColor: "#1E293B",
    dot: "#22C55E",
  },
  hors_ligne: {
    label: "Hors ligne",
    bg: "#FEF2F2",
    textColor: "#EF4444",
    dot: "#EF4444",
  },
  maintenance: {
    label: "Maintenance",
    bg: "#FFF7ED",
    textColor: "#F97316",
    dot: "#F97316",
  },
  alerte: {
    label: "Alerte",
    bg: "#EF4444",
    textColor: "#FFF",
    dot: "#EF4444",
  },
};

const POULTRY_IMAGES = [
  "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800",
  "https://images.unsplash.com/photo-1612170153139-6f881ff067e0?w=800",
];

const getBadge = (status, isCritical) => {
  if (isCritical) return BADGE_CONFIG.alerte;
  return BADGE_CONFIG[status] || BADGE_CONFIG.connecte;
};

// ─── Résolution du message d'alerte ─────────────────────────────────────────
// Utilise le message du backend (AlertService) en priorité
// Fallback simplifié si le message contient "undefined"
const resolveAlertMessage = (alert) => {
  if (!alert) return "Alerte système";

  // ✅ Le message du backend (AlertService) est déjà en français simple
  if (alert.message && !alert.message.includes("undefined")) {
    return alert.message;
  }

  // Fallback si le message est absent ou corrompu
  const paramLabels = {
    temperature: "Température",
    humidity: "Humidité",
    co2: "CO₂",
    nh3: "Ammoniac",
    dust: "Poussière",
    waterLevel: "Niveau d'eau",
  };

  if (alert.parameter && paramLabels[alert.parameter]) {
    const sev = alert.severity === "danger" ? "critique" : "à surveiller";
    return `${paramLabels[alert.parameter]} ${sev} — vérifiez votre poulailler`;
  }

  if (alert.type === "door") return "Événement porte — vérifiez l'accès";
  if (alert.type === "mqtt")
    return alert.key?.includes("disconnect")
      ? "Le capteur ne répond plus — vérifiez l'alimentation"
      : "Reconnexion établie";
  if (alert.type === "actuator") return "Changement d'état d'un équipement";

  return "Alerte système — vérifiez votre poulailler";
};

// ─── Composant principal ─────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [poultryList, setPoultryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ total: 0, active: 0, alerts: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [allAlerts, setAllAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [poultryNotifications, setPoultryNotifications] = useState({});

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  // ── Fetch poulaillers ────────────────────────────────────────────────────────
  const fetchPoultries = useCallback(async () => {
    try {
      setLoading(true);
      const userData = await getUserData();
      setUser(userData);

      const summaryData = await getPoultriesSummary();
      if (summaryData?.success) {
        setStats({
          total: summaryData.data.total,
          active: summaryData.data.active,
          alerts: summaryData.data.critical || 0,
        });
      }

      const data = await getPoultries();
      if (data?.success) {
        const formatted = data.data
          .filter((p) => !p.isArchived)
          .map((p, index) => ({
            id: p._id,
            name: p.name,
            type: p.type,
            location: p.location || "Zone Élevage 1",
            count: p.animalCount || 0,
            animalCount: p.animalCount || 0,
            surface: p.surface || "",
            remarque: p.remarque || "",
            address: p.address || "",
            attachments: p.attachments || [],
            temp: p.lastMonitoring?.temperature?.toFixed(1) || "—",
            humid: p.lastMonitoring?.humidity?.toFixed(0) || "—",
            co2: p.lastMonitoring?.co2 ?? null,
            nh3: p.lastMonitoring?.nh3 ?? null,
            dust: p.lastMonitoring?.dust ?? null,
            lastMonitoringTimestamp: p.lastMonitoring?.timestamp || null,
            isCritical: p.isCritical || false,
            status: p.status || "en_attente_module",
            image: p.photoUrl || POULTRY_IMAGES[index % POULTRY_IMAGES.length],
          }));
        setPoultryList(formatted);
      }
    } catch (error) {
      console.error("[Dashboard] fetchPoultries error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Charger les notifications par poulailler ────────────────────────────────
  // Utilise GET /api/alerts/poulailler/:id (retourne { success, data: [...] })
  const loadPoultryNotifications = useCallback(async () => {
    if (poultryList.length === 0) return;
    setLoadingAlerts(true);

    try {
      const results = await Promise.allSettled(
        poultryList.map((p) => getAlerts(p.id)),
      );

      const notifData = {};
      const flatAlerts = [];

      poultryList.forEach((poultry, i) => {
        const result = results[i];

        // Support format { success, data: [...] } ET tableau direct
        let alerts = [];
        if (result.status === "fulfilled") {
          const val = result.value;
          alerts = Array.isArray(val?.data)
            ? val.data
            : Array.isArray(val)
              ? val
              : [];
        }

        // Normaliser le champ read (backend envoie read ET isRead)
        const normalized = alerts.map((a) => ({
          ...a,
          read: Boolean(a.read || a.isRead),
        }));

        const unread = normalized.filter((a) => !a.read);
        const dangers = unread
          .filter((a) => a.severity === "danger")
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const warns = unread
          .filter((a) => a.severity === "warn")
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        notifData[poultry.id] = {
          unreadCount: unread.length,
          dangerCount: dangers.length,
          warnCount: warns.length,
          lastDanger: dangers[0] || null,
          lastWarn: warns[0] || null,
        };

        // Ajouter aux alertes globales pour le modal
        unread.forEach((alert) => {
          flatAlerts.push({
            ...alert,
            // Le message vient du backend (AlertService) — déjà en français
            message: resolveAlertMessage(alert),
            poultryName: poultry.name,
            poultryId: poultry.id,
          });
        });
      });

      setPoultryNotifications(notifData);
      setAllAlerts(
        flatAlerts
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 30), // Limiter à 30 alertes récentes
      );
    } catch (error) {
      console.error("[Dashboard] loadPoultryNotifications error:", error);
    } finally {
      setLoadingAlerts(false);
    }
  }, [poultryList]);

  // ── Focus : recharger à chaque fois qu'on revient sur l'écran ─────────────
  useFocusEffect(
    useCallback(() => {
      fetchPoultries();
    }, [fetchPoultries]),
  );

  // ── Charger les notifications après avoir les poulaillers ──────────────────
  useEffect(() => {
    if (poultryList.length > 0) {
      const timer = setTimeout(() => {
        loadPoultryNotifications();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [poultryList.length]);

  // ── Recharger les notifications à l'ouverture du modal ────────────────────
  useEffect(() => {
    if (notificationsVisible && poultryList.length > 0) {
      loadPoultryNotifications();
    }
  }, [notificationsVisible]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPoultries();
  }, [fetchPoultries]);

  // ── Actions menu poulailler ──────────────────────────────────────────────────
  const handleMenuPress = (poultryId) => {
    Alert.alert("Actions", "Que souhaitez-vous faire ?", [
      { text: "Annuler", style: "cancel" },
      { text: "✏️ Modifier", onPress: () => handleModifyPoultry(poultryId) },
      {
        text: "📦 Archiver",
        onPress: () => handleArchivePoultry(poultryId),
      },
      {
        text: "🗑️ Supprimer",
        style: "destructive",
        onPress: () => handleDeletePoultry(poultryId),
      },
    ]);
  };

  const handleModifyPoultry = (poultryId) => {
    const p = poultryList.find((x) => x.id === poultryId);
    if (p) {
      navigation.navigate("AddPoultry", {
        poultry: {
          id: p.id,
          name: p.name,
          animalCount: p.animalCount,
          surface: p.surface,
          location: p.location,
          remarque: p.remarque,
          address: p.address,
          attachments: p.attachments,
        },
      });
    }
  };

  const handleArchivePoultry = (poultryId) => {
    Alert.alert(
      "Archiver ce poulailler ?",
      "Il sera retiré de votre liste principale mais restera accessible dans les archives.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Archiver",
          onPress: async () => {
            try {
              setActionInProgress(poultryId);
              const res = await archivePoultry(poultryId);
              if (res?.success) {
                setToast({
                  visible: true,
                  message: "Poulailler archivé avec succès",
                  type: "success",
                });
                setPoultryList((prev) =>
                  prev.filter((p) => p.id !== poultryId),
                );
              }
            } catch {
              setToast({
                visible: true,
                message: "Impossible d'archiver. Réessayez.",
                type: "error",
              });
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ],
    );
  };

  const handleDeletePoultry = (poultryId) => {
    const p = poultryList.find((x) => x.id === poultryId);
    Alert.alert(
      "Supprimer ce poulailler ?",
      `"${p?.name || "Ce poulailler"}" sera définitivement supprimé. Cette action est irréversible.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer définitivement",
          style: "destructive",
          onPress: async () => {
            try {
              setActionInProgress(poultryId);
              await deletePoultry(poultryId);
              setToast({
                visible: true,
                message: "Poulailler supprimé",
                type: "success",
              });
              setPoultryList((prev) => prev.filter((p) => p.id !== poultryId));
              fetchPoultries();
            } catch {
              setToast({
                visible: true,
                message: "Impossible de supprimer. Réessayez.",
                type: "error",
              });
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ],
    );
  };

  // ── Marquer une alerte comme lue ─────────────────────────────────────────────
  // PATCH /api/alerts/:id/read
  const handleMarkAlertAsRead = useCallback(async (alertId) => {
    try {
      await markAlertAsRead(alertId);
      setAllAlerts((prev) =>
        prev.map((a) =>
          a._id === alertId ? { ...a, read: true, isRead: true } : a,
        ),
      );
    } catch (e) {
      console.error("[Dashboard] markAlertAsRead error:", e);
    }
  }, []);

  // ── Filtrage ──────────────────────────────────────────────────────────────────
  const filteredPoultry = React.useMemo(() => {
    let list = poultryList;

    if (activeFilter === "alerts") list = list.filter((p) => p.isCritical);
    else if (activeFilter === "connected")
      list = list.filter((p) => !p.isCritical);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q),
      );
    }
    return list;
  }, [poultryList, activeFilter, searchQuery]);

  const unreadCount = allAlerts.filter((a) => !a.read && !a.isRead).length;

  // ── Grouper les alertes par poulailler pour le modal ─────────────────────────
  const groupedAlerts = React.useMemo(() => {
    const grouped = {};
    allAlerts.forEach((alert) => {
      const pid = alert.poultryId;
      if (!grouped[pid]) {
        grouped[pid] = {
          poultryId: pid,
          poultryName: alert.poultryName || "Poulailler",
          alerts: [],
          unreadCount: 0,
          latest: null,
          hasDanger: false,
        };
      }
      grouped[pid].alerts.push(alert);
      if (!alert.read && !alert.isRead) grouped[pid].unreadCount += 1;
      if (alert.severity === "danger") grouped[pid].hasDanger = true;
      if (
        !grouped[pid].latest ||
        new Date(alert.createdAt) > new Date(grouped[pid].latest.createdAt)
      ) {
        grouped[pid].latest = alert;
      }
    });

    return Object.values(grouped).sort((a, b) => {
      // Danger en premier
      if (a.hasDanger && !b.hasDanger) return -1;
      if (!a.hasDanger && b.hasDanger) return 1;
      return b.unreadCount - a.unreadCount;
    });
  }, [allAlerts]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.topHeader}>
          <Text style={styles.topHeaderTitle}>Mes Poulaillers</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate("ArchivedPoultries")}
            >
              <Ionicons name="archive-outline" size={24} color="#334155" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setNotificationsVisible(true)}
            >
              <Ionicons
                name="notifications-outline"
                size={24}
                color="#334155"
              />
              {unreadCount > 0 && (
                <View style={styles.redDot}>
                  <Text style={styles.redDotText}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.profileBtn}>
              <Image
                source={{
                  uri: user?.photoUrl || "https://i.pravatar.cc/100",
                }}
                style={styles.avatar}
              />
              <View style={styles.onlineStatus} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: dynamicPaddingBottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#22C55E"
            />
          }
        >
          {/* ── Bonjour ──────────────────────────────────────────────────── */}
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              Bonjour, {user?.firstName || "Éleveur"} 👋
            </Text>
            <Text style={styles.subGreetingText}>
              Voici l'état actuel de votre exploitation.
            </Text>
          </View>

          {/* ── Recherche ────────────────────────────────────────────────── */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un poulailler..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== "" && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Filtres ──────────────────────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            {[
              {
                key: "all",
                icon: "grid-outline",
                label: `Tous (${stats.total})`,
              },
              {
                key: "connected",
                icon: "pulse-outline",
                label: `Connectés (${stats.active})`,
              },
              {
                key: "alerts",
                icon: "alert-circle-outline",
                label: `Alertes (${stats.alerts})`,
              },
            ].map(({ key, icon, label }) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.filterChip,
                  activeFilter === key && styles.filterChipActive,
                ]}
                onPress={() => setActiveFilter(key)}
              >
                <Ionicons
                  name={icon}
                  size={16}
                  color={activeFilter === key ? "#FFF" : "#64748B"}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    activeFilter === key && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Stats ────────────────────────────────────────────────────── */}
          <View style={styles.statsRow}>
            <StatCard
              label="TOTAL"
              value={stats.total.toString().padStart(2, "0")}
              icon="grid-outline"
              trend={`${stats.total} poulailler${stats.total > 1 ? "s" : ""}`}
              color="#F0FDF4"
              iconColor="#22C55E"
            />
            <StatCard
              label="ACTIFS"
              value={stats.active.toString().padStart(2, "0")}
              icon="pulse-outline"
              trend={`${stats.total - stats.active} inactif${stats.total - stats.active > 1 ? "s" : ""}`}
              color="#F0F9FF"
              iconColor="#0EA5E9"
            />
            <StatCard
              label="ALERTES"
              value={stats.alerts.toString().padStart(2, "0")}
              icon="notifications-outline"
              trend={stats.alerts > 0 ? "à traiter" : "tout va bien"}
              color={stats.alerts > 0 ? "#FEF2F2" : "#F0FDF4"}
              iconColor={stats.alerts > 0 ? "#EF4444" : "#22C55E"}
            />
          </View>

          {/* ── Section header ───────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vos Unités</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("ArchivedPoultries")}
            >
              <View style={styles.viewAllContainer}>
                <Ionicons name="archive-outline" size={16} color="#64748B" />
                <Text style={styles.viewAllText}>Archivés</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Liste des poulaillers ─────────────────────────────────────── */}
          {loading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#22C55E" />
              <Text
                style={{ color: "#94A3B8", marginTop: 12, fontWeight: "500" }}
              >
                Chargement de vos poulaillers...
              </Text>
            </View>
          ) : filteredPoultry.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" },
              ]}
            >
              <Ionicons name="add-circle-outline" size={40} color="#22C55E" />
              <Text
                style={[
                  styles.emptyStateText,
                  { color: darkMode ? colors.white : colors.slate900 },
                ]}
              >
                {searchQuery
                  ? "Aucun résultat trouvé"
                  : "Aucun poulailler pour l'instant"}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={styles.emptyStateBtn}
                  onPress={() => navigation.navigate("AddPoultry")}
                >
                  <Text style={styles.emptyStateBtnText}>
                    + Ajouter un poulailler
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredPoultry.map((item) => {
              const badge = getBadge(item.status, item.isCritical);
              const airQuality = getAirQuality(item.co2, item.nh3, item.dust);
              const notif = poultryNotifications[item.id];
              const hasUnread = notif && notif.unreadCount > 0;
              const isDanger = hasUnread && notif.dangerCount > 0;

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  onPress={() =>
                    navigation.navigate("PoultryDetail", {
                      poultryId: item.id,
                      poultryName: item.name,
                    })
                  }
                  style={[
                    styles.card,
                    {
                      backgroundColor: darkMode ? "#1e293b" : "#fff",
                    },
                  ]}
                >
                  {/* Image */}
                  <View style={styles.cardImageContainer}>
                    <Image
                      source={{ uri: item.image }}
                      style={styles.cardImage}
                    />
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: badge.bg },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: badge.dot },
                        ]}
                      />
                      <Text
                        style={[styles.badgeText, { color: badge.textColor }]}
                      >
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardContent}>
                    {/* Nom + menu */}
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.cardName,
                            {
                              color: darkMode ? colors.white : colors.slate900,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <View style={styles.zoneRow}>
                          <View
                            style={[
                              styles.zoneDot,
                              { backgroundColor: badge.dot },
                            ]}
                          />
                          <Text
                            style={[
                              styles.zoneText,
                              {
                                color: darkMode
                                  ? colors.slate400
                                  : colors.slate600,
                              },
                            ]}
                          >
                            {item.location}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.menuBtn,
                          {
                            backgroundColor: darkMode ? "#334155" : "#F8FAFC",
                          },
                        ]}
                        onPress={() => handleMenuPress(item.id)}
                        disabled={actionInProgress === item.id}
                      >
                        {actionInProgress === item.id ? (
                          <ActivityIndicator size="small" color="#22C55E" />
                        ) : (
                          <MaterialIcons
                            name="more-vert"
                            size={20}
                            color={darkMode ? colors.white : "#94A3B8"}
                          />
                        )}
                      </TouchableOpacity>
                    </View>

                    {/* En attente module */}
                    {item.status === "en_attente_module" && (
                      <View style={styles.pendingModuleBox}>
                        <MaterialIcons
                          name="memory"
                          size={15}
                          color="#64748B"
                        />
                        <Text style={styles.pendingModuleText}>
                          Aucun boîtier électronique associé. En attente de
                          configuration.
                        </Text>
                      </View>
                    )}

                    {/* Notification résumé */}
                    {item.status !== "en_attente_module" && hasUnread && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          navigation.navigate("PoultryDetail", {
                            poultryId: item.id,
                            poultryName: item.name,
                          });
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: isDanger ? "#FEF2F2" : "#FFF7ED",
                          borderRadius: 12,
                          padding: 10,
                          marginBottom: 12,
                          gap: 8,
                          borderWidth: 1,
                          borderColor: isDanger ? "#FCA5A5" : "#FED7AA",
                        }}
                      >
                        <MaterialIcons
                          name={isDanger ? "error-outline" : "warning-amber"}
                          size={16}
                          color={isDanger ? "#EF4444" : "#F97316"}
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontWeight: "600",
                            color: isDanger ? "#B91C1C" : "#92400E",
                            lineHeight: 16,
                          }}
                          numberOfLines={2}
                        >
                          {resolveAlertMessage(
                            isDanger ? notif.lastDanger : notif.lastWarn,
                          )}
                        </Text>
                        <View
                          style={{
                            backgroundColor: isDanger ? "#EF4444" : "#F97316",
                            borderRadius: 10,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            minWidth: 22,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: "800",
                            }}
                          >
                            {notif.unreadCount}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Métriques */}
                    <View style={styles.metricsRow}>
                      <View
                        style={[
                          styles.metricBox,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#F0FDF4",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="thermometer"
                          size={18}
                          color="#22C55E"
                        />
                        <View style={styles.metricTextCol}>
                          <Text
                            style={[
                              styles.metricLabel,
                              {
                                color: darkMode
                                  ? colors.slate400
                                  : colors.slate600,
                              },
                            ]}
                          >
                            TEMP.
                          </Text>
                          <Text
                            style={[
                              styles.metricValue,
                              {
                                color: darkMode
                                  ? colors.white
                                  : colors.slate900,
                              },
                            ]}
                          >
                            {item.temp !== "—" ? `${item.temp}°C` : "—"}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.metricBox,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#F0FDF4",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="water-percent"
                          size={20}
                          color="#22C55E"
                        />
                        <View style={styles.metricTextCol}>
                          <Text
                            style={[
                              styles.metricLabel,
                              {
                                color: darkMode
                                  ? colors.slate400
                                  : colors.slate600,
                              },
                            ]}
                          >
                            HUMIDITÉ
                          </Text>
                          <Text
                            style={[
                              styles.metricValue,
                              {
                                color: darkMode
                                  ? colors.white
                                  : colors.slate900,
                              },
                            ]}
                          >
                            {item.humid !== "—" ? `${item.humid}%` : "—"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Footer */}
                    <View
                      style={[
                        styles.cardFooter,
                        {
                          borderTopColor: darkMode ? "#334155" : "#F1F5F9",
                        },
                      ]}
                    >
                      <View style={styles.footerInfo}>
                        <MaterialCommunityIcons
                          name="air-filter"
                          size={14}
                          color={airQuality.color}
                        />
                        <Text
                          style={[
                            styles.footerText,
                            { color: airQuality.color },
                          ]}
                        >
                          Air : {airQuality.label}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.footerUpdateText,
                          { color: colors.slate500 },
                        ]}
                      >
                        {item.lastMonitoringTimestamp
                          ? `Mis à jour il y a ${getTimeAgo(item.lastMonitoringTimestamp)}`
                          : "Aucune mesure"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 130 }} />
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          style={[
            styles.fab,
            { bottom: 70 + Math.max(insets.bottom, 10) + 10 },
          ]}
          onPress={() => navigation.navigate("AddPoultry")}
        >
          <MaterialIcons name="add" size={32} color="#FFF" />
        </TouchableOpacity>

        <DashboardBottomNav navigation={navigation} alertCount={stats.alerts} />
      </SafeAreaView>

      {/* ── Modal Notifications ──────────────────────────────────────────── */}
      <Modal
        visible={notificationsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setNotificationsVisible(false)}
          />
          <View
            style={[
              styles.modalContent,
              { backgroundColor: darkMode ? "#1e293b" : "#fff" },
            ]}
          >
            {/* Header modal */}
            <View style={styles.modalHeader}>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: darkMode ? colors.white : colors.slate900 },
                  ]}
                >
                  🔔 Notifications
                </Text>
                {unreadCount > 0 && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#EF4444",
                      fontWeight: "600",
                    }}
                  >
                    {unreadCount} alerte{unreadCount > 1 ? "s" : ""} non lue
                    {unreadCount > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {loadingAlerts ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color="#22C55E" />
                  <Text
                    style={{
                      color: "#94A3B8",
                      marginTop: 12,
                      fontWeight: "500",
                    }}
                  >
                    Chargement des alertes...
                  </Text>
                </View>
              ) : groupedAlerts.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={48}
                    color="#22C55E"
                  />
                  <Text
                    style={{
                      color: "#22C55E",
                      marginTop: 12,
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    Tout va bien !
                  </Text>
                  <Text
                    style={{
                      color: "#94a3b8",
                      marginTop: 6,
                      textAlign: "center",
                      fontSize: 13,
                    }}
                  >
                    Aucune alerte non lue pour vos poulaillers.
                  </Text>
                </View>
              ) : (
                groupedAlerts.map(
                  ({
                    poultryId,
                    poultryName,
                    unreadCount: count,
                    latest,
                    hasDanger,
                  }) => {
                    const iconColor = hasDanger ? "#EF4444" : "#F97316";
                    const iconBg = hasDanger ? "#FEF2F2" : "#FFF7ED";
                    const iconName = hasDanger ? "error" : "warning";
                    const msg = resolveAlertMessage(latest);

                    return (
                      <TouchableOpacity
                        key={poultryId}
                        onPress={() => {
                          navigation.navigate("PoultryDetail", {
                            poultryId,
                            poultryName,
                          });
                          setNotificationsVisible(false);
                        }}
                        activeOpacity={0.7}
                        style={[
                          styles.alertItem,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
                            borderLeftWidth: 3,
                            borderLeftColor: iconColor,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.alertIcon,
                            { backgroundColor: iconBg },
                          ]}
                        >
                          <MaterialIcons
                            name={iconName}
                            size={20}
                            color={iconColor}
                          />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: darkMode ? "#94a3b8" : "#64748b",
                              marginBottom: 3,
                            }}
                          >
                            📍 {poultryName}
                          </Text>
                          <Text
                            style={[
                              styles.alertMsg,
                              {
                                color: darkMode
                                  ? colors.white
                                  : colors.slate900,
                              },
                            ]}
                            numberOfLines={2}
                          >
                            {msg}
                          </Text>
                          <Text
                            style={[styles.alertTime, { color: "#94a3b8" }]}
                          >
                            {latest?.createdAt
                              ? new Date(latest.createdAt).toLocaleString(
                                  "fr-FR",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "—"}
                          </Text>
                        </View>

                        <View
                          style={{
                            alignItems: "center",
                            gap: 6,
                            marginLeft: 8,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: iconColor,
                              borderRadius: 12,
                              minWidth: 24,
                              height: 24,
                              alignItems: "center",
                              justifyContent: "center",
                              paddingHorizontal: 6,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: "800",
                              }}
                            >
                              {count}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={14}
                            color="#CBD5E1"
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  },
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon, trend, color, iconColor }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconContainer, { backgroundColor: color }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.statValueRow}>
      <Text style={styles.statValue}>{value}</Text>
    </View>
    <Text style={[styles.statTrend, { color: "#94A3B8" }]}>{trend}</Text>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAF9" },
  safeArea: { flex: 1 },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  topHeaderTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  redDot: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  redDotText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  profileBtn: { width: 36, height: 36, borderRadius: 18, position: "relative" },
  avatar: { width: "100%", height: "100%", borderRadius: 18 },
  onlineStatus: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  greetingSection: { marginTop: 10, marginBottom: 20 },
  greetingText: { fontSize: 24, fontWeight: "800", color: "#1E293B" },
  subGreetingText: { fontSize: 14, color: "#64748B", marginTop: 4 },
  searchContainer: { marginBottom: 16 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 54,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: "#1E293B" },
  filterContainer: {
    marginBottom: 20,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  filterContent: { gap: 10 },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  filterChipActive: { backgroundColor: "#22C55E" },
  filterChipText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  filterChipTextActive: { color: "#FFF" },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: "#FFF",
    width: (width - 60) / 3,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 4,
  },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  statValue: { fontSize: 20, fontWeight: "800", color: "#1E293B" },
  statTrend: { fontSize: 10, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
  viewAllText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    marginLeft: 4,
  },
  viewAllContainer: { flexDirection: "row", alignItems: "center", gap: 4 },
  card: {
    borderRadius: 24,
    marginBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  cardImageContainer: { width: "100%", height: 160 },
  cardImage: { width: "100%", height: "100%", resizeMode: "cover" },
  statusBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  cardContent: { padding: 20 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  cardName: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  zoneRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  zoneDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  zoneText: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingModuleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  pendingModuleText: {
    flex: 1,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 16,
  },
  metricsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  metricBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  metricTextCol: { flex: 1 },
  metricLabel: { fontSize: 9, fontWeight: "800", color: "#64748B" },
  metricValue: { fontSize: 14, fontWeight: "800", color: "#1E293B" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 15,
  },
  footerInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 11, fontWeight: "500" },
  footerUpdateText: { fontSize: 11, fontWeight: "500" },
  fab: {
    position: "absolute",
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    zIndex: 1000,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    marginTop: 20,
  },
  emptyStateText: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  emptyStateBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#22C55E",
    borderRadius: 12,
  },
  emptyStateBtnText: { color: "#fff", fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalBody: { padding: 16 },
  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  alertMsg: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  alertTime: { fontSize: 11, marginTop: 4 },
});
