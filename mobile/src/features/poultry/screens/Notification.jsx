// screens/Notifications.jsx - 100% DYNAMIC ✅ Compatible AlertController
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useNotifications } from "../../../context/NotificationsContext";

// ─── Helper : extraire l'ID poulailler ──────────────────────────────────────
function getPoultryId(alert) {
  const raw = alert.poulailler ?? alert.poultryId ?? null;
  if (!raw) return null;
  if (typeof raw === "object" && raw._id) return String(raw._id);
  return String(raw);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function relativeTime(ts) {
  if (!ts) return "À l'instant";
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "Hier";
  return new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Severity : "info" | "warn" | "danger" (modèle Mongoose) ─────────────────
function severityConfig(severity) {
  if (severity === "danger")
    return {
      bg: "#FEF2F2",
      dot: "#EF4444",
      badgeBg: "#FEF2F2",
      badgeColor: "#B91C1C",
      badgeBorder: "#FCA5A5",
      label: "🔴 Critique",
      shortLabel: "Critique",
      sectionTitle: "Alertes critiques",
      sectionIcon: "warning",
      icon: "warning",
      iconColor: "#EF4444",
      sectionBg: "#FEF2F2",
      sectionBorder: "#FCA5A5",
      sectionTextColor: "#991B1B",
      order: 0,
    };
  if (severity === "warn")
    return {
      bg: "#FFFBEB",
      dot: "#F59E0B",
      badgeBg: "#FFFBEB",
      badgeColor: "#92400E",
      badgeBorder: "#FCD34D",
      label: "⚠️ Attention",
      shortLabel: "Attention",
      sectionTitle: "À surveiller",
      sectionIcon: "error-outline",
      icon: "error-outline",
      iconColor: "#F59E0B",
      sectionBg: "#FFFBEB",
      sectionBorder: "#FCD34D",
      sectionTextColor: "#78350F",
      order: 1,
    };
  // "info" par défaut
  return {
    bg: "#F0FDF4",
    dot: "#22C55E",
    badgeBg: "#F0FDF4",
    badgeColor: "#15803D",
    badgeBorder: "#86EFAC",
    label: "ℹ️ Information",
    shortLabel: "Info",
    sectionTitle: "Informations",
    sectionIcon: "info-outline",
    icon: "info-outline",
    iconColor: "#22C55E",
    sectionBg: "#F0FDF4",
    sectionBorder: "#86EFAC",
    sectionTextColor: "#14532D",
    order: 2,
  };
}

// Ordre d'affichage des sections
const SEVERITY_ORDER = ["danger", "warn", "info"];

const SEVERITY_FILTERS = [
  { key: "all", label: "Toutes", icon: "list" },
  { key: "danger", label: "Critique", icon: "warning" },
  { key: "warn", label: "Attention", icon: "error-outline" },
  { key: "info", label: "Information", icon: "info-outline" },
];

// ── Traductions (modèle Mongoose) ────────────────────────────────────────────
function translateType(type) {
  const map = {
    sensor: "Capteur",
    door: "Porte",
    actuator: "Actionneur",
    mqtt: "Connexion",
  };
  return map[type] || type;
}

function translateParameter(param) {
  const map = {
    temperature: "🌡️ Température",
    humidity: "💧 Humidité",
    co2: "💨 CO₂",
    nh3: "💨 NH₃",
    dust: "💨 Poussière",
    waterLevel: "💧 Niveau d'eau",
  };
  return map[param] || param;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BackButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#F1F5F9",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
      }}
    >
      <Ionicons name="arrow-back" size={22} color="#334155" />
    </TouchableOpacity>
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
        borderWidth: 1,
        borderColor: isSelected ? "#16A34A" : "#E2E8F0",
      }}
    >
      <MaterialIcons
        name="home-work"
        size={15}
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
        {poultry === "all" ? "Tous mes poulaillers" : poultry.name}
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

