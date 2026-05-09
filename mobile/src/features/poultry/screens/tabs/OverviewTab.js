// ─────────────────────────────────────────────────────────────
// OverviewTab.js
// ─────────────────────────────────────────────────────────────
import React from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

// ── Couleurs par statut ──
const STATUS_COLORS = {
  normal: "#639922",
  warn: "#BA7517",
  danger: "#A32D2D",
  danger_hot: "#A32D2D",
  danger_cold: "#A32D2D",
};
const STATUS_BG = {
  normal: "#EAF3DE",
  warn: "#FAEEDA",
  danger: "#FCEBEB",
  danger_hot: "#FCEBEB",
  danger_cold: "#FCEBEB",
};
const STATUS_LABEL = {
  normal: "OK",
  warn: "Attention",
  danger: "Danger",
  danger_hot: "Danger",
  danger_cold: "Danger",
};

// ── Templates d'action avec placeholders {value}, {unit}, {min}, {max} ──
const ACTIONS = {
  temperature: {
    warn: "Surveiller — {value}{unit} proche des limites (min {min}{unit} / max {max}{unit})",
    danger_hot:
      "Agir vite : ouvrir les ventilateurs car {value}{unit} ≥ max {max}{unit}",
    danger_cold:
      "Agir vite : allumer la lampe chauffante car {value}{unit} ≤ min {min}{unit}",
  },
  humidity: {
    warn: "Vérifier la litière — {value}{unit} proche des limites [min {min}{unit} - max {max}{unit}]",
    danger:
      "Changer la litière et aérer — humidité {value}{unit} hors limites [min {min}{unit} - max {max}{unit}]",
  },
  airQualityPercent: {
    warn: "Contrôler la ventilation : {value}{unit} approche le seuil max {max}{unit} (≥{max}{unit} = danger)",
    danger: "Ventiler d'urgence — qualité {value}{unit} ≥ max {max}{unit}",
  },
  waterLevel: {
    warn: "Vérifier l'abreuvoir : {value}{unit} approche le seuil min {min}{unit} (≤{min}{unit} = danger)",
    danger:
      "Remplir l'eau immédiatement — niveau {value}{unit} ≤ min {min}{unit}",
  },
};

// ── Helper : remplace les placeholders dans un template ──
const formatAction = (template, sensor, threshold) => {
  if (!template) return null;
  return template
    .replace(/\{value\}/g, sensor.value)
    .replace(/\{unit\}/g, sensor.unit)
    .replace(/\{min\}/g, threshold?.min ?? "?")
    .replace(/\{max\}/g, threshold?.max ?? "?");
};

// ── Helper : construit le texte de seuil explicite ──
const getThresholdText = (sensor, threshold) => {
  const { status, value, unit } = sensor;

  if (status === "warn" && threshold) {
    const parts = [];
    if (threshold.min !== undefined) parts.push(`min ${threshold.min}${unit}`);
    if (threshold.max !== undefined) parts.push(`max ${threshold.max}${unit}`);
    return `Attention — ${value}${unit} proche du seuil (${parts.join(" / ")})`;
  }

  if (status === "danger_hot") {
    return `Seuil critique dépassé — ${value}${unit} ≥ max ${threshold?.max}${unit}`;
  }

  if (status === "danger_cold") {
    return `Seuil critique dépassé — ${value}${unit} ≤ min ${threshold?.min}${unit}`;
  }

  if (status === "danger" && threshold) {
    if (threshold.max !== undefined && threshold.min === undefined)
      return `Seuil critique dépassé — ${value}${unit} ≥ max ${threshold.max}${unit}`;
    if (threshold.min !== undefined && threshold.max === undefined)
      return `Seuil critique dépassé — ${value}${unit} ≤ min ${threshold.min}${unit}`;
    if (threshold.min !== undefined && threshold.max !== undefined)
      return `Seuil critique dépassé — ${value}${unit} hors limites [${threshold.min}-${threshold.max}${unit}]`;
  }

  return "";
};

const isDanger = (status) =>
  status === "danger" || status === "danger_hot" || status === "danger_cold";
