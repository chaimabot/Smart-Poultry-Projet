// tabs/HistoryTab.js
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
  const sensorTypes = [
    "temperature",
    "humidity",
    "co2",
    "nh3",
    "dust",
    "water_level",
  ];
  return sensorTypes.includes((alert.type || "").toLowerCase());
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
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  if (isToday) {
    return (
      "Aujourd'hui à " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    );
  }
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
    " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── Textes lisibles pour l'éleveur ──────────────────────────────────────────

const SENSOR_LABELS = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "Qualité de l'air (CO2)",
  nh3: "Gaz ammoniaque (NH3)",
  dust: "Poussière dans l'air",
  water_level: "Niveau d'eau",
};

const SENSOR_ICONS = {
  temperature: "thermostat",
  humidity: "water-drop",
  co2: "co2",
  nh3: "warning",
  dust: "grain",
  water_level: "water",
};

const ACTUATOR_LABELS = {
  fan: "Ventilateur",
  lamp: "Lampe",
  door: "Porte",
  pump: "Pompe",
  other: "Équipement",
};

const ACTUATOR_ICONS = {
  fan: "air",
  lamp: "lightbulb",
  door: "sensor-door",
  pump: "water",
  other: "settings",
};

// Explications lisibles selon le type d'événement
function getEventTitle(alert) {
  if (isSensor(alert)) {
    const label = SENSOR_LABELS[alert.type] || alert.type;
    const danger = alert.severity === "danger";
    return danger
      ? `⚠ ${label} à un niveau dangereux`
      : `${label} hors de la plage normale`;
  }
  const kind = detectActuatorKind(alert);
  const label = ACTUATOR_LABELS[kind] || "Équipement";
  if (alert.auto) return `${label} activé automatiquement`;
  return `${label} commandé manuellement`;
}

function getEventDescription(alert) {
  // Utilise le message brut s'il est lisible, sinon construit un message clair
  if (alert.message && alert.message.length > 0) return alert.message;

  if (isSensor(alert)) {
    return "Le capteur a détecté une valeur anormale. Vérifiez le poulailler.";
  }
  const kind = detectActuatorKind(alert);
  if (kind === "fan")
    return alert.auto
      ? "Le ventilateur s'est déclenché pour corriger la température ou l'humidité."
      : "Vous avez allumé ou éteint le ventilateur.";
  if (kind === "lamp")
    return alert.auto
      ? "La lampe s'est allumée automatiquement selon le programme."
      : "Vous avez allumé ou éteint la lampe.";
  if (kind === "door")
    return alert.auto
      ? "La porte s'est ouverte ou fermée automatiquement."
      : "Vous avez commandé la porte.";
  if (kind === "pump")
    return alert.auto
      ? "La pompe s'est activée automatiquement pour remplir l'eau."
      : "Vous avez activé ou arrêté la pompe.";
  return "Action enregistrée.";
}

// ─── Config visuelle par type d'événement ────────────────────────────────────

function getCardStyle(alert) {
  if (isSensor(alert)) {
    const danger = alert.severity === "danger";
    return {
      accentColor: danger ? "#A32D2D" : "#854F0B",
      accentBg: danger ? "#FCEBEB" : "#FAEEDA",
      borderColor: danger ? "#F09595" : "#FAC775",
      tagLabel: danger ? "Niveau critique" : "Valeur anormale",
      tagColor: danger ? "#A32D2D" : "#854F0B",
      tagBg: danger ? "#FCEBEB" : "#FAEEDA",
    };
  }
  if (alert.auto) {
    return {
      accentColor: "#0F6E56",
      accentBg: "#E1F5EE",
      borderColor: "#9FE1CB",
      tagLabel: "Automatique",
      tagColor: "#0F6E56",
      tagBg: "#E1F5EE",
    };
  }
  return {
    accentColor: "#185FA5",
    accentBg: "#E6F1FB",
    borderColor: "#B5D4F4",
    tagLabel: "Manuel",
    tagColor: "#185FA5",
    tagBg: "#E6F1FB",
  };
}

function getIcon(alert) {
  if (isSensor(alert)) return SENSOR_ICONS[alert.type] || "sensors";
  return ACTUATOR_ICONS[detectActuatorKind(alert)] || "notifications";
}