// ── Section header collapsible par sévérité ──────────────────────────────────
function SeveritySectionHeader({
  severity,
  count,
  unreadCount,
  collapsed,
  onToggle,
}) {
  const s = severityConfig(severity);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: s.sectionBg,
        borderWidth: 1,
        borderColor: s.sectionBorder,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: s.sectionBorder,
          }}
        >
          <MaterialIcons name={s.sectionIcon} size={16} color={s.iconColor} />
        </View>
        <View>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: s.sectionTextColor,
            }}
          >
            {s.sectionTitle}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: s.badgeColor,
              fontWeight: "500",
              marginTop: 1,
            }}
          >
            {count} alerte{count > 1 ? "s" : ""}
            {unreadCount > 0
              ? ` · ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
              : ""}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: s.sectionBorder,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: s.iconColor }}>
            {count}
          </Text>
        </View>
        <MaterialIcons
          name={collapsed ? "keyboard-arrow-down" : "keyboard-arrow-up"}
          size={22}
          color={s.badgeColor}
        />
      </View>
    </TouchableOpacity>
  );
}

function AlertCard({
  alert,
  poultryName,
  onMarkRead,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
}) {
  const s = severityConfig(alert.severity);

  const handlePress = () => {
    if (isSelectMode) {
      onToggleSelect(alert._id);
    } else if (!alert.read) {
      onMarkRead(alert._id);
    }
  };

  const handleLongPress = () => {
    if (!isSelectMode) {
      onToggleSelect(alert._id);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={{
        backgroundColor: isSelected ? "#EFF6FF" : alert.read ? "#fff" : s.bg,
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected
          ? "#3B82F6"
          : alert.read
            ? "#E2E8F0"
            : s.badgeBorder,
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
      {/* Checkbox mode sélection */}
      {isSelectMode && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: isSelected ? "#3B82F6" : "#CBD5E1",
            backgroundColor: isSelected ? "#3B82F6" : "#fff",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 6,
            flexShrink: 0,
          }}
        >
          {isSelected && <MaterialIcons name="check" size={16} color="#fff" />}
        </View>
      )}

      {/* Icône severity */}
      <View
        style={{
          width: 38,
          height: 38,
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
          size={20}
          color={alert.read ? "#CBD5E1" : s.iconColor}
        />
      </View>

      <View style={{ flex: 1 }}>
        {/* Badge + type + heure */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 5,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                backgroundColor: alert.read ? "#F1F5F9" : s.badgeBg,
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: alert.read ? "#E2E8F0" : s.badgeBorder,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: alert.read ? "#94A3B8" : s.badgeColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {s.shortLabel}
              </Text>
            </View>
            {alert.type && (
              <View
                style={{
                  backgroundColor: "#F8FAFC",
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    color: "#64748B",
                    fontWeight: "600",
                  }}
                >
                  {translateType(alert.type)}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 10, color: "#CBD5E1", fontWeight: "500" }}>
            {relativeTime(alert.createdAt)}
          </Text>
        </View>

        {/* Message */}
        <Text
          style={{
            fontSize: 13.5,
            color: alert.read ? "#64748B" : "#1E293B",
            fontWeight: alert.read ? "400" : "600",
            lineHeight: 20,
            marginBottom: 4,
          }}
        >
          {alert.message}
        </Text>

        {/* Valeur capteur (si disponible) */}
        {alert.parameter && alert.value != null && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
              backgroundColor: "#F8FAFC",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 10, color: "#64748B" }}>
              {translateParameter(alert.parameter)} :
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: alert.read ? "#94A3B8" : s.badgeColor,
              }}
            >
              {alert.value}
              {alert.sensorUnit ? ` ${alert.sensorUnit}` : ""}
              {alert.threshold != null && (
                <Text style={{ fontWeight: "400", color: "#94A3B8" }}>
                  {" "}
                  (seuil : {alert.threshold}
                  {alert.sensorUnit ? ` ${alert.sensorUnit}` : ""})
                </Text>
              )}
            </Text>
          </View>
        )}

        {/* Nom du poulailler (vue "Tous") */}
        {poultryName && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <MaterialIcons name="home-work" size={11} color="#94A3B8" />
            <Text
              style={{
                fontSize: 10,
                color: "#94A3B8",
                fontWeight: "500",
              }}
            >
              {poultryName}
            </Text>
          </View>
        )}

        {/* Actions rapides */}
        {!isSelectMode && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: "#F1F5F9",
            }}
          >
            {!alert.read && (
              <TouchableOpacity
                onPress={() => onMarkRead(alert._id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: "#F0FDF4",
                  borderWidth: 1,
                  borderColor: "#BBF7D0",
                }}
              >
                <MaterialIcons name="done" size={13} color="#22C55E" />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: "#15803D",
                  }}
                >
                  Marquer lu
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => onDelete(alert._id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: "#FEF2F2",
                borderWidth: 1,
                borderColor: "#FCA5A5",
              }}
            >
              <MaterialIcons name="delete-outline" size={13} color="#EF4444" />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: "#B91C1C",
                }}
              >
                Supprimer
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 9,
                color: "#CBD5E1",
                fontStyle: "italic",
                marginLeft: "auto",
              }}
            >
              Appui long = sélectionner
            </Text>
          </View>
        )}
      </View>

      {/* Point non lu */}
      {!alert.read && !isSelectMode && (
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

function EmptyState({ filterLabel, type = "empty" }) {
  const messages = {
    empty:
      "Tout va bien ! Aucune alerte en cours.\nTirez vers le bas pour actualiser.",
    filter: `Aucune alerte « ${filterLabel} » pour le moment.`,
    noPoultry:
      "Aucun poulailler lié à votre compte.\nAjoutez-en un pour recevoir les alertes.",
    error: "Impossible de charger les alertes.\nVérifiez votre connexion.",
  };
  const titles = {
    empty: "Aucune alerte",
    filter: "Rien à afficher",
    noPoultry: "Pas de poulailler",
    error: "Problème de connexion",
  };
  const icons = {
    empty: "notifications-none",
    filter: "filter-list",
    noPoultry: "home-work",
    error: "wifi-off",
  };

  return (
    <View
      style={{
        alignItems: "center",
        paddingTop: 50,
        paddingHorizontal: 32,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          borderWidth: 1.5,
          borderColor: "#E2E8F0",
        }}
      >
        <MaterialIcons name={icons[type]} size={34} color="#CBD5E1" />
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "700",
          color: "#334155",
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {titles[type]}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#94A3B8",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {messages[type]}
      </Text>
    </View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 20, gap: 12 }}>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <ActivityIndicator size="small" color="#22C55E" />
        <Text
          style={{
            fontSize: 12,
            color: "#94A3B8",
            marginTop: 8,
            fontWeight: "500",
          }}
        >
          Chargement de vos alertes...
        </Text>
      </View>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            gap: 12,
            padding: 14,
            borderRadius: 14,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#E2E8F0",
            }}
          />
          <View style={{ flex: 1, gap: 8 }}>
            <View
              style={{
                height: 12,
                width: "70%",
                backgroundColor: "#E2E8F0",
                borderRadius: 4,
              }}
            />
            <View
              style={{
                height: 16,
                width: "95%",
                backgroundColor: "#E2E8F0",
                borderRadius: 4,
              }}
            />
            <View
              style={{
                height: 10,
                width: "50%",
                backgroundColor: "#E2E8F0",
                borderRadius: 4,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── SummaryBar : 4 cartes (Non lues / Critique / Attention / Info) ───────────
function SummaryBar({ alerts }) {
  const danger = alerts.filter(
    (a) => a.severity === "danger" && !a.read,
  ).length;
  const warn = alerts.filter((a) => a.severity === "warn" && !a.read).length;
  const info = alerts.filter((a) => a.severity === "info" && !a.read).length;
  const total = alerts.filter((a) => !a.read).length;

  const cards = [
    {
      label: "Non lues",
      value: total,
      icon: "mark-email-unread",
      activeColor: "#3B82F6",
      activeBg: "#EFF6FF",
      activeBorder: "#BFDBFE",
      activeText: "#1D4ED8",
    },
    {
      label: "Critique",
      value: danger,
      icon: "warning",
      activeColor: "#EF4444",
      activeBg: "#FEF2F2",
      activeBorder: "#FCA5A5",
      activeText: "#B91C1C",
    },
    {
      label: "Attention",
      value: warn,
      icon: "error-outline",
      activeColor: "#F59E0B",
      activeBg: "#FFFBEB",
      activeBorder: "#FCD34D",
      activeText: "#92400E",
    },
    {
      label: "Info",
      value: info,
      icon: "info-outline",
      activeColor: "#22C55E",
      activeBg: "#F0FDF4",
      activeBorder: "#86EFAC",
      activeText: "#15803D",
    },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 14,
      }}
    >
      {cards.map((item) => (
        <View
          key={item.label}
          style={{
            flex: 1,
            backgroundColor: item.value > 0 ? item.activeBg : "#F8FAFC",
            borderRadius: 12,
            padding: 10,
            borderWidth: 1,
            borderColor: item.value > 0 ? item.activeBorder : "#E2E8F0",
            alignItems: "center",
          }}
        >
          <MaterialIcons
            name={item.icon}
            size={16}
            color={item.value > 0 ? item.activeColor : "#CBD5E1"}
            style={{ marginBottom: 3 }}
          />
          <Text
            style={{
              fontSize: 9,
              color: item.value > 0 ? item.activeText : "#94A3B8",
              fontWeight: "600",
              marginBottom: 2,
            }}
          >
            {item.label}
          </Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: item.value > 0 ? item.activeColor : "#CBD5E1",
            }}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Barre de sélection multiple ──────────────────────────────────────────────
function SelectionBar({ count, onMarkRead, onDelete, onCancel, onSelectAll }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: "#EFF6FF",
        borderBottomWidth: 1,
        borderBottomColor: "#BFDBFE",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#BFDBFE",
          }}
        >
          <MaterialIcons name="close" size={18} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#1D4ED8" }}>
          {count} sélectionnée{count > 1 ? "s" : ""}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onSelectAll}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#BFDBFE",
          }}
        >
          <MaterialIcons name="select-all" size={14} color="#3B82F6" />
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#1D4ED8" }}>
            Tout
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onMarkRead}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: "#F0FDF4",
            borderWidth: 1,
            borderColor: "#BBF7D0",
          }}
        >
          <MaterialIcons name="done-all" size={14} color="#22C55E" />
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803D" }}>
            Lu
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDelete}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FCA5A5",
          }}
        >
          <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
          <Text style={{ fontSize: 10, fontWeight: "700", color: "#B91C1C" }}>
            Supprimer
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function Notifications() {
  const navigation = useNavigation();
  const {
    poulaillers,
    alerts,
    loading,
    error,
    refreshing,
    fetchData: onRefresh,
    markRead: onMarkRead,
    markAllRead: onMarkAllRead,
    deleteAlert: onDeleteAlert,
    deleteAlerts: onDeleteAlerts,
    deleteAllRead: onDeleteAllRead,
  } = useNotifications();

  const [selectedPoultry, setSelectedPoultry] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedSections, setCollapsedSections] = useState({});
  const isSelectMode = selectedIds.size > 0;

  const toggleSection = useCallback((severity) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [severity]: !prev[severity],
    }));
  }, []);

  // Auto-refresh toutes les 30s
  useEffect(() => {
    const interval = setInterval(() => onRefresh(), 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // ── Lookup ──────────────────────────────────────────────────────────────────
  const poultryById = useMemo(() => {
    const map = {};
    poulaillers.forEach((p) => {
      map[String(p._id)] = p;
    });
    return map;
  }, [poulaillers]);

  const unreadByPoultry = useMemo(() => {
    const map = { all: 0 };
    poulaillers.forEach((p) => {
      map[String(p._id)] = 0;
    });
    alerts.forEach((a) => {
      if (!a.read) {
        map.all += 1;
        const pid = getPoultryId(a);
        if (pid && map[pid] !== undefined) map[pid]++;
      }
    });
    return map;
  }, [alerts, poulaillers]);

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return alerts
      .filter((a) => {
        if (selectedPoultry === "all") return true;
        return getPoultryId(a) === selectedPoultry;
      })
      .filter((a) => severityFilter === "all" || a.severity === severityFilter)
      .filter((a) => !showUnreadOnly || !a.read)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [alerts, selectedPoultry, severityFilter, showUnreadOnly]);

  // ── Groupement par sévérité (danger > warn > info) ──────────────────────────
  const groupedBySeverity = useMemo(() => {
    const groups = {};
    SEVERITY_ORDER.forEach((sev) => {
      groups[sev] = [];
    });

    filtered.forEach((alert) => {
      const sev = SEVERITY_ORDER.includes(alert.severity)
        ? alert.severity
        : "info";
      groups[sev].push(alert);
    });

    return SEVERITY_ORDER.filter((sev) => groups[sev].length > 0).map(
      (sev) => ({
        severity: sev,
        alerts: groups[sev],
        count: groups[sev].length,
        unreadCount: groups[sev].filter((a) => !a.read).length,
      }),
    );
  }, [filtered]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    try {
      await onRefresh();
    } catch {
      Alert.alert("Erreur", "Impossible de rafraîchir.");
    }
  }, [onRefresh]);

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = filtered.filter((a) => !a.read).map((a) => a._id);
    if (!unreadIds.length) return;
    Alert.alert(
      "Tout marquer comme lu ?",
      `${unreadIds.length} alerte${unreadIds.length > 1 ? "s" : ""} concernée${unreadIds.length > 1 ? "s" : ""}.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            try {
              await Promise.all(unreadIds.map((id) => onMarkRead(id)));
              if (onMarkAllRead) await onMarkAllRead(selectedPoultry);
            } catch {
              Alert.alert("Erreur", "Impossible de marquer comme lu");
            }
          },
        },
      ],
    );
  }, [filtered, onMarkRead, onMarkAllRead, selectedPoultry]);

  // Supprimer une seule alerte
  const handleDeleteOne = useCallback(
    (id) => {
      Alert.alert(
        "Supprimer cette alerte ?",
        "Cette action est irréversible.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Supprimer",
            style: "destructive",
            onPress: async () => {
              try {
                if (onDeleteAlert) await onDeleteAlert(id);
                else if (onDeleteAlerts) await onDeleteAlerts([id]);
              } catch {
                Alert.alert("Erreur", "Impossible de supprimer");
              }
            },
          },
        ],
      );
    },
    [onDeleteAlert, onDeleteAlerts],
  );

  // Supprimer toutes les alertes lues
  // Utilise DELETE /api/alerts?poultryId=... via onDeleteAllRead
  const handleDeleteAllRead = useCallback(() => {
    const readIds = filtered.filter((a) => a.read).map((a) => a._id);
    if (!readIds.length) {
      Alert.alert("Info", "Aucune alerte lue à supprimer.");
      return;
    }
    Alert.alert(
      `Supprimer ${readIds.length} alerte${readIds.length > 1 ? "s" : ""} lue${readIds.length > 1 ? "s" : ""} ?`,
      "Seules les alertes déjà lues seront supprimées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              if (onDeleteAllRead) {
                // ✅ Utilise DELETE /api/alerts?poultryId=...
                await onDeleteAllRead(
                  selectedPoultry !== "all" ? selectedPoultry : "all",
                );
              } else if (onDeleteAlerts) {
                await onDeleteAlerts(readIds);
              }
            } catch {
              Alert.alert("Erreur", "Suppression impossible");
            }
          },
        },
      ],
    );
  }, [filtered, onDeleteAllRead, onDeleteAlerts, selectedPoultry]);

  // Mode sélection : toggle
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Mode sélection : tout sélectionner / désélectionner
  const handleSelectAll = useCallback(() => {
    setSelectedIds(
      selectedIds.size === filtered.length
        ? new Set()
        : new Set(filtered.map((a) => a._id)),
    );
  }, [filtered, selectedIds.size]);

  const cancelSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Mode sélection : marquer sélectionnées comme lues
  const handleMarkSelectedRead = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => onMarkRead(id)));
      setSelectedIds(new Set());
    } catch {
      Alert.alert("Erreur", "Impossible de marquer comme lu");
    }
  }, [selectedIds, onMarkRead]);

  // Mode sélection : supprimer sélectionnées
  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    Alert.alert(
      `Supprimer ${ids.length} alerte${ids.length > 1 ? "s" : ""} ?`,
      "Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              if (onDeleteAlerts) await onDeleteAlerts(ids);
              else if (onDeleteAlert)
                await Promise.all(ids.map((id) => onDeleteAlert(id)));
              setSelectedIds(new Set());
            } catch {
              Alert.alert("Erreur", "Suppression impossible");
            }
          },
        },
      ],
    );
  }, [selectedIds, onDeleteAlert, onDeleteAlerts]);

  // Navigation retour (ou annuler sélection)
  const handleGoBack = useCallback(() => {
    if (isSelectMode) {
      cancelSelection();
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, isSelectMode, cancelSelection]);

  const unreadCount = filtered.filter((a) => !a.read).length;
  const readCount = filtered.filter((a) => a.read).length;
  const currentSeverityLabel = SEVERITY_FILTERS.find(
    (f) => f.key === severityFilter,
  )?.label;

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading && !refreshing) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <BackButton onPress={handleGoBack} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#0F172A",
              }}
            >
              Mes alertes
            </Text>
          </View>
        </View>
        <LoadingSkeleton />
      </SafeAreaView>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
        }}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <BackButton onPress={handleGoBack} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#0F172A",
              }}
            >
              Mes alertes
            </Text>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <MaterialIcons name="wifi-off" size={64} color="#F59E0B" />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: "#1E293B",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            Problème de connexion
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#64748B",
              textAlign: "center",
              marginTop: 8,
              lineHeight: 20,
            }}
          >
            {error}
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{
              marginTop: 24,
              paddingHorizontal: 28,
              paddingVertical: 14,
              backgroundColor: "#22C55E",
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <MaterialIcons name="refresh" size={20} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              Réessayer
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#F8FAFC",
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Barre de sélection multiple */}
      {isSelectMode && (
        <SelectionBar
          count={selectedIds.size}
          onMarkRead={handleMarkSelectedRead}
          onDelete={handleDeleteSelected}
          onCancel={cancelSelection}
          onSelectAll={handleSelectAll}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        stickyHeaderIndices={isSelectMode ? [] : [0]}
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
        {/* ── Header sticky ────────────────────────────────────────────────── */}
        {!isSelectMode && (
          <View
            style={{
              backgroundColor: "#F8FAFC",
              paddingTop: 8,
              paddingBottom: 4,
              borderBottomWidth: 1,
              borderBottomColor: "#E2E8F0",
            }}
          >
            {/* Retour + Titre centré + Boutons actions */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingBottom: 12,
              }}
            >
              <BackButton onPress={handleGoBack} />

              {/* Titre centré absolument */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  alignItems: "center",
                  pointerEvents: "none",
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: "#0F172A",
                  }}
                >
                  Mes alertes
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
                    : "✓ Tout est à jour"}
                </Text>
              </View>

              {/* Boutons à droite */}
              <View style={{ flexDirection: "row", gap: 6 }}>
                {/* Voir non lues seulement */}
                <TouchableOpacity
                  onPress={() => setShowUnreadOnly((v) => !v)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: showUnreadOnly ? "#EFF6FF" : "#F1F5F9",
                    borderWidth: 1,
                    borderColor: showUnreadOnly ? "#BFDBFE" : "#E2E8F0",
                  }}
                >
                  <Ionicons
                    name={showUnreadOnly ? "eye-off" : "eye-outline"}
                    size={16}
                    color={showUnreadOnly ? "#3B82F6" : "#64748B"}
                  />
                </TouchableOpacity>

                {/* Tout marquer lu */}
                {unreadCount > 0 && (
                  <TouchableOpacity
                    onPress={handleMarkAllRead}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F0FDF4",
                      borderWidth: 1,
                      borderColor: "#BBF7D0",
                    }}
                  >
                    <MaterialIcons name="done-all" size={16} color="#22C55E" />
                  </TouchableOpacity>
                )}

                {/* Supprimer les lues → DELETE /api/alerts */}
                {readCount > 0 && (
                  <TouchableOpacity
                    onPress={handleDeleteAllRead}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FEF2F2",
                      borderWidth: 1,
                      borderColor: "#FCA5A5",
                    }}
                  >
                    <MaterialIcons
                      name="delete-sweep"
                      size={16}
                      color="#EF4444"
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filtre par poulailler */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 10,
              }}
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
                  isSelected={selectedPoultry === String(p._id)}
                  unreadCount={unreadByPoultry[String(p._id)] || 0}
                  onPress={() => setSelectedPoultry(String(p._id))}
                />
              ))}
            </ScrollView>

            {/* Filtre par sévérité avec compteur */}
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
                const filterCount =
                  f.key === "all"
                    ? filtered.length
                    : filtered.filter((a) => a.severity === f.key).length;

                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setSeverityFilter(f.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
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
                    <MaterialIcons
                      name={f.icon}
                      size={13}
                      color={
                        active ? (cfg ? cfg.iconColor : "#fff") : "#94A3B8"
                      }
                    />
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
                    {filterCount > 0 && (
                      <View
                        style={{
                          backgroundColor: active
                            ? cfg
                              ? cfg.badgeBorder
                              : "rgba(255,255,255,0.3)"
                            : "#F1F5F9",
                          borderRadius: 8,
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          minWidth: 18,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            color: active
                              ? cfg
                                ? cfg.badgeColor
                                : "#fff"
                              : "#94A3B8",
                          }}
                        >
                          {filterCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Résumé 4 cartes ──────────────────────────────────────────────── */}
        <View style={{ paddingTop: 16 }}>
          <SummaryBar alerts={filtered} />
        </View>

        {/* ── Info poulailler sélectionné ──────────────────────────────────── */}
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
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: "#F0FDF4",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="home-work" size={18} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: "#1E293B",
                }}
              >
                {poultryById[selectedPoultry].name}
              </Text>
              {poultryById[selectedPoultry].location && (
                <Text
                  style={{
                    fontSize: 11,
                    color: "#94A3B8",
                    fontWeight: "500",
                  }}
                >
                  📍 {poultryById[selectedPoultry].location}
                </Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: "#F1F5F9",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: "#64748B",
                  fontWeight: "600",
                }}
              >
                {filtered.length} alerte{filtered.length > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        )}

        {/* ── Liste groupée par sévérité ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <EmptyState
            filterLabel={severityFilter !== "all" ? currentSeverityLabel : null}
            type={
              severityFilter !== "all" || showUnreadOnly ? "filter" : "empty"
            }
          />
        ) : (
          <View style={{ paddingBottom: 32 }}>
            {/* Compteur + bouton Sélectionner */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingBottom: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: "#94A3B8",
                  fontWeight: "500",
                }}
              >
                {filtered.length} alerte{filtered.length > 1 ? "s" : ""}{" "}
                affichée{filtered.length > 1 ? "s" : ""}
              </Text>
              {!isSelectMode && (
                <TouchableOpacity
                  onPress={() => {
                    if (filtered.length > 0) toggleSelect(filtered[0]._id);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: "#F1F5F9",
                  }}
                >
                  <MaterialIcons name="checklist" size={12} color="#64748B" />
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#64748B",
                      fontWeight: "600",
                    }}
                  >
                    Sélectionner
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Sections par sévérité : danger → warn → info */}
            {groupedBySeverity.map((group) => {
              const isCollapsed = collapsedSections[group.severity] === true;
              return (
                <View key={group.severity}>
                  {/* Header de section collapsible */}
                  <SeveritySectionHeader
                    severity={group.severity}
                    count={group.count}
                    unreadCount={group.unreadCount}
                    collapsed={isCollapsed}
                    onToggle={() => toggleSection(group.severity)}
                  />

                  {/* Alertes de la section */}
                  {!isCollapsed &&
                    group.alerts.map((alert) => {
                      const pid = getPoultryId(alert);
                      return (
                        <AlertCard
                          key={alert._id}
                          alert={alert}
                          poultryName={
                            selectedPoultry === "all" && pid
                              ? (poultryById[pid]?.name ?? null)
                              : null
                          }
                          onMarkRead={onMarkRead}
                          onDelete={handleDeleteOne}
                          isSelectMode={isSelectMode}
                          isSelected={selectedIds.has(alert._id)}
                          onToggleSelect={toggleSelect}
                        />
                      );
                    })}

                  {/* Message si section fermée */}
                  {isCollapsed && (
                    <View
                      style={{
                        marginHorizontal: 16,
                        marginBottom: 4,
                        paddingVertical: 6,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#94A3B8",
                          fontStyle: "italic",
                        }}
                      >
                        {group.count} alerte
                        {group.count > 1 ? "s" : ""} masquée
                        {group.count > 1 ? "s" : ""} ·{" "}
                        <Text
                          style={{
                            fontWeight: "600",
                            fontStyle: "normal",
                          }}
                        >
                          Appuyez pour afficher
                        </Text>
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
