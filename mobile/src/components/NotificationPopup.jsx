// components/NotificationPopup.jsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  if (!ts) return "À l'instant";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function severityStyle(severity) {
  if (severity === "danger")
    return {
      bg: "#FEF2F2",
      dot: "#EF4444",
      badgeBg: "#FEF2F2",
      badgeColor: "#EF4444",
      badgeBorder: "#EF444430",
      label: "Danger",
    };
  if (severity === "warn")
    return {
      bg: "#FFF7ED",
      dot: "#F59E0B",
      badgeBg: "#FFF7ED",
      badgeColor: "#F59E0B",
      badgeBorder: "#F59E0B30",
      label: "Attention",
    };
  return {
    bg: "#fff",
    dot: "#CBD5E1",
    badgeBg: "#F0FDF4",
    badgeColor: "#22C55E",
    badgeBorder: "#22C55E30",
    label: "Normal",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object[]} alerts
 * @param {()=>void} onClose
 * @param {()=>void} onMarkAllRead
 * @param {()=>void} onViewAll
 */
export default function NotificationPopup({
  alerts,
  onClose,
  onMarkAllRead,
  onViewAll,
}) {
  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.3)" }}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Panel */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: Platform.OS === "ios" ? 98 : 64,
            right: 12,
            width: 315,
            backgroundColor: "#fff",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            shadowColor: "#0F172A",
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 16,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
            }}
          >
            <View>
              <Text
                style={{ fontSize: 15, fontWeight: "800", color: "#1E293B" }}
              >
                Notifications
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: "#94A3B8",
                  marginTop: 1,
                  fontWeight: "500",
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
                  : "Tout est lu"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Mark all read */}
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={onMarkAllRead}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#F8FAFC",
              }}
            >
              <MaterialIcons name="done-all" size={15} color="#22C55E" />
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: "#22C55E" }}
              >
                Tout marquer comme lu
              </Text>
            </TouchableOpacity>
          )}

          {/* Alert list */}
          <ScrollView
            style={{ maxHeight: 320 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {alerts.length === 0 ? (
              <View
                style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    backgroundColor: "#F8FAFC",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons
                    name="notifications-none"
                    size={26}
                    color="#CBD5E1"
                  />
                </View>
                <Text
                  style={{ fontSize: 13, color: "#94A3B8", fontWeight: "500" }}
                >
                  Aucune notification
                </Text>
              </View>
            ) : (
              alerts.slice(0, 10).map((alert, idx) => {
                const s = severityStyle(alert.severity);
                return (
                  <View
                    key={alert._id || idx}
                    style={{
                      flexDirection: "row",
                      gap: 10,
                      alignItems: "flex-start",
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F1F5F9",
                      backgroundColor: alert.read ? "#fff" : s.bg,
                    }}
                  >
                    {/* Dot */}
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        marginTop: 5,
                        backgroundColor: alert.read ? "#E2E8F0" : s.dot,
                        flexShrink: 0,
                      }}
                    />

                    <View style={{ flex: 1 }}>
                      {/* Badge row */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: s.badgeBg,
                            borderRadius: 20,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            borderWidth: 1,
                            borderColor: s.badgeBorder,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: s.badgeColor,
                              textTransform: "uppercase",
                              letterSpacing: 0.3,
                            }}
                          >
                            {s.label}
                          </Text>
                        </View>
                        {alert.type && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: "#94A3B8",
                              fontWeight: "500",
                            }}
                          >
                            {alert.type}
                          </Text>
                        )}
                      </View>

                      {/* Message */}
                      <Text
                        style={{
                          fontSize: 12,
                          color: alert.read ? "#64748B" : "#1E293B",
                          fontWeight: alert.read ? "400" : "600",
                          lineHeight: 18,
                        }}
                        numberOfLines={2}
                      >
                        {alert.message}
                      </Text>

                      {/* Timestamp */}
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#94A3B8",
                          marginTop: 3,
                          fontWeight: "500",
                        }}
                      >
                        {relativeTime(alert.timestamp)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity
            onPress={onViewAll}
            style={{
              paddingVertical: 13,
              paddingHorizontal: 16,
              borderTopWidth: 1,
              borderTopColor: "#F1F5F9",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: "#F0FDF4",
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#22C55E" }}>
              Voir toutes les notifications
            </Text>
            <MaterialIcons name="arrow-forward" size={15} color="#22C55E" />
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