const isAlertStatus = (status) => isDanger(status) || status === "warn";

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────
export default function OverviewTab({
  refreshing,
  onRefresh,
  sensors,
  thresholds,
  aiScore,
  aiInsight,
  lastAnalysis,
  onGoToAIAnalysis,
  onGoToChat,
  onGoToHistory,
}) {
  const dangerSensors = sensors.filter((s) => isDanger(s.status));
  const warnSensors = sensors.filter((s) => s.status === "warn");

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: 16,
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
      {/* ════════════════════════════════════
          Bannière IA Santé
      ════════════════════════════════════ */}
      <TouchableOpacity
        style={aiBanner}
        onPress={onGoToAIAnalysis}
        activeOpacity={0.85}
      >
        <View style={aiBannerIcon}>
          <Text style={{ fontSize: 22 }}>🤖</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>
            Analyse IA Santé
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.9)",
              marginTop: 2,
            }}
          >
            Dernière analyse : aujourd'hui 14:30
          </Text>
        </View>
        <View style={aiBannerScore}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#fff" }}>
            {aiScore ?? 80}
          </Text>
        </View>
        <View style={aiBannerArrow}>
          <MaterialIcons name="chevron-right" size={18} color="#fff" />
        </View>
      </TouchableOpacity>

      {/* ════════════════════════════════════
          Actions rapides
      ════════════════════════════════════ */}
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        <TouchableOpacity
          style={[quickAction, quickActionAI]}
          onPress={onGoToAIAnalysis}
          activeOpacity={0.85}
        >
          <MaterialIcons name="photo-camera" size={15} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
            Nouvelle analyse
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={quickAction}
          onPress={onGoToChat}
          activeOpacity={0.85}
        >
          <MaterialIcons name="chat-bubble-outline" size={15} color="#22C55E" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#1E293B" }}>
            Dr. Gemma
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={quickAction}
          onPress={onGoToHistory}
          activeOpacity={0.85}
        >
          <MaterialIcons name="show-chart" size={15} color="#64748B" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#1E293B" }}>
            Historique
          </Text>
        </TouchableOpacity>
      </View>

      {/* ════════════════════════════════════
          Bannière danger globale
      ════════════════════════════════════ */}
      {dangerSensors.length > 0 && (
        <View
          style={[
            alertBanner,
            { borderLeftColor: "#A32D2D", backgroundColor: "#FCEBEB" },
          ]}
        >
          <View style={[alertDot, { backgroundColor: "#E24B4A" }]} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#791F1F" }}>
              Danger — {dangerSensors.map((s) => s.name).join(", ")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#791F1F",
                marginTop: 2,
                opacity: 0.85,
              }}
            >
              Voir les instructions ci-dessous et agir immédiatement.
            </Text>
          </View>
        </View>
      )}

      {/* ════════════════════════════════════
          Bannière avertissement globale
      ════════════════════════════════════ */}
      {warnSensors.length > 0 && dangerSensors.length === 0 && (
        <View
          style={[
            alertBanner,
            { borderLeftColor: "#BA7517", backgroundColor: "#FAEEDA" },
          ]}
        >
          <View style={[alertDot, { backgroundColor: "#BA7517" }]} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#633806" }}>
              Attention — {warnSensors.map((s) => s.name).join(", ")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#633806",
                marginTop: 2,
                opacity: 0.85,
              }}
            >
              Surveiller ces paramètres avant dépassement des seuils critiques.
            </Text>
          </View>
        </View>
      )}

      {/* ════════════════════════════════════
          Capteurs temps réel
      ════════════════════════════════════ */}
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
          const col = STATUS_COLORS[sensor.status] ?? STATUS_COLORS.normal;
          const bg = STATUS_BG[sensor.status] ?? STATUS_BG.normal;
          const label = STATUS_LABEL[sensor.status] ?? "OK";
          const alert = isAlertStatus(sensor.status);
          const threshold = thresholds?.[sensor.key];
          const actionTpl =
            ACTIONS[sensor.key]?.[sensor.status] ??
            ACTIONS[sensor.key]?.["danger"];
          const actionText = formatAction(actionTpl, sensor, threshold);
          const threshText = alert ? getThresholdText(sensor, threshold) : "";

          return (
            <View key={i} style={[card, { flexBasis: "47%", flexGrow: 1 }]}>
              {/* En-tête : icône + badge */}
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
                  <Text style={{ fontSize: 10, fontWeight: "700", color: col }}>
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
                    color: alert ? col : "#1E293B",
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
                  marginBottom: alert ? 8 : 0,
                }}
              >
                {sensor.name}
              </Text>

              {/* Bloc alerte : seuil + action */}
              {alert && (
                <View
                  style={{
                    backgroundColor: bg,
                    borderLeftWidth: 3,
                    borderLeftColor: col,
                    borderRadius: 6,
                    padding: 8,
                  }}
                >
                  {threshText ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: col,
                        marginBottom: 3,
                      }}
                    >
                      {threshText}
                    </Text>
                  ) : null}
                  {actionText ? (
                    <Text style={{ fontSize: 11, color: "#64748B" }}>
                      → {actionText}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* ════════════════════════════════════
          Insight IA — Dr. Gemma
      ════════════════════════════════════ */}
      <View style={aiInsightCard}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <View style={aiInsightAvatar}>
            <Text style={{ fontSize: 15 }}>🤖</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#166534" }}>
            Dr. Gemma — Insight IA
          </Text>
          <Text style={{ fontSize: 11, color: "#22C55E", marginLeft: "auto" }}>
            il y a 2h
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: "#166534", lineHeight: 20 }}>
          {aiInsight ??
            "Basé sur l'analyse de 14h30 et les capteurs actuels : l'état de vos volailles est satisfaisant. Je recommande de vérifier la ventilation cet après-midi car la température extérieure devrait atteindre 30 °C."}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={aiInsightBtn}
            onPress={onGoToChat}
            activeOpacity={0.85}
          >
            <MaterialIcons
              name="chat-bubble-outline"
              size={14}
              color="#166534"
            />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#166534" }}>
              Poser une question
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[aiInsightBtn, aiInsightBtnPrimary]}
            onPress={onGoToAIAnalysis}
            activeOpacity={0.85}
          >
            <MaterialIcons name="photo-camera" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
              Analyser
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ════════════════════════════════════
          Dernière analyse IA
      ════════════════════════════════════ */}
      <SectionLabel>Dernière analyse IA</SectionLabel>
      <View style={[card, { marginBottom: 8 }]}>
        {/* En-tête */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#F0FDF4",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 22 }}>📸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
              Analyse visuelle #{lastAnalysis?.id ?? 142}
            </Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
              {lastAnalysis?.date ?? "Aujourd'hui 14:30"} · Gemma 3
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              backgroundColor: "#F0FDF4",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "800", color: "#166534" }}>
              {lastAnalysis?.score ?? 80}/100
            </Text>
          </View>
        </View>
        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: "Mortalité", value: lastAnalysis?.mortality ?? "Aucune" },
            {
              label: "Comportement",
              value: lastAnalysis?.behavior ?? "Normal",
            },
            { label: "Confiance", value: lastAnalysis?.confidence ?? "85%" },
          ].map((stat, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                padding: 9,
                borderRadius: 10,
                backgroundColor: "#F8FAFC",
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: 10, color: "#94A3B8", fontWeight: "600" }}
              >
                {stat.label}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: "#22C55E",
                  marginTop: 3,
                }}
              >
                {stat.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────
// Composant utilitaire
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
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

const alertDot = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginTop: 4,
};

