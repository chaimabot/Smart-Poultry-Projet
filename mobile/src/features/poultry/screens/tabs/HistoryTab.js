import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

// ─── Détection du vrai type d'actionneur ─────────────────────────────────────
// Le backend envoie parfois type: "actuator" avec le nom dans le message.
// On détecte donc via type ET message.
function detectActuatorKind(alert) {
  const msg = (alert.message || "").toLowerCase();
  const type = (alert.type || "").toLowerCase();

  if (type === "fan" || msg.includes("ventilateur")) return "fan";
  if (type === "lamp" || msg.includes("lampe") || msg.includes("chauffante"))
    return "lamp";
  if (type === "door" || msg.includes("door")) return "door";
  return "other";
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getIcon(alert) {
  if (isSensor(alert)) {
    const map = {
      temperature: "thermostat",
      humidity: "water-drop",
      co2: "co2",
      nh3: "warning",
      dust: "grain",
      water_level: "water",
    };
    return map[alert.type] || "sensors";
  }
  const kind = detectActuatorKind(alert);
  const map = { fan: "cyclone", lamp: "lightbulb", door: "door-front" };
  return map[kind] || "notifications";
}

function alertTitle(alert) {
  if (isSensor(alert)) {
    const labels = {
      temperature: "Température",
      humidity: "Humidité",
      co2: "CO2",
      nh3: "NH3",
      dust: "Poussière",
      water_level: "Niveau eau",
    };
    return `Seuil de ${labels[alert.type] || alert.type} dépassé`;
  }
  const kind = detectActuatorKind(alert);
  const labels = { fan: "Ventilateur", lamp: "Lampe", door: "Porte" };
  const name = labels[kind] || "Actionneur";
  if (alert.auto) return `${name} activé automatiquement`;
  return name;
}

function alertConfig(alert) {
  if (isSensor(alert)) {
    const danger = alert.severity === "danger";
    return {
      iconBg: danger ? "#FEF2F2" : "#FFFBEB",
      iconColor: danger ? "#EF4444" : "#F59E0B",
      borderColor: danger ? "#EF444420" : "#F59E0B20",
      tag: "Seuil dépassé",
      tagBg: danger ? "#FEF2F2" : "#FFFBEB",
      tagColor: danger ? "#EF4444" : "#F59E0B",
    };
  }
  if (alert.auto) {
    return {
      iconBg: "#F0FDF4",
      iconColor: "#16A34A",
      borderColor: "#22C55E20",
      tag: "Réponse auto",
      tagBg: "#F0FDF4",
      tagColor: "#16A34A",
    };
  }
  return {
    iconBg: "#EFF6FF",
    iconColor: "#3B82F6",
    borderColor: "#3B82F620",
    tag: "Action",
    tagBg: "#EFF6FF",
    tagColor: "#3B82F6",
  };
}

// ─── Carte d'alerte ───────────────────────────────────────────────────────────
function AlertCard({ alert }) {
  const cfg = alertConfig(alert);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: cfg.borderColor,
        padding: 14,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: cfg.iconBg,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <MaterialIcons name={getIcon(alert)} size={20} color={cfg.iconColor} />
      </View>

      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 3,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: "#1E293B",
              flex: 1,
              paddingRight: 8,
            }}
          >
            {alertTitle(alert)}
          </Text>
          <Text style={{ fontSize: 12, color: "#94A3B8", flexShrink: 0 }}>
            {formatTime(alert.timestamp)}
          </Text>
        </View>

        <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 18 }}>
          {alert.message}
        </Text>

        <View
          style={{
            backgroundColor: cfg.tagBg,
            borderRadius: 20,
            paddingHorizontal: 8,
            paddingVertical: 2,
            alignSelf: "flex-start",
            marginTop: 7,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: cfg.tagColor,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {cfg.tag}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Filtres ──────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: "all", label: "Toutes", icon: "list" },
  { key: "fan", label: "Ventilateur", icon: "cyclone" },
  { key: "lamp", label: "Lampe", icon: "lightbulb" },
  { key: "door", label: "Porte", icon: "door-front" },
];

function matchesFilter(alert, filterKey) {
  if (filterKey === "all") return true;
  if (isSensor(alert)) return false; // les capteurs ne matchent pas les filtres actionneur
  return detectActuatorKind(alert) === filterKey;
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function HistoryTab({
  alerts,
  onRefresh,
  refreshing,
  navigation,
  poultryId,
  poultryName,
}) {
  const [filter, setFilter] = useState("all");

  const filteredAlerts = alerts
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

          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 20,
                backgroundColor: active ? "#1E293B" : "#F8FAFC",
                borderWidth: 1,
                borderColor: active ? "#1E293B" : "#F1F5F9",
              }}
            >
              <MaterialIcons
                name={f.icon}
                size={14}
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
              {count > 0 && (
                <View
                  style={{
                    backgroundColor: active
                      ? "rgba(255,255,255,0.2)"
                      : "#F1F5F9",
                    borderRadius: 10,
                    paddingHorizontal: 6,
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
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Liste ── */}
      {filteredAlerts.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
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
            <MaterialIcons
              name="notifications-none"
              size={32}
              color="#CBD5E1"
            />
          </View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>
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
            Aucune alerte correspondant à ce filtre.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {filteredAlerts.map((alert, idx) => (
            <AlertCard key={alert._id || idx} alert={alert} />
          ))}
        </View>
      )}

      {/* ── Paramètres ── */}
      {alerts.length > 0 && (
        <TouchableOpacity
          onPress={() =>
            navigation.navigate("AlertSettingsScreen", {
              poultryId,
              poultryName,
            })
          }
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#F1F5F9",
          }}
        >
          <MaterialIcons name="settings" size={16} color="#64748B" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748B" }}>
            Gérer les paramètres d'alertes
          </Text>
          <MaterialIcons name="arrow-forward" size={15} color="#94A3B8" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
