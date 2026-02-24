import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import Toast from "../../../components/Toast";
import {
  getThresholds,
  updateThresholds,
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  deleteReadAlerts,
  getAlertStats,
  getDefaultThresholds,
} from "../../../services/poultry";

const PARAM_ICONS = {
  temperature: { icon: "thermostat", color: "#ef4444" },
  humidity: { icon: "water-drop", color: "#3b82f6" },
  co2: { icon: "air", color: "#f97316" },
  nh3: { icon: "science", color: "#a855f7" },
  dust: { icon: "blur-on", color: "#f59e0b" },
  waterLevel: { icon: "water", color: "#06b6d4" },
};

// Valeurs par défaut en cas d'erreur de chargement
const FALLBACK_THREHOLDS = {
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 70,
  co2Max: 1500,
  nh3Max: 25,
  dustMax: 150,
  waterLevelMin: 20,
};

const AlertSettingsScreen = ({ route, navigation }) => {
  const { poultryId } = route.params || {};
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const [activeTab, setActiveTab] = useState("settings");
  const [stats, setStats] = useState(null);

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  // États pour les seuils
  const [defaultThresholds, setDefaultThresholds] =
    useState(FALLBACK_THREHOLDS);
  const [thresholds, setThresholds] = useState(FALLBACK_THREHOLDS);
  const previousThresholds = useRef(FALLBACK_THREHOLDS);
  const [alerts, setAlerts] = useState([]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validateThresholds = (vals) => {
    if (vals.temperatureMin >= vals.temperatureMax)
      return "Température min doit être < max";
    if (vals.humidityMin >= vals.humidityMax)
      return "Humidité min doit être < max";
    if (vals.temperatureMin < -20 || vals.temperatureMax > 50)
      return "Température hors plage (-20°C à 50°C)";
    if (vals.humidityMin < 0 || vals.humidityMax > 100)
      return "Humidité entre 0% et 100%";
    if (vals.co2Max < 400 || vals.co2Max > 5000)
      return "CO₂ entre 400 et 5000 ppm";
    if (vals.nh3Max < 0 || vals.nh3Max > 100) return "NH₃ entre 0 et 100 ppm";
    if (vals.dustMax < 0 || vals.dustMax > 500)
      return "Poussière entre 0 et 500 µg";
    if (vals.waterLevelMin < 0 || vals.waterLevelMin > 100)
      return "Niveau d'eau entre 0 et 100%";
    return null;
  };

  const hasChanges = useMemo(
    () =>
      JSON.stringify(thresholds) !== JSON.stringify(previousThresholds.current),
    [thresholds],
  );

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. D'abord récupérer les seuils par défaut depuis SystemConfig
      let fetchedDefaults = FALLBACK_THREHOLDS;
      try {
        const defaultRes = await getDefaultThresholds();
        if (defaultRes.success && defaultRes.data) {
          fetchedDefaults = { ...FALLBACK_THREHOLDS, ...defaultRes.data };
          setDefaultThresholds(fetchedDefaults);
        }
      } catch (e) {
        console.log("[AlertSettings] Erreur chargement seuils par défaut:", e);
      }

      // 2. Récupérer les seuils du poulailler spécifique
      const [threshRes, alertRes, statsRes] = await Promise.all([
        getThresholds(poultryId),
        getAlerts(poultryId),
        getAlertStats(poultryId),
      ]);

      if (threshRes.success) {
        // Fusionner: valeurs du poulailler avec les valeurs par défaut
        const t = { ...fetchedDefaults, ...threshRes.data };
        setThresholds(t);
        previousThresholds.current = t;
      } else {
        // Si pas de seuils personnalisés, utiliser les défaut
        setThresholds(fetchedDefaults);
        previousThresholds.current = fetchedDefaults;
      }

      if (alertRes.success) {
        setAlerts(
          Array.isArray(alertRes.data) ? alertRes.data.slice(0, 30) : [],
        );
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (e) {
      console.log("Fetch error", e);
    } finally {
      setLoading(false);
    }
  }, [poultryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Save thresholds ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    const err = validateThresholds(thresholds);
    if (err) {
      setToast({ visible: true, message: err, type: "error" });
      return;
    }
    try {
      setSaving(true);
      const res = await updateThresholds(poultryId, thresholds);
      if (res.success) {
        previousThresholds.current = thresholds;
        setToast({
          visible: true,
          message: "Seuils enregistrés ✓",
          type: "success",
        });
      }
    } catch (e) {
      setToast({
        visible: true,
        message: "Erreur lors de l'enregistrement",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Reset aux valeurs par défaut (SystemConfig) ─────────────────────────────
  const handleReset = () => {
    Alert.alert(
      "Réinitialiser",
      "Voulez-vous réinitialiser les seuils aux valeurs par défaut ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Réinitialiser",
          onPress: () => {
            setThresholds(defaultThresholds);
            previousThresholds.current = defaultThresholds;
          },
        },
      ],
    );
  };

  // ── Alert actions ───────────────────────────────────────────────────────────
  const handleMarkAsRead = async (alertId) => {
    try {
      await markAlertAsRead(alertId);
      setAlerts((prev) =>
        prev.map((a) =>
          a._id === alertId ? { ...a, read: true, isRead: true } : a,
        ),
      );
      setStats((prev) =>
        prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev,
      );
    } catch (e) {
      console.log(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAlertsAsRead(poultryId);
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, read: true, isRead: true })),
      );
      setStats((prev) => (prev ? { ...prev, unread: 0 } : prev));
      setToast({
        visible: true,
        message: "Toutes les alertes marquées comme lues",
        type: "success",
      });
    } catch (e) {
      setToast({ visible: true, message: "Erreur", type: "error" });
    }
  };

  const handleDeleteRead = () => {
    Alert.alert("Supprimer", "Supprimer toutes les alertes lues ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteReadAlerts(poultryId);
            setAlerts((prev) => prev.filter((a) => !a.isRead && !a.read));
            setToast({
              visible: true,
              message: "Alertes lues supprimées",
              type: "success",
            });
          } catch (e) {
            setToast({
              visible: true,
              message: "Erreur lors de la suppression",
              type: "error",
            });
          }
        },
      },
    ]);
  };

  const handleThresholdChange = (key, text) => {
    const numeric = text.replace(/[^0-9.-]/g, "");
    if (numeric === "" || !isNaN(parseFloat(numeric))) {
      setThresholds({
        ...thresholds,
        [key]: numeric === "" ? 0 : parseFloat(numeric) || 0,
      });
    }
  };

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const bg = darkMode ? colors.slate950 : colors.slate50;
  const cardBg = darkMode ? "#1e293b" : "#ffffff";
  const borderCol = darkMode ? "#334155" : "#e2e8f0";
  const textCol = darkMode ? colors.white : colors.slate900;
  const subCol = darkMode ? "#94a3b8" : "#64748b";

  const renderInput = (label, value, key, unit) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: subCol }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: cardBg, borderColor: borderCol },
        ]}
      >
        <TextInput
          style={[styles.input, { color: textCol }]}
          value={value.toString()}
          onChangeText={(t) => handleThresholdChange(key, t)}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={subCol}
        />
        <Text style={[styles.unitText, { color: subCol }]}>{unit}</Text>
      </View>
    </View>
  );

  const unreadCount = alerts.filter((a) => !a.isRead && !a.read).length;

  if (loading)
    return (
      <View style={[styles.container, styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar style={darkMode ? "light" : "dark"} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <View
            style={[
              styles.iconBtn,
              { backgroundColor: cardBg, borderColor: borderCol },
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color={textCol} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: textCol }]}>
          Configuration
        </Text>

        {hasChanges && activeTab === "settings" ? (
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.saveText, { color: "#22C55E" }]}>
              {saving ? "..." : "ENREGISTRER"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleReset}>
            <View
              style={[
                styles.iconBtn,
                {
                  backgroundColor: "rgba(34,197,94,0.1)",
                  borderColor: "#22C55E",
                },
              ]}
            >
              <MaterialIcons name="refresh" size={22} color="#22C55E" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: cardBg, borderBottomColor: borderCol },
        ]}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === "settings" && styles.tabActive]}
          onPress={() => setActiveTab("settings")}
        >
          <MaterialIcons
            name="tune"
            size={16}
            color={activeTab === "settings" ? "#22C55E" : subCol}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "settings" ? "#22C55E" : subCol },
            ]}
          >
            Seuils
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === "alerts" && styles.tabActive]}
          onPress={() => setActiveTab("alerts")}
        >
          <MaterialIcons
            name="notifications"
            size={16}
            color={activeTab === "alerts" ? "#22C55E" : subCol}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === "alerts" ? "#22C55E" : subCol },
            ]}
          >
            Alertes
          </Text>
          {unreadCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: dynamicPaddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB SEUILS                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <>
            {/* Info sur les seuils par défaut */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: borderCol,
                  marginBottom: 16,
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <MaterialIcons name="info-outline" size={18} color={subCol} />
                <Text style={[styles.cardSub, { color: subCol, flex: 1 }]}>
                  Les valeurs par défaut proviennent de la configuration
                  système. Modifiez-les pour personaliser ce poulailler.
                </Text>
              </View>
            </View>

            {/* Notifications toggle */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: borderCol,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 24,
                },
              ]}
            >
              <View>
                <Text style={[styles.cardTitle, { color: textCol }]}>
                  Notifications mobiles
                </Text>
                <Text style={[styles.cardSub, { color: subCol }]}>
                  Recevoir les alertes sur le téléphone
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: "#475569", true: "#22C55E" }}
                thumbColor="#fff"
              />
            </View>

            {/* 🌡 Température */}
            <Text style={[styles.catLabel, { color: textCol }]}>
              🌡 Température
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <View style={styles.row}>
                {renderInput(
                  "Min",
                  thresholds.temperatureMin,
                  "temperatureMin",
                  "°C",
                )}
                {renderInput(
                  "Max",
                  thresholds.temperatureMax,
                  "temperatureMax",
                  "°C",
                )}
              </View>
            </View>

            {/* 💧 Humidité */}
            <Text style={[styles.catLabel, { color: textCol }]}>
              💧 Humidité
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <View style={styles.row}>
                {renderInput("Min", thresholds.humidityMin, "humidityMin", "%")}
                {renderInput("Max", thresholds.humidityMax, "humidityMax", "%")}
              </View>
            </View>

            {/* 🌫 Qualité air */}
            <Text style={[styles.catLabel, { color: textCol }]}>
              🌫 Qualité de l'air
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <View style={styles.row}>
                {renderInput("CO₂ Max", thresholds.co2Max, "co2Max", "ppm")}
                {renderInput("NH₃ Max", thresholds.nh3Max, "nh3Max", "ppm")}
              </View>
              <View style={styles.row}>
                {renderInput(
                  "Poussière Max",
                  thresholds.dustMax,
                  "dustMax",
                  "µg",
                )}
              </View>
            </View>

            {/* 🚰 Eau */}
            <Text style={[styles.catLabel, { color: textCol }]}>🚰 Eau</Text>
            <View
              style={[
                styles.card,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <View style={styles.row}>
                {renderInput(
                  "Niveau Min",
                  thresholds.waterLevelMin,
                  "waterLevelMin",
                  "%",
                )}
              </View>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB ALERTES                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "alerts" && (
          <>
            {/* Stats bar */}
            {stats && (
              <View style={styles.statsRow}>
                {[
                  { label: "Total", value: stats.total, color: "#64748b" },
                  { label: "Non lues", value: stats.unread, color: "#ef4444" },
                  {
                    label: "Critiques",
                    value: stats.critical,
                    color: "#f97316",
                  },
                ].map((s) => (
                  <View
                    key={s.label}
                    style={[
                      styles.statCard,
                      { backgroundColor: cardBg, borderColor: borderCol },
                    ]}
                  >
                    <Text style={[styles.statValue, { color: s.color }]}>
                      {s.value}
                    </Text>
                    <Text style={[styles.statLabel, { color: subCol }]}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Actions groupées */}
            {alerts.length > 0 && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: "rgba(34,197,94,0.1)",
                      borderColor: "#22C55E",
                    },
                  ]}
                  onPress={handleMarkAllAsRead}
                >
                  <MaterialIcons name="done-all" size={16} color="#22C55E" />
                  <Text style={[styles.actionBtnText, { color: "#22C55E" }]}>
                    Tout lire
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: "rgba(239,68,68,0.1)",
                      borderColor: "#ef4444",
                    },
                  ]}
                  onPress={handleDeleteRead}
                >
                  <MaterialIcons
                    name="delete-sweep"
                    size={16}
                    color="#ef4444"
                  />
                  <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>
                    Supprimer lues
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Liste alertes */}
            {alerts.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { backgroundColor: cardBg, borderColor: borderCol },
                ]}
              >
                <MaterialIcons
                  name="notifications-none"
                  size={40}
                  color={subCol}
                />
                <Text style={[styles.emptyText, { color: subCol }]}>
                  Aucune alerte
                </Text>
              </View>
            ) : (
              alerts.map((item) => {
                const isRead = item.isRead || item.read;
                const isCrit =
                  item.severity === "critical" || item.type === "CRITIQUE";
                const param = PARAM_ICONS[item.parameter] || {
                  icon: "warning",
                  color: "#f59e0b",
                };
                return (
                  <TouchableOpacity
                    key={item._id}
                    onPress={() => !isRead && handleMarkAsRead(item._id)}
                    activeOpacity={isRead ? 1 : 0.7}
                  >
                    <View
                      style={[
                        styles.alertItem,
                        {
                          backgroundColor: cardBg,
                          borderColor: isRead
                            ? borderCol
                            : isCrit
                              ? "#ef444430"
                              : "#f9731630",
                        },
                        isRead && { opacity: 0.55 },
                      ]}
                    >
                      {/* Icône capteur */}
                      <View
                        style={[
                          styles.alertIcon,
                          { backgroundColor: param.color + "20" },
                        ]}
                      >
                        <MaterialIcons
                          name={param.icon}
                          size={20}
                          color={param.color}
                        />
                      </View>

                      {/* Contenu */}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertMsg, { color: textCol }]}>
                          {item.message}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 4,
                          }}
                        >
                          <View
                            style={[
                              styles.severityBadge,
                              {
                                backgroundColor: isCrit
                                  ? "#ef444420"
                                  : "#f9731620",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.severityText,
                                { color: isCrit ? "#ef4444" : "#f97316" },
                              ]}
                            >
                              {isCrit ? "CRITIQUE" : "ATTENTION"}
                            </Text>
                          </View>
                          <Text style={[styles.alertTime, { color: subCol }]}>
                            {new Date(item.createdAt).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </View>
                      </View>

                      {/* Indicateur non lu */}
                      {!isRead && (
                        <View
                          style={[
                            styles.unreadDot,
                            { backgroundColor: isCrit ? "#ef4444" : "#f97316" },
                          ]}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { padding: 4 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  saveText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingHorizontal: 8,
  },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: "#22C55E" },
  tabText: { fontSize: 13, fontWeight: "700" },
  tabBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardSub: { fontSize: 12, marginTop: 3 },

  catLabel: { fontSize: 14, fontWeight: "700", marginBottom: 10 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  inputContainer: { width: "48%" },
  inputLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 16, fontWeight: "500", padding: 0 },
  unitText: { fontSize: 12, fontWeight: "600", marginLeft: 8 },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1.5,
  },
  alertIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  alertMsg: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  severityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityText: { fontSize: 10, fontWeight: "800" },
  alertTime: { fontSize: 11 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },

  emptyCard: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 14, fontWeight: "600" },
});

export default AlertSettingsScreen;
