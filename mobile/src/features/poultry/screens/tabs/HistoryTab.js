import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { getPoulaillerCommands } from "../../../../services/poultry.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return formatTime(ts);
}

// ─── Config visuelle des actionneurs ─────────────────────────────────────────

const ACTUATOR_CONFIG = {
  ventilateur: {
    label: "Ventilateur",
    icon: "air",
    color: "#0EA5E9",
    bgColor: "#E0F2FE",
    borderColor: "#BAE6FD",
  },
  lampe: {
    label: "Lampe chauffante",
    icon: "lightbulb",
    color: "#F59E0B",
    bgColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  porte: {
    label: "Porte automatique",
    icon: "door-sliding",
    color: "#8B5CF6",
    bgColor: "#EDE9FE",
    borderColor: "#DDD6FE",
  },
  pompe: {
    label: "Pompe à eau",
    icon: "water",
    color: "#06B6D4",
    bgColor: "#CFFAFE",
    borderColor: "#A5F3FC",
  },
};

// ─── Config visuelle des alertes capteurs ────────────────────────────────────

const SENSOR_CONFIG = {
  temperature: { label: "Température", icon: "thermostat", unit: "°C" },
  humidity: { label: "Humidité", icon: "water-drop", unit: "%" },
  co2: { label: "CO₂", icon: "co2", unit: "ppm" },
  nh3: { label: "NH₃", icon: "warning", unit: "ppm" },
  dust: { label: "Poussière", icon: "blur-on", unit: "µg/m³" },
  water_level: { label: "Niveau d'eau", icon: "waves", unit: "%" },
};

const SENSOR_TYPES = Object.keys(SENSOR_CONFIG);

function isSensorAlert(item) {
  return item._type === "alert" && SENSOR_TYPES.includes(item.type);
}

// ─── Messages lisibles ───────────────────────────────────────────────────────

function getCommandMessage(cmd) {
  const cfg = ACTUATOR_CONFIG[cmd.typeActionneur] || {
    label: cmd.typeActionneur,
  };
  const isAuto = cmd.issuedBy === "system" || cmd.issuedBy === "automated-rule";
  const mode = isAuto ? "automatiquement" : "manuellement";

  // Actions selon type
  const actionMap = {
    on: "démarré",
    off: "arrêté",
    demarrer: "démarré",
    arreter: "arrêté",
    ouvrir: "ouvert",
    fermer: "fermé",
    stop: "arrêté",
  };
  const actionLabel =
    actionMap[cmd.action?.toLowerCase()] || cmd.action || "commandé";

  // Raison automatique
  let reason = "";
  if (isAuto && cmd.reason) {
    reason = ` — ${cmd.reason}`;
  } else if (isAuto) {
    // Essayer de deviner la raison depuis le contexte
    if (cmd.typeActionneur === "ventilateur" && cmd.action === "on") {
      reason = " — température ou humidité élevée";
    } else if (cmd.typeActionneur === "ventilateur" && cmd.action === "off") {
      reason = " — conditions revenues à la normale";
    } else if (cmd.typeActionneur === "lampe" && cmd.action === "on") {
      reason = " — température trop basse";
    } else if (cmd.typeActionneur === "lampe" && cmd.action === "off") {
      reason = " — température normale";
    } else if (cmd.typeActionneur === "pompe" && cmd.action === "on") {
      reason = " — niveau d'eau bas";
    }
  }

  return `${cfg.label} ${actionLabel} ${mode}${reason}`;
}

function getSensorMessage(alert) {
  const cfg = SENSOR_CONFIG[alert.type] || { label: alert.type, unit: "" };
  const direction = alert.direction === "above" ? "trop élevée" : "trop basse";
  const value = alert.value != null ? ` (${alert.value}${cfg.unit})` : "";
  const threshold =
    alert.threshold != null ? `, seuil : ${alert.threshold}${cfg.unit}` : "";
  return `${cfg.label} ${direction}${value}${threshold}`;
}

// ─── Carte Commande actionneur ───────────────────────────────────────────────

function CommandCard({ cmd }) {
  const cfg = ACTUATOR_CONFIG[cmd.typeActionneur] || {
    label: cmd.typeActionneur,
    icon: "settings",
    color: "#64748B",
    bgColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  };

  const isAuto = cmd.issuedBy === "system" || cmd.issuedBy === "automated-rule";
  const issuedByLabel = isAuto
    ? "Automatique"
    : cmd.issuedBy?.firstName
      ? `${cmd.issuedBy.firstName} ${cmd.issuedBy.lastName}`
      : "Manuel";

  const statusColor =
    {
      executed: "#22C55E",
      sent: "#F59E0B",
      pending: "#94A3B8",
      failed: "#EF4444",
    }[cmd.status] || "#94A3B8";

  const statusLabel =
    {
      executed: "Exécuté",
      sent: "Envoyé",
      pending: "En attente",
      failed: "Échec",
    }[cmd.status] || cmd.status;

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: cfg.borderColor,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        gap: 12,
      }}
    >
      {/* Icône actionneur */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: cfg.bgColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={cfg.icon} size={20} color={cfg.color} />
      </View>

      {/* Contenu */}
      <View style={{ flex: 1 }}>
        {/* Message principal */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: "#1E293B",
            lineHeight: 19,
          }}
        >
          {getCommandMessage(cmd)}
        </Text>

        {/* Badges + heure */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 7,
            flexWrap: "wrap",
          }}
        >
          {/* Badge Auto / Manuel */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: isAuto ? "#EFF6FF" : "#F0FDF4",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <MaterialIcons
              name={isAuto ? "smart-toy" : "person"}
              size={11}
              color={isAuto ? "#3B82F6" : "#22C55E"}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: isAuto ? "#3B82F6" : "#22C55E",
              }}
            >
              {issuedByLabel}
            </Text>
          </View>

          {/* Badge statut */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#F8FAFC",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: statusColor,
              }}
            />
            <Text
              style={{ fontSize: 10, fontWeight: "600", color: statusColor }}
            >
              {statusLabel}
            </Text>
          </View>

          {/* Heure */}
          <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>
            {timeAgo(cmd.issuedAt || cmd.createdAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Carte Alerte capteur ────────────────────────────────────────────────────

function AlertCard({ alert }) {
  const isDanger = alert.severity === "danger";
  const cfg = SENSOR_CONFIG[alert.type] || {
    label: alert.type,
    icon: "warning",
    unit: "",
  };

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isDanger ? "#FCA5A5" : "#FDE68A",
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        gap: 12,
      }}
    >
      {/* Icône */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDanger ? "#FEE2E2" : "#FEF3C7",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons
          name={cfg.icon}
          size={20}
          color={isDanger ? "#DC2626" : "#D97706"}
        />
      </View>

      {/* Contenu */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: "#1E293B",
            lineHeight: 19,
          }}
        >
          {getSensorMessage(alert)}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 7,
          }}
        >
          {/* Badge sévérité */}
          <View
            style={{
              backgroundColor: isDanger ? "#FEE2E2" : "#FEF3C7",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: isDanger ? "#DC2626" : "#D97706",
              }}
            >
              {isDanger ? "DANGER" : "ATTENTION"}
            </Text>
          </View>

          {/* Heure */}
          <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>
            {timeAgo(alert.timestamp)}
          </Text>

          {/* Point non lu */}
          {!alert.read && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: isDanger ? "#DC2626" : "#D97706",
              }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "Tout", icon: "list" },
  { key: "ventilateur", label: "Ventilateur", icon: "air" },
  { key: "lampe", label: "Lampe", icon: "lightbulb" },
  { key: "porte", label: "Porte", icon: "door-sliding" },
  { key: "pompe", label: "Pompe", icon: "water" },
];