const aiBanner = {
  backgroundColor: "#16A34A",
  borderRadius: 18,
  padding: 14,
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  marginBottom: 4,
};

const aiBannerIcon = {
  width: 44,
  height: 44,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.2)",
  alignItems: "center",
  justifyContent: "center",
};

const aiBannerScore = {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 10,
  backgroundColor: "rgba(255,255,255,0.2)",
};

const aiBannerArrow = {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: "rgba(255,255,255,0.2)",
  alignItems: "center",
  justifyContent: "center",
};

const quickAction = {
  flexDirection: "row",
  alignItems: "center",
  gap: 7,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 14,
  backgroundColor: "#fff",
  borderWidth: 1,
  borderColor: "#F1F5F9",
};

const quickActionAI = {
  backgroundColor: "#16A34A",
  borderWidth: 0,
};

const aiInsightCard = {
  backgroundColor: "#F0FDF4",
  borderRadius: 18,
  padding: 14,
  borderWidth: 1,
  borderColor: "#DCFCE7",
  marginBottom: 8,
};

const aiInsightAvatar = {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: "#16A34A",
  alignItems: "center",
  justifyContent: "center",
};

const aiInsightBtn = {
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  padding: 9,
  borderRadius: 10,
  backgroundColor: "#fff",
  borderWidth: 1,
  borderColor: "#DCFCE7",
};

const aiInsightBtnPrimary = {
  backgroundColor: "#16A34A",
  borderWidth: 0,
};
