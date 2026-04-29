// ─────────────────────────────────────────────────────────────
// OverviewTab.js
// ─────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const STATUS_COLORS = { normal: "#639922", warn: "#BA7517", danger: "#A32D2D" };
const STATUS_BG = { normal: "#EAF3DE", warn: "#FAEEDA", danger: "#FCEBEB" };
const STATUS_LABEL = { normal: "OK", warn: "Attention", danger: "Danger" };

// Message d'action affiché à l'éleveur selon le capteur et le niveau
const ACTIONS = {
  temperature: {
    warn: "Surveiller — température légèrement hors plage",
    danger: "Agir vite : ouvrir les ventilateurs",
  },
  humidity: {
    warn: "Vérifier la litière",
    danger: "Changer la litière et aérer le poulailler",
  },
  co2: {
    warn: "Augmenter la ventilation",
    danger: "Ventiler d'urgence — risque pour les animaux",
  },
  nh3: {
    warn: "Vérifier la litière et la ventilation",
    danger: "Nettoyer immédiatement — danger sanitaire",
  },
  dust: {
    warn: "Contrôler la ventilation",
    danger: "Ventiler d'urgence — qualité de l'air critique",
  },
  waterLevel: {
    warn: "Vérifier l'abreuvoir",
    danger: "Remplir l'eau immédiatement",
  },
};

export default function OverviewTab({
  refreshing,
  onRefresh,
  sensors,
  thresholds,
}) {
  const alertSensors = sensors.filter(
    (s) => s.status === "danger" || s.status === "warn",
  );
  const dangerSensors = sensors.filter((s) => s.status === "danger");

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
          tintColor="#639922"
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Bannière danger globale ── */}
      {dangerSensors.length > 0 && (
        <View
          style={[
            alertBanner,
            { borderLeftColor: "#A32D2D", backgroundColor: "#FCEBEB" },
          ]}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#E24B4A",
              marginTop: 4,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#A32D2D" }}>
              Danger — {dangerSensors.map((s) => s.name).join(", ")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#A32D2D",
                marginTop: 2,
                opacity: 0.85,
              }}
            >
              Voir les instructions ci-dessous et agir immédiatement.
            </Text>
          </View>
        </View>
      )}

      {/* ── Capteurs temps réel ── */}
      <SectionLabel>Capteurs temps réel</SectionLabel>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {sensors.map((sensor, i) => {
          const col = STATUS_COLORS[sensor.status] || STATUS_COLORS.normal;
          const bg = STATUS_BG[sensor.status] || STATUS_BG.normal;
          const label = STATUS_LABEL[sensor.status] || "OK";
          const isAlert =
            sensor.status === "warn" || sensor.status === "danger";
          const action = ACTIONS[sensor.key]?.[sensor.status];
          const threshold = thresholds?.[sensor.key];

          return (
            <View key={i} style={[card, { flexBasis: "47%", flexGrow: 1 }]}>
              {/* En-tête icône + badge */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name={sensor.icon} size={18} color={col} />
                </View>
                <View
                  style={{
                    backgroundColor: bg,
                    borderRadius: 20,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "600", color: col }}>
                    {label}
                  </Text>
                </View>
              </View>

              {/* Valeur */}
              <View
                style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}
              >
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: "600",
                    color: isAlert ? col : "#1E293B",
                    lineHeight: 30,
                  }}
                >
                  {sensor.value}
                </Text>
                <Text
                  style={{ fontSize: 12, color: "#94A3B8", marginBottom: 2 }}
                >
                  {sensor.unit}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: "#94A3B8",
                  marginTop: 4,
                  marginBottom: isAlert ? 8 : 0,
                }}
              >
                {sensor.name}
              </Text>

              {/* Bloc alerte : seuil dépassé + action conseillée */}
              {isAlert && (
                <View
                  style={{
                    backgroundColor: bg,
                    borderLeftWidth: 3,
                    borderLeftColor: col,
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  {threshold && (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: col,
                        marginBottom: 2,
                      }}
                    >
                      {sensor.status === "warn"
                        ? `Seuil dépassé (${threshold.warn}${sensor.unit})`
                        : `Niveau critique (${threshold.danger}${sensor.unit})`}
                    </Text>
                  )}
                  {action && (
                    <Text style={{ fontSize: 11, color: "#64748B" }}>
                      → {action}
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SectionLabel({ children }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: "#94A3B8",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}

const card = {
  backgroundColor: "#fff",
  borderRadius: 16,
  padding: 16,
  borderWidth: 1,
  borderColor: "#F1F5F9",
  elevation: 2,
};

const alertBanner = {
  borderLeftWidth: 4,
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
};
