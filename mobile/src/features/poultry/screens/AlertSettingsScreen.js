// screens/AlertSettingsScreen.jsx
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../../../context/ThemeContext";
import Toast from "../../../components/Toast";

import useAlertSettings, { PARAM_ICONS } from "../../../hooks/useAlertSettings";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSeverityMeta(item) {
  if (item.severity === "danger")
    return { icon: "error-outline", label: "DANGER", color: "#ef4444" };
  if (item.severity === "warn")
    return { icon: "warning-amber", label: "AVERTISSEMENT", color: "#f97316" };
  return { icon: "check-circle-outline", label: "INFO", color: "#22C55E" };
}

// ── Screen ────────────────────────────────────────────────────────────────────

const AlertSettingsScreen = ({ route, navigation }) => {
  const { poultryId, poultryName = "Poulailler" } = route.params || {};
  const { darkMode, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState("settings");
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });

  const {
    loading,
    saving,
    stats,
    alerts,
    thresholds,
    hasChanges,
    handleThresholdChange,
    handleSave,
    handleReset,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleDeleteRead,
    fetchData,
  } = useAlertSettings({ poultryId, activeTab, setToast });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData();
    } catch {
      setToast({
        visible: true,
        message: "Erreur de rafraîchissement",
        type: "error",
      });
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  // ── Thème ───────────────────────────────────────────────────────────────────
  const bg = darkMode ? colors.slate950 : colors.slate50;
  const cardBg = darkMode ? "#1e293b" : "#ffffff";
  const borderCol = darkMode ? "#334155" : "#e2e8f0";
  const textCol = darkMode ? colors.white : colors.slate900;
  const subCol = darkMode ? "#94a3b8" : "#64748b";
  const iconCol = darkMode ? "#cbd5e1" : "#475569";

  const dynamicPaddingBottom = 70 + Math.max(insets.bottom, 10) + 20;

  // ✅ FIX : Utiliser stats.unread en priorité (plus fiable que la liste paginée)
  const unreadCount = stats?.unread ?? alerts.filter((a) => !a.read).length;

  // ── Input helper ────────────────────────────────────────────────────────────
  const renderInput = (label, value, key, unit, fullWidth = false) => (
    <View style={[styles.inputContainer, fullWidth && { width: "100%" }]}>
      <Text style={[styles.inputLabel, { color: subCol }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: cardBg, borderColor: borderCol },
        ]}
      >
        <TextInput
          style={[styles.input, { color: textCol }]}
          value={value != null ? String(value) : ""}
          onChangeText={(t) => handleThresholdChange(key, t)}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={subCol}
        />
        <Text style={[styles.unitText, { color: subCol }]}>{unit}</Text>
      </View>
    </View>
  );

  // ── Section label ───────────────────────────────────────────────────────────
  const renderSectionLabel = (iconName, label) => (
    <View style={styles.sectionLabelRow}>
      <View
        style={[
          styles.sectionIconWrap,
          {
            backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
            borderColor: borderCol,
          },
        ]}
      >
        <MaterialIcons name={iconName} size={15} color={iconCol} />
      </View>
      <Text style={[styles.catLabel, { color: textCol }]}>{label}</Text>
    </View>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar style={darkMode ? "light" : "dark"} />

      {/* ── Header ── */}
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

        <Text
          style={[styles.headerTitle, { color: textCol }]}
          numberOfLines={1}
        >
          {poultryName} — Alertes
        </Text>

        {/* ✅ FIX : Logique des boutons selon l'onglet actif */}
        {activeTab === "settings" ? (
          hasChanges ? (
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
          )
        ) : (
          // Onglet Alertes : bouton refresh uniquement
          <TouchableOpacity onPress={handleRefresh}>
            <View
              style={[
                styles.iconBtn,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <MaterialIcons name="refresh" size={22} color={textCol} />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab Bar ── */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: cardBg, borderBottomColor: borderCol },
        ]}
      >
        {[
          { key: "settings", label: "Seuils", icon: "tune" },
          { key: "alerts", label: "Alertes", icon: "notifications" },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialIcons
                name={tab.icon}
                size={16}
                color={active ? "#22C55E" : subCol}
              />
              <Text
                style={[styles.tabText, { color: active ? "#22C55E" : subCol }]}
              >
                {tab.label}
              </Text>
              {tab.key === "alerts" && unreadCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: dynamicPaddingBottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#22C55E"
            colors={["#22C55E"]}
          />
        }
      >
        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB SEUILS                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "settings" && (
          <>
            {/* Info banner */}
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
                  système. Modifiez-les pour personnaliser ce poulailler.
                </Text>
              </View>
            </View>

            {/* ✅ FIX : Switch Notifications supprimé (non fonctionnel) */}

            {/* Température */}
            {renderSectionLabel("thermostat", "Température")}
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

            {/* Humidité */}
            {renderSectionLabel("water-drop", "Humidité")}
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

            {/* Qualité de l'air */}
            {renderSectionLabel("air", "Qualité de l'air")}
            <View
              style={[
                styles.card,
                { backgroundColor: cardBg, borderColor: borderCol },
              ]}
            >
              <View style={styles.row}>
                {renderInput(
                  "Seuil min",
                  thresholds.airQualityMin, // ← était airQualityMax
                  "airQualityMin", // ← était airQualityMax
                  "%", // ← était "ppm"
                )}
              </View>
            </View>

            {/* Eau */}
            {renderSectionLabel("water", "Niveau d'eau")}
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

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB ALERTES                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === "alerts" && (
          <>
            {/* Stats */}
            {stats && (
              <View style={styles.statsRow}>
                {[
                  {
                    label: "Total",
                    value: stats.total,
                    icon: "list-alt",
                    color: subCol,
                  },
                  {
                    label: "Non lues",
                    value: stats.unread,
                    icon: "mark-email-unread",
                    color: "#ef4444",
                  },
                  {
                    // ✅ FIX : Accès correct à bySeverity.danger
                    label: "Danger",
                    value: stats.bySeverity?.danger ?? 0,
                    icon: "error-outline",
                    color: "#ef4444",
                  },
                ].map((s) => (
                  <View
                    key={s.label}
                    style={[
                      styles.statCard,
                      { backgroundColor: cardBg, borderColor: borderCol },
                    ]}
                  >
                    <MaterialIcons
                      name={s.icon}
                      size={18}
                      color={s.color}
                      style={{ marginBottom: 4 }}
                    />
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
                      backgroundColor: "rgba(34,197,94,0.08)",
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
                      backgroundColor: "rgba(239,68,68,0.08)",
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
                  name="notifications-off"
                  size={40}
                  color={subCol}
                />
                <Text style={[styles.emptyText, { color: subCol }]}>
                  Aucune alerte
                </Text>
              </View>
            ) : (
              alerts.map((item) => {
                const isRead = item.read;
                const meta = getSeverityMeta(item);
                const param = PARAM_ICONS[item.parameter] || {
                  icon: "sensors",
                  color: "#f59e0b",
                };
                const rowIcon = item.parameter ? param.icon : meta.icon;

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
                          borderColor: isRead ? borderCol : meta.color + "35",
                        },
                        isRead && { opacity: 0.5 },
                      ]}
                    >
                      <View
                        style={[
                          styles.alertIconWrap,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#f8fafc",
                            borderColor: borderCol,
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={rowIcon}
                          size={20}
                          color={isRead ? subCol : iconCol}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.alertMsg,
                            { color: isRead ? subCol : textCol },
                          ]}
                        >
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
                                backgroundColor: meta.color + "15",
                                borderColor: meta.color + "30",
                                borderWidth: 1,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.severityText,
                                { color: meta.color },
                              ]}
                            >
                              {meta.label}
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

                      {!isRead && (
                        <View
                          style={[
                            styles.unreadDot,
                            { backgroundColor: meta.color },
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

// ── Styles ────────────────────────────────────────────────────────────────────

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
    fontSize: 18,
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

  tabBar: { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 16 },
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

  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  catLabel: { fontSize: 14, fontWeight: "700" },

  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardSub: { fontSize: 12, marginTop: 3 },

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
  statValue: { fontSize: 20, fontWeight: "800" },
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
  alertIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  alertMsg: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  severityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  severityText: { fontSize: 10, fontWeight: "800" },
  alertTime: { fontSize: 11 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    flexShrink: 0,
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