// ─── Carte événement ──────────────────────────────────────────────────────────

function EventCard({ alert }) {
  const style = getCardStyle(alert);
  const unread = !alert.read;

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: style.borderColor,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        gap: 12,
        // Point bleu pour non-lu
        ...(unread
          ? { borderLeftWidth: 3, borderLeftColor: style.accentColor }
          : {}),
      }}
    >
      {/* Icône */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          backgroundColor: style.accentBg,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <MaterialIcons
          name={getIcon(alert)}
          size={22}
          color={style.accentColor}
        />
      </View>

      {/* Contenu */}
      <View style={{ flex: 1 }}>
        {/* Titre + heure */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: "#1E293B",
              flex: 1,
              paddingRight: 8,
              lineHeight: 18,
            }}
          >
            {getEventTitle(alert)}
          </Text>
          {unread && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: style.accentColor,
                marginTop: 4,
                flexShrink: 0,
              }}
            />
          )}
        </View>

        {/* Description claire */}
        <Text
          style={{
            fontSize: 12,
            color: "#475569",
            lineHeight: 18,
            marginBottom: 8,
          }}
        >
          {getEventDescription(alert)}
        </Text>

        {/* Bas de carte : tag + heure */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: style.tagBg,
              borderRadius: 20,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: style.tagColor,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {style.tagLabel}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: "#94A3B8" }}>
            {formatTime(alert.timestamp)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Filtres ──────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "Tout", icon: "list" },
  { key: "sensor", label: "Capteurs", icon: "sensors" },
  { key: "fan", label: "Ventilateur", icon: "air" },
  { key: "lamp", label: "Lampe", icon: "lightbulb" },
  { key: "door", label: "Porte", icon: "sensor-door" },
  { key: "pump", label: "Pompe", icon: "water" },
];

function matchesFilter(alert, key) {
  if (key === "all") return true;
  if (key === "sensor") return isSensor(alert);
  if (isSensor(alert)) return false;
  return detectActuatorKind(alert) === key;
}

// ─── Composant principal ──────────────────────────────────────────────────────

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
      contentContainerStyle={{
        paddingTop: 20,
        paddingBottom: 40,
        paddingHorizontal: 16,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#22C55E"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── En-tête ── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
            Historique des événements
          </Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
            {alerts.length === 0
              ? "Aucun événement enregistré"
              : `${alerts.length} événement${alerts.length > 1 ? "s" : ""} au total`}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={onMarkAllRead}
            style={{
              backgroundColor: "#F0FDF4",
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: "#BBF7D0",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#15803D" }}>
              Tout marquer lu ({unreadCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filtres ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 8, paddingRight: 4 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === "all"
              ? alerts.length
              : alerts.filter((a) => matchesFilter(a, f.key)).length;
          if (f.key !== "all" && count === 0) return null; // cache les filtres vides
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: active ? "#1E293B" : "#F8FAFC",
                borderWidth: 1,
                borderColor: active ? "#1E293B" : "#E2E8F0",
              }}
            >
              <MaterialIcons
                name={f.icon}
                size={13}
                color={active ? "#fff" : "#64748B"}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: active ? "#fff" : "#64748B",
                }}
              >
                {f.label}
              </Text>
              <View
                style={{
                  backgroundColor: active ? "rgba(255,255,255,0.2)" : "#E2E8F0",
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: active ? "#fff" : "#64748B",
                  }}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Liste ── */}
      {filtered.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60, gap: 10 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: "#F8FAFC",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="history" size={30} color="#CBD5E1" />
          </View>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
            Aucun événement ici
          </Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
            Tirez vers le bas pour actualiser.
          </Text>
        </View>
      ) : (
        <View>
          {filtered.map((alert, idx) => (
            <EventCard key={alert._id || idx} alert={alert} />
          ))}
        </View>
      )}

      {/* ── Bouton paramètres ── */}
      {alerts.length > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("AlertSettingsScreen", {
              poultryId,
              poultryName,
            })
          }
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <MaterialIcons name="tune" size={16} color="#64748B" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748B" }}>
            Modifier les seuils d'alerte
          </Text>
          <MaterialIcons name="chevron-right" size={17} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
