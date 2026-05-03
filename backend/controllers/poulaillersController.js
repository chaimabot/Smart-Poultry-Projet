import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSensor(alert) {
  return [
    "temperature",
    "humidity",
    "co2",
    "nh3",
    "dust",
    "water_level",
  ].includes(alert.type);
}

function detectActuatorKind(alert) {
  const msg = (alert.message || "").toLowerCase();
  const type = (alert.type || "").toLowerCase();
  if (type === "fan" || msg.includes("ventilateur")) return "fan";
  if (type === "lamp" || msg.includes("lampe")) return "lamp";
  if (type === "door" || msg.includes("porte")) return "door";
  if (type === "pump" || msg.includes("pompe")) return "pump";
  return "other";
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Textes simplifiés ────────────────────────────────────────────────────────
const SENSOR_LABELS = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  dust: "Poussière",
  water_level: "Niveau d'eau",
};

const ACTUATOR_LABELS = {
  fan: "Ventilateur",
  lamp: "Lampe",
  door: "Porte",
  pump: "Pompe",
};

// Génère un message clair et concis
function getEventMessage(alert) {
  if (isSensor(alert)) {
    const label = SENSOR_LABELS[alert.type] || alert.type;
    const severity = alert.severity === "danger" ? "CRITIQUE" : "ATTENTION";
    const value = alert.value ? ` (${alert.value}${getUnit(alert.type)})` : "";
    return `Alerte : ${label} trop ${alert.direction === "above" ? "élevée" : "basse"}${value}`;
  }

  const kind = detectActuatorKind(alert);
  const label = ACTUATOR_LABELS[kind] || "Équipement";
  const action = alert.state === "on" ? "démarré" : "arrêté";
  const mode = alert.auto ? "automatiquement" : "manuellement";
  const reason = getReason(alert);

  if (kind === "door") {
    const doorAction = alert.state === "open" ? "ouverte" : "fermée";
    return `Action : Porte ${doorAction} ${mode}${reason ? ` (${reason})` : ""}`;
  }

  return `Action : ${label} ${action} ${mode}${reason ? ` (${reason})` : ""}`;
}

function getReason(alert) {
  if (!alert.message) return "";

  const msg = alert.message.toLowerCase();
  if (msg.includes("humidité")) return "humidité anormale";
  if (msg.includes("température")) return "température anormale";
  if (msg.includes("co₂") || msg.includes("co2"))
    return "qualité de l'air dégradée";
  if (msg.includes("nh₃") || msg.includes("nh3")) return "gaz toxique détecté";
  if (msg.includes("poussière")) return "poussière excessive";
  if (msg.includes("niveau d'eau")) return "niveau d'eau bas";
  return "";
}

function getUnit(type) {
  const units = {
    temperature: "°C",
    humidity: "%",
    co2: "ppm",
    nh3: "ppm",
    dust: "µg/m³",
    water_level: "%",
  };
  return units[type] || "";
}

// ─── Config visuelle ────────────────────────────────────────────────────────
function getCardStyle(alert) {
  if (isSensor(alert)) {
    return {
      icon: "warning",
      color: alert.severity === "danger" ? "#DC2626" : "#D97706",
      bgColor: alert.severity === "danger" ? "#FEE2E2" : "#FEF3C7",
      borderColor: alert.severity === "danger" ? "#FCA5A5" : "#FDE68A",
    };
  }
  return {
    icon: "settings",
    color: "#059669",
    bgColor: "#D1FAE5",
    borderColor: "#6EE7B7",
  };
}

// ─── Carte événement simplifiée ───────────────────────────────────────────────
function EventCard({ alert }) {
  const style = getCardStyle(alert);
  const unread = !alert.read;

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: style.borderColor,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        gap: 12,
      }}
    >
      {/* Icône */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: style.bgColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={style.icon} size={18} color={style.color} />
      </View>

      {/* Contenu */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: "#1E293B",
            lineHeight: 18,
          }}
        >
          {getEventMessage(alert)}
        </Text>

        {/* Heure */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 6,
          }}
        >
          <Text style={{ fontSize: 11, color: "#64748B" }}>
            {formatTime(alert.timestamp)}
          </Text>
          {unread && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: style.color,
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Filtres ────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: "all", label: "Tout", icon: "list" },
  { key: "sensor", label: "Alertes", icon: "warning" },
  { key: "fan", label: "Ventilateur", icon: "air" },
  { key: "lamp", label: "Lampe", icon: "lightbulb" },
  { key: "door", label: "Porte", icon: "door-sliding" },
  { key: "pump", label: "Pompe", icon: "water" },
];

function matchesFilter(alert, key) {
  if (key === "all") return true;
  if (key === "sensor") return isSensor(alert);
  return detectActuatorKind(alert) === key;
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function HistoryTab({
  alerts = [],
  onRefresh,
  refreshing,
  navigation,
  poultryId,
  poultryName,
  onMarkAllRead,
}) {
  const [filter, setFilter] = useState("all");
  const unreadCount = alerts.filter((a) => !a.read).length;

  const filtered = [...alerts]
    .filter((a) => matchesFilter(a, filter))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#22C55E"
        />
      }
    >
      {/* En-tête */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>
          Historique
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={onMarkAllRead}
            style={{
              marginTop: 12,
              backgroundColor: "#F0FDF4",
              padding: 10,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#15803D", fontWeight: "600" }}>
              Marquer tout comme lu ({unreadCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filtres */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === "all"
              ? alerts.length
              : alerts.filter((a) => matchesFilter(a, f.key)).length;

          if (f.key !== "all" && count === 0) return null;

          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: active ? "#1E293B" : "#F3F4F6",
              }}
            >
              <MaterialIcons
                name={f.icon}
                size={16}
                color={active ? "#fff" : "#4B5563"}
              />
              <Text
                style={{
                  color: active ? "#fff" : "#4B5563",
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {f.label} {count > 0 && `(${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Liste des événements */}
      {filtered.length === 0 ? (
        <View style={{ alignItems: "center", padding: 40 }}>
          <MaterialIcons name="history" size={48} color="#CBD5E1" />
          <Text style={{ marginTop: 12, color: "#6B7280", fontSize: 14 }}>
            Aucun événement trouvé
          </Text>
        </View>
      ) : (
        filtered.map((alert) => (
          <EventCard key={alert._id || alert.timestamp} alert={alert} />
        ))
      )}

      {/* Bouton Paramètres */}
      {alerts.length > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("AlertSettingsScreen", {
              poultryId,
              poultryName,
            })
          }
          style={{
            marginTop: 20,
            padding: 14,
            backgroundColor: "#F3F4F6",
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#374151", fontWeight: "600" }}>
            Modifier les seuils d'alerte
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
