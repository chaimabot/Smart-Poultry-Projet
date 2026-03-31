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
  getCriticalPoultries,
  deletePoultry,
  archivePoultry,
  getAlerts,
  markAlertAsRead,
} from "../../../services/poultry";
import { getUserData } from "../../../services/auth";

const { width } = Dimensions.get("window");

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

  // État pour le panneau de notifications
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [allAlerts, setAllAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  const fetchPoultries = async () => {
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
          .map((p) => ({
            id: p._id,
            name: p.name,
            type: p.type,
            location: p.location || "Zone Élevage 1",
            count: p.animalCount || 0,
            temp: p.lastMonitoring?.temperature?.toFixed(1) || "24.5",
            humid: p.lastMonitoring?.humidity?.toFixed(0) || "62",
            isCritical: p.isCritical || false,
            image:
              p.photoUrl ||
              "https://images.unsplash.com/photo-1581092160607-798aa0b7d9c6?w=800",
            lastUpdated: "2m",
          }));
        setPoultryList(formatted);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Charger les alertes de TOUS les poulaillers + ajouter le nom
  const fetchAllAlerts = async () => {
    if (poultryList.length === 0) {
      console.log("Aucun poulailler → pas d'alerte");
      return;
    }

    try {
      setLoadingAlerts(true);
      console.log("Chargement alertes pour", poultryList.length, "poulaillers");

      const alertsPromises = poultryList.map(async (p) => {
        try {
          const res = await getAlerts(p.id);
          console.log(`Alertes pour ${p.name} (${p.id}):`, res);

          if (res?.success && res.data) {
            return res.data.map((alert) => ({
              ...alert,
              poultryName: p.name, // ← Nom du poulailler
              poultryId: p.id,
            }));
          }
          return [];
        } catch (err) {
          console.log(`Erreur alertes pour ${p.name}:`, err);
          return [];
        }
      });

      const allResults = await Promise.all(alertsPromises);
      const alerts = allResults
        .flat()
        .filter((a) => !a.isRead && !a.read)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 20);

      console.log("Alertes finales non lues :", alerts.length, alerts);
      setAllAlerts(alerts);
    } catch (e) {
      console.error("Erreur globale fetchAllAlerts:", e);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchPoultries();
    }, []),
  );

  // Charger les alertes dès que la liste est prête + quand le modal s'ouvre
  useEffect(() => {
    if (poultryList.length > 0) {
      fetchAllAlerts();
    }
  }, [poultryList]);

  useEffect(() => {
    if (notificationsVisible && poultryList.length > 0) {
      fetchAllAlerts();
    }
  }, [notificationsVisible, poultryList]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPoultries();
  }, []);

  const handleMenuPress = (poultryId) => {
    Alert.alert("Actions", "Sélectionnez une action", [
      { text: "Annuler", style: "cancel" },
      { text: "Modifier", onPress: () => handleModifyPoultry(poultryId) },
      { text: "Archiver", onPress: () => handleArchivePoultry(poultryId) },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => handleDeletePoultry(poultryId),
      },
    ]);
  };

  const handleModifyPoultry = (poultryId) => {
    const poultryToEdit = poultryList.find((p) => p.id === poultryId);
    if (poultryToEdit) {
      navigation.navigate("AddPoultry", {
        poultry: {
          id: poultryToEdit.id,
          name: poultryToEdit.name,
          type: poultryToEdit.type,
          location: poultryToEdit.location,
          count: poultryToEdit.count,
          image: poultryToEdit.image,
        },
      });
    }
  };

  const handleArchivePoultry = async (poultryId) => {
    Alert.alert("Archiver", "Le poulailler sera retiré de la liste.", [
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
                message: "Poulailler archivé",
                type: "success",
              });
              setPoultryList((prev) => prev.filter((p) => p.id !== poultryId));
            }
          } catch (e) {
            setToast({ visible: true, message: "Erreur", type: "error" });
          } finally {
            setActionInProgress(null);
          }
        },
      },
    ]);
  };

  const handleDeletePoultry = async (poultryId) => {
    Alert.alert("Supprimer", "Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            setActionInProgress(poultryId);
            const res = await deletePoultry(poultryId);
            if (res?.success) {
              setToast({
                visible: true,
                message: "Poulailler supprimé",
                type: "success",
              });
              setPoultryList((prev) => prev.filter((p) => p.id !== poultryId));
              fetchPoultries();
            }
          } catch (e) {
            setToast({ visible: true, message: "Erreur", type: "error" });
          } finally {
            setActionInProgress(null);
          }
        },
      },
    ]);
  };

  const handleMarkAlertAsRead = async (alertId) => {
    try {
      await markAlertAsRead(alertId);
      setAllAlerts((prev) =>
        prev.map((a) =>
          a._id === alertId ? { ...a, isRead: true, read: true } : a,
        ),
      );
    } catch (e) {
      console.log("Erreur mark as read:", e);
    }
  };

  const getFilteredPoultry = () => {
    let filtered = poultryList;
    if (activeFilter === "alerts") {
      filtered = filtered.filter((p) => p.isCritical);
    } else if (activeFilter === "connected") {
      filtered = filtered.filter((p) => !p.isCritical);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.location.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return filtered;
  };

  const filteredPoultry = getFilteredPoultry();
  const unreadCount = allAlerts.filter((a) => !a.isRead && !a.read).length;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.topHeader}>
          <Text style={styles.topHeaderTitle}>Mes Poulaillers</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate("ArchivedPoultries")}
            >
              <Ionicons name="archive-outline" size={24} color="#334155" />
            </TouchableOpacity>

            {/* Bouton notifications */}
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
                  <Text style={styles.redDotText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.profileBtn}>
              <Image
                source={{ uri: user?.photoUrl || "https://i.pravatar.cc/100" }}
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
          {/* Greeting */}
          <View style={styles.greetingSection}>
            <Text style={styles.greetingText}>
              Bonjour, {user?.firstName || "Jean"}
            </Text>
            <Text style={styles.subGreetingText}>
              Voici l'état actuel de votre exploitation.
            </Text>
          </View>

          {/* Search */}
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

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === "all" && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter("all")}
            >
              <Ionicons
                name="grid-outline"
                size={16}
                color={activeFilter === "all" ? "#FFF" : "#64748B"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "all" && styles.filterChipTextActive,
                ]}
              >
                Tous ({stats.total})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === "connected" && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter("connected")}
            >
              <Ionicons
                name="pulse-outline"
                size={16}
                color={activeFilter === "connected" ? "#FFF" : "#64748B"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "connected" && styles.filterChipTextActive,
                ]}
              >
                Connectés ({stats.active})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === "alerts" && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter("alerts")}
            >
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={activeFilter === "alerts" ? "#FFF" : "#64748B"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "alerts" && styles.filterChipTextActive,
                ]}
              >
                Alertes ({stats.alerts})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard
              label="TOTAL"
              value={stats.total.toString().padStart(2, "0")}
              icon="grid-outline"
              trend="+1"
              color="#F0FDF4"
              iconColor="#22C55E"
            />
            <StatCard
              label="ACTIFS"
              value={stats.active.toString().padStart(2, "0")}
              icon="pulse-outline"
              trend="+2"
              color="#F0F9FF"
              iconColor="#0EA5E9"
            />
            <StatCard
              label="ALERTES"
              value={stats.alerts.toString().padStart(2, "0")}
              icon="notifications-outline"
              trend="-2"
              color="#FEF2F2"
              iconColor="#EF4444"
            />
          </View>

          {/* Section */}
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

          {/* Cards list */}
          {filteredPoultry.length === 0 ? (
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
                Aucun poulailler
              </Text>
              <TouchableOpacity
                style={styles.emptyStateBtn}
                onPress={() => navigation.navigate("AddPoultry")}
              >
                <Text style={styles.emptyStateBtnText}>
                  Créer un poulailler
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredPoultry.map((item) => (
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
                  { backgroundColor: darkMode ? "#1e293b" : "#fff" },
                ]}
              >
                <View style={styles.cardImageContainer}>
                  <Image
                    source={{ uri: item.image }}
                    style={styles.cardImage}
                  />
                  <View
                    style={
                      item.isCritical
                        ? styles.alertBadge
                        : styles.connectedBadge
                    }
                  >
                    <Text style={styles.badgeText}>
                      {item.isCritical ? "Alerte" : "Connecté"}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <Text
                        style={[
                          styles.cardName,
                          { color: darkMode ? colors.white : colors.slate900 },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.zoneRow}>
                        <View
                          style={[
                            styles.zoneDot,
                            {
                              backgroundColor: item.isCritical
                                ? "#EF4444"
                                : "#22C55E",
                            },
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
                        { backgroundColor: darkMode ? "#334155" : "#F8FAFC" },
                      ]}
                      onPress={() => handleMenuPress(item.id)}
                      disabled={actionInProgress === item.id}
                    >
                      {actionInProgress === item.id ? (
                        <ActivityIndicator
                          size="small"
                          color={darkMode ? colors.white : colors.slate900}
                        />
                      ) : (
                        <MaterialIcons
                          name="more-vert"
                          size={20}
                          color={darkMode ? colors.white : "#94A3B8"}
                        />
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.metricsRow}>
                    <View
                      style={[
                        styles.metricBox,
                        { backgroundColor: darkMode ? "#0f172a" : "#F0FDF4" },
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
                              color: darkMode ? colors.white : colors.slate900,
                            },
                          ]}
                        >
                          {item.temp}°C
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.metricBox,
                        { backgroundColor: darkMode ? "#0f172a" : "#F0FDF4" },
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
                              color: darkMode ? colors.white : colors.slate900,
                            },
                          ]}
                        >
                          {item.humid}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.cardFooter,
                      { borderTopColor: darkMode ? "#334155" : "#F1F5F9" },
                    ]}
                  >
                    <View style={styles.footerInfo}>
                      <MaterialCommunityIcons
                        name="air-filter"
                        size={14}
                        color={darkMode ? colors.slate400 : "#64748B"}
                      />
                      <Text
                        style={[
                          styles.footerText,
                          {
                            color: darkMode ? colors.slate400 : colors.slate600,
                          },
                        ]}
                      >
                        Qualité Air: Excellente
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.footerUpdateText,
                        { color: darkMode ? colors.slate500 : colors.slate500 },
                      ]}
                    >
                      Mis à jour il y a {item.lastUpdated}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
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

      {/* MODAL NOTIFICATIONS */}
      <Modal visible={notificationsVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: darkMode ? "#1e293b" : "#fff" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: darkMode ? colors.white : colors.slate900 },
                ]}
              >
                Notifications
              </Text>
              <TouchableOpacity onPress={() => setNotificationsVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {loadingAlerts ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator size="large" color="#22C55E" />
                </View>
              ) : allAlerts.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={40}
                    color="#94a3b8"
                  />
                  <Text
                    style={[
                      styles.emptyText,
                      { color: "#94a3b8", marginTop: 12 },
                    ]}
                  >
                    Aucune alerte non lue
                  </Text>
                </View>
              ) : (
                allAlerts.map((alert) => {
                  const isRead = alert.isRead || alert.read;
                  const isCrit =
                    alert.severity === "critical" || alert.type === "CRITIQUE";

                  return (
                    <TouchableOpacity
                      key={alert._id}
                      onPress={() => {
                        if (!isRead) handleMarkAlertAsRead(alert._id);
                        navigation.navigate("PoultryDetail", {
                          poultryId: alert.poultryId,
                          poultryName: alert.poultryName,
                        });
                        setNotificationsVisible(false);
                      }}
                      activeOpacity={isRead ? 1 : 0.7}
                      style={[
                        styles.alertItem,
                        { backgroundColor: darkMode ? "#0f172a" : "#f8fafc" },
                        isRead && { opacity: 0.5 },
                      ]}
                    >
                      <View
                        style={[
                          styles.alertIcon,
                          {
                            backgroundColor: isCrit ? "#ef444420" : "#f9731620",
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={isCrit ? "error" : "warning"}
                          size={20}
                          color={isCrit ? "#ef4444" : "#f97316"}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        {/* Nom du poulailler */}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: darkMode ? "#94a3b8" : "#64748b",
                            marginBottom: 4,
                          }}
                        >
                          {alert.poultryName || "Poulailler inconnu"}
                        </Text>

                        <Text
                          style={[
                            styles.alertMsg,
                            {
                              color: darkMode ? colors.white : colors.slate900,
                            },
                          ]}
                        >
                          {alert.message || alert.type || "Alerte système"}
                        </Text>

                        <Text style={[styles.alertTime, { color: "#94a3b8" }]}>
                          {new Date(alert.createdAt).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>

                      {!isRead && (
                        <View
                          style={[
                            styles.unreadDot,
                            { backgroundColor: isCrit ? "#ef4444" : "#f97316" },
                          ]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })
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

const StatCard = ({ label, value, icon, trend, color, iconColor }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconContainer, { backgroundColor: color }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.statValueRow}>
      <Text style={styles.statValue}>{value}</Text>
      <Text
        style={[
          styles.statTrend,
          { color: trend.startsWith("-") ? "#EF4444" : "#22C55E" },
        ]}
      >
        {trend}
      </Text>
    </View>
  </View>
);

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
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  redDotText: { color: "#fff", fontSize: 10, fontWeight: "800" },
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
    backgroundColor: "#FFF",
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
  connectedBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  alertBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#1E293B" },
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
  metricsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  metricBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
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
    borderTopColor: "#F1F5F9",
    paddingTop: 15,
  },
  footerInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 11, color: "#64748B", fontWeight: "500" },
  footerUpdateText: { fontSize: 11, color: "#94A3B8", fontWeight: "500" },
  fab: {
    position: "absolute",
    bottom: 100,
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
    marginTop: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  emptyStateText: { fontSize: 16, fontWeight: "600", marginTop: 12 },
  emptyStateBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#22C55E",
    borderRadius: 12,
  },
  emptyStateBtnText: { color: "#fff", fontWeight: "600" },

  // Modal styles
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
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalBody: { padding: 20 },
  emptyText: { fontSize: 14, fontWeight: "500" },
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
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
});