function matchesFilter(item, key) {
  if (key === "all") return true;
  if (item._type === "command") return item.typeActionneur === key;
  return false;
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
  const [commands, setCommands] = useState([]);
  const [loadingCmds, setLoadingCmds] = useState(false);

  // ── Fetch commandes ──
  const fetchCommands = useCallback(async () => {
    if (!poultryId) return;
    setLoadingCmds(true);
    try {
      const { data } = await getPoulaillerCommands(poultryId);
      setCommands(data || []);
    } catch (error) {
      console.error("[HistoryTab] Commands fetch error:", error);
    } finally {
      setLoadingCmds(false);
    }
  }, [poultryId]);

  useEffect(() => {
    fetchCommands();
  }, [fetchCommands]);

  const handleRefresh = useCallback(async () => {
    onRefresh?.();
    await fetchCommands();
  }, [onRefresh, fetchCommands]);

  // ── Fusion alertes + commandes → timeline unifiée ──
  const timeline = commands
    .map((c) => ({
      ...c,
      _type: "command",
      _ts: new Date(c.issuedAt || c.createdAt),
    }))
    .filter((item) => matchesFilter(item, filter))
    .sort((a, b) => b._ts - a._ts);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing || loadingCmds}
          onRefresh={handleRefresh}
          tintColor="#22C55E"
        />
      }
    >
      {/* ── En-tête ── */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>
          Historique
        </Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
          {timeline.length} événement{timeline.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* ── Filtres ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? commands.length
              : commands.filter((c) => c.typeActionneur === f.key).length;

          if (f.key !== "all" && count === 0) return null;

          const active = filter === f.key;
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
                size={15}
                color={active ? "#fff" : "#4B5563"}
              />
              <Text
                style={{
                  color: active ? "#fff" : "#4B5563",
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {f.label}
                {count > 0 ? ` (${count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Timeline ── */}
      {timeline.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 48 }}>
          <MaterialIcons name="history" size={52} color="#CBD5E1" />
          <Text
            style={{
              marginTop: 14,
              color: "#94A3B8",
              fontSize: 14,
              fontWeight: "500",
            }}
          >
            Aucun événement trouvé
          </Text>
        </View>
      ) : (
        timeline.map((item) =>
          item._type === "command" ? (
            <CommandCard key={`cmd-${item._id}`} cmd={item} />
          ) : (
            <AlertCard
              key={`alert-${item._id || item.timestamp}`}
              alert={item}
            />
          ),
        )
      )}

      {/* ── Lien seuils ── */}
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
          <Text style={{ color: "#374151", fontWeight: "600", fontSize: 13 }}>
            ⚙ Modifier les seuils d'alerte
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
