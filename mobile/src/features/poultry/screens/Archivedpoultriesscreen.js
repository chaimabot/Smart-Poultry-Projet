import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
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
import Toast from "../../../components/Toast";
import { useTheme } from "../../../context/ThemeContext";
import { useFocusEffect } from "@react-navigation/native";

// Services
import {
  getArchivedPoultries,
  restorePoultry,
  archivePoultry,
  deletePoultry,
} from "../../../services/poultry";

export default function ArchivedPoultriesScreen({ navigation }) {
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [archivedPoultries, setArchivedPoultries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  const fetchArchivedPoultries = async () => {
    try {
      setLoading(true);
      const data = await getArchivedPoultries();
      if (data?.success) {
        const archived = data.data.map((p) => ({
          id: p._id,
          name: p.name,
          type: p.type,
          location: p.location || "Zone Élevage 1",
          count: p.animalCount || 0,
          temp: p.lastMonitoring?.temperature?.toFixed(1) || "24.5",
          humid: p.lastMonitoring?.humidity?.toFixed(0) || "62",
          image:
            p.photoUrl ||
            "https://images.unsplash.com/photo-1581092160607-798aa0b7d9c6?w=800",
          archivedAt: p.updatedAt,
        }));
        setArchivedPoultries(archived);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchArchivedPoultries();
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchArchivedPoultries();
  }, []);

  const handleRestorePoultry = async (poultryId) => {
    Alert.alert(
      "Restaurer",
      "Ce poulailler sera à nouveau visible dans votre liste principale.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Restaurer",
          onPress: async () => {
            try {
              setActionInProgress(poultryId);
              // Restaurer le poulailler archivé
              const res = await restorePoultry(poultryId);
              if (res?.success) {
                setToast({
                  visible: true,
                  message: "Poulailler restauré avec succès",
                  type: "success",
                });
                // Retirer de la liste des archivés
                setArchivedPoultries((prev) =>
                  prev.filter((p) => p.id !== poultryId),
                );
              } else {
                setToast({
                  visible: true,
                  message: "Erreur lors de la restauration",
                  type: "error",
                });
              }
            } catch (e) {
              setToast({ visible: true, message: "Erreur", type: "error" });
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ],
    );
  };

  const handleDeletePoultry = async (poultryId) => {
    Alert.alert(
      "Supprimer définitivement",
      "Cette action est irréversible. Toutes les données seront perdues.",
      [
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
                  message: "Poulailler supprimé définitivement",
                  type: "success",
                });
                setArchivedPoultries((prev) =>
                  prev.filter((p) => p.id !== poultryId),
                );
              } else {
                setToast({
                  visible: true,
                  message: "Erreur lors de la suppression",
                  type: "error",
                });
              }
            } catch (e) {
              setToast({ visible: true, message: "Erreur", type: "error" });
            } finally {
              setActionInProgress(null);
            }
          },
        },
      ],
    );
  };

  const handleMenuPress = (poultryId) => {
    Alert.alert("Actions", "Sélectionnez une action", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Restaurer",
        onPress: () => handleRestorePoultry(poultryId),
      },
      {
        text: "Supprimer définitivement",
        style: "destructive",
        onPress: () => handleDeletePoultry(poultryId),
      },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: darkMode ? colors.slate950 : "#F8FAF9" },
        ]}
      >
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: darkMode ? colors.slate950 : "#F8FAF9" },
      ]}
    >
      <StatusBar style={darkMode ? "light" : "dark"} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={darkMode ? colors.white : "#1E293B"}
            />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: darkMode ? colors.white : "#1E293B" },
            ]}
          >
            Poulaillers archivés
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
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
          {/* Info Box */}
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: darkMode ? "#1e293b" : "#F0F9FF",
                borderColor: darkMode ? "#334155" : "#BAE6FD",
              },
            ]}
          >
            <Ionicons name="information-circle" size={20} color="#0EA5E9" />
            <Text
              style={[
                styles.infoText,
                { color: darkMode ? colors.slate300 : "#0C4A6E" },
              ]}
            >
              Les poulaillers archivés ne sont plus visibles dans votre liste
              principale. Vous pouvez les restaurer à tout moment.
            </Text>
          </View>

          {/* Poultry Cards List */}
          {archivedPoultries.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9" },
              ]}
            >
              <Ionicons
                name="archive-outline"
                size={48}
                color={darkMode ? colors.slate400 : "#94A3B8"}
              />
              <Text
                style={[
                  styles.emptyStateText,
                  { color: darkMode ? colors.white : colors.slate900 },
                ]}
              >
                Aucun poulailler archivé
              </Text>
              <Text
                style={[
                  styles.emptyStateSubText,
                  { color: darkMode ? colors.slate400 : colors.slate600 },
                ]}
              >
                Les poulaillers que vous archivez apparaîtront ici
              </Text>
            </View>
          ) : (
            archivedPoultries.map((item) => (
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
                {/* Badge Archivé */}
                <View style={styles.archivedBadge}>
                  <Ionicons name="archive" size={14} color="#64748B" />
                  <Text style={styles.archivedBadgeText}>ARCHIVÉ</Text>
                </View>

                <View style={styles.cardImageContainer}>
                  <Image
                    source={{ uri: item.image }}
                    style={[styles.cardImage, styles.archivedImage]}
                  />
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.cardName,
                          {
                            color: darkMode ? colors.slate300 : colors.slate700,
                          },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.zoneRow}>
                        <Ionicons
                          name="location-outline"
                          size={14}
                          color="#94A3B8"
                        />
                        <Text style={styles.zoneText}>{item.location}</Text>
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
                        { backgroundColor: darkMode ? "#0f172a" : "#F1F5F9" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="thermometer"
                        size={18}
                        color="#64748B"
                      />
                      <View style={styles.metricTextCol}>
                        <Text style={styles.metricLabel}>TEMP.</Text>
                        <Text
                          style={[
                            styles.metricValue,
                            {
                              color: darkMode
                                ? colors.slate400
                                : colors.slate600,
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
                        { backgroundColor: darkMode ? "#0f172a" : "#F1F5F9" },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="water-percent"
                        size={20}
                        color="#64748B"
                      />
                      <View style={styles.metricTextCol}>
                        <Text style={styles.metricLabel}>HUMIDITÉ</Text>
                        <Text
                          style={[
                            styles.metricValue,
                            {
                              color: darkMode
                                ? colors.slate400
                                : colors.slate600,
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
                      {
                        borderTopColor: darkMode ? "#334155" : "#E2E8F0",
                      },
                    ]}
                  >
                    <Text style={styles.footerText}>
                      Archivé le{" "}
                      {new Date(item.archivedAt).toLocaleDateString("fr-FR")}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  emptyState: {
    padding: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    marginTop: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },
  emptyStateSubText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  card: {
    borderRadius: 24,
    marginBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
    position: "relative",
  },
  archivedBadge: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  archivedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  cardImageContainer: {
    width: "100%",
    height: 160,
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  archivedImage: {
    opacity: 0.5,
  },
  cardContent: {
    padding: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  cardName: {
    fontSize: 18,
    fontWeight: "800",
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  zoneText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  metricBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  metricTextCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  cardFooter: {
    paddingTop: 15,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
