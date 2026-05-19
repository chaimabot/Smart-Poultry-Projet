// ─────────────────────────────────────────────────────────────
// OverviewTab.js — corrigé complet
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

// ── Templates d'action ──
// ✅ airQualityPercent : seuil MIN (danger si en dessous) → {min} pas {max}
// ✅ waterLevel        : seuil MIN uniquement → {min}
// ✅ Aucune valeur brute dans les templates — texte professionnel
const ACTIONS = {
  temperature: {
    warn: "Surveiller — température proche des limites autorisées (min {min}{unit} / max {max}{unit})",
    danger_hot:
      "Agir vite : activer la ventilation — température supérieure au maximum autorisé ({max}{unit})",
    danger_cold:
      "Agir vite : allumer la lampe chauffante — température inférieure au minimum requis ({min}{unit})",
  },
  humidity: {
    warn: "Vérifier la litière — humidité proche des limites autorisées (min {min}{unit} / max {max}{unit})",
    danger:
      "Changer la litière et aérer — humidité hors de la plage autorisée ({min}{unit} – {max}{unit})",
  },
  // ✅ CORRIGÉ : seuil min uniquement, danger si valeur EN DESSOUS de {min}
  airQualityPercent: {
    warn: "Contrôler la ventilation — qualité de l'air approche le seuil minimum ({min}{unit})",
    danger:
      "Ventiler d'urgence — qualité de l'air en dessous du seuil critique ({min}{unit})",
  },
  // ✅ CORRIGÉ : seuil min uniquement, danger si valeur EN DESSOUS de {min}
  waterLevel: {
    warn: "Vérifier l'abreuvoir — niveau d'eau approche le seuil minimum ({min}{unit})",
    danger:
      "Remplir les abreuvoirs immédiatement — niveau d'abreuvement critique ({min}{unit})",
  },
};

// ── Helper : remplace les placeholders dans un template ──
const formatAction = (template, sensor, threshold) => {
  if (!template) return null;
  const v =
    sensor.value !== null && sensor.value !== undefined
      ? String(sensor.value)
      : "—";
  const u = sensor.unit ?? "";
  return template
    .replace(/\{value\}/g, v)
    .replace(/\{unit\}/g, u)
    .replace(/\{min\}/g, threshold?.min ?? "?")
    .replace(/\{max\}/g, threshold?.max ?? "?");
};

// ── Helper : construit le texte de seuil ──
// ✅ CORRIGÉ : détecte correctement min-seul / max-seul / min+max
const getThresholdText = (sensor, threshold) => {
  const { status, value, unit } = sensor;
  const v = value !== null && value !== undefined ? String(value) : "—";
  const u = unit ?? "";

  if (!threshold) return "";

  switch (status) {
    case "warn": {
      const parts = [];
      if (threshold.min !== undefined) parts.push(`min ${threshold.min}${u}`);
      if (threshold.max !== undefined) parts.push(`max ${threshold.max}${u}`);
      return parts.length > 0
        ? `Attention — ${v}${u} proche du seuil (${parts.join(" / ")})`
        : "";
    }

    case "danger_hot":
      return `Seuil dépassé — température supérieure au maximum autorisé (${threshold.max ?? "?"}${u})`;

    case "danger_cold":
      return `Seuil dépassé — température inférieure au minimum requis (${threshold.min ?? "?"}${u})`;

    case "danger": {
      // ✅ Seuil min uniquement (air, eau) : danger si valeur en dessous
      if (threshold.min !== undefined && threshold.max === undefined)
        return `Seuil critique — valeur en dessous du minimum requis (${threshold.min}${u})`;

      // Seuil max uniquement
      if (threshold.max !== undefined && threshold.min === undefined)
        return `Seuil critique — valeur au-dessus du maximum autorisé (${threshold.max}${u})`;

      // Plage min + max (humidité)
      if (threshold.min !== undefined && threshold.max !== undefined)
        return `Seuil critique — valeur hors de la plage autorisée (${threshold.min}–${threshold.max}${u})`;

      return "Seuil critique dépassé";
    }

    default:
      return "";
  }
};

const isDanger = (s) =>
  s === "danger" || s === "danger_hot" || s === "danger_cold";
const isAlertStatus = (s) => isDanger(s) || s === "warn";

// ── Helper : formate une date ISO en français ──
const formatDate = (dateRaw) => {
  if (!dateRaw) return null;
  try {
    return new Date(dateRaw).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// Sous-composant : placeholder "aucune donnée capteur"
// ─────────────────────────────────────────────────────────────
function NoSensorData() {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#E2E8F0",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
        gap: 10,
        marginBottom: 24,
        backgroundColor: "#FAFAFA",
      }}
    >
      <MaterialIcons name="sensors-off" size={32} color="#CBD5E1" />
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#94A3B8" }}>
        Capteurs non connectés
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: "#CBD5E1",
          textAlign: "center",
          lineHeight: 18,
        }}
      >
        Aucune donnée récente disponible.{"\n"}
        Vérifiez la connexion du module de surveillance.
      </Text>
    </View>
  );
}

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
  // ✅ sensors toujours un tableau
  const safeSensors = Array.isArray(sensors) ? sensors : [];
  const hasSensors = safeSensors.length > 0;

  const dangerSensors = safeSensors.filter((s) => isDanger(s.status));
  const warnSensors = safeSensors.filter((s) => s.status === "warn");

  // ✅ Score IA — "—" si null
  const scoreDisplay =
    aiScore !== null && aiScore !== undefined ? String(aiScore) : "—";

  // ✅ Date dernière analyse formatée
  const lastDateDisplay = formatDate(lastAnalysis?.date);

  // ✅ Score dernière analyse
  const lastScoreDisplay =
    lastAnalysis?.score !== null && lastAnalysis?.score !== undefined
      ? `${lastAnalysis.score}/100`
      : "—";

  // ✅ Confiance
  const confidenceDisplay =
    lastAnalysis?.confidence !== null && lastAnalysis?.confidence !== undefined
      ? `${lastAnalysis.confidence}%`
      : "—";

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
          {/* ✅ Date dynamique */}
          <Text
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.9)",
              marginTop: 2,
            }}
          >
            {lastDateDisplay
              ? `Dernière analyse : ${lastDateDisplay}`
              : "Aucune analyse — appuyez pour analyser"}
          </Text>
        </View>
        {/* ✅ Score dynamique — "—" si null */}
        <View style={aiBannerScore}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#fff" }}>
            {scoreDisplay}
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

      {/* ✅ Placeholder si aucune donnée fraîche */}
      {!hasSensors ? (
        <NoSensorData />
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {safeSensors.map((sensor, i) => {
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

            // ✅ Guard null sur value
            const displayValue =
              sensor.value !== null && sensor.value !== undefined
                ? String(sensor.value)
                : "—";

            return (
              <View
                key={`${sensor.key}-${i}`}
                style={[card, { flexBasis: "47%", flexGrow: 1 }]}
              >
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
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        color: col,
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                </View>

                {/* Valeur */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 26,
                      fontWeight: "600",
                      color: alert ? col : "#1E293B",
                      lineHeight: 30,
                    }}
                  >
                    {displayValue}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#94A3B8",
                      marginBottom: 2,
                    }}
                  >
                    {sensor.unit ?? ""}
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
                          marginBottom: actionText ? 3 : 0,
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
      )}

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
          {/* ✅ Date dynamique */}
          {lastDateDisplay && (
            <Text
              style={{
                fontSize: 11,
                color: "#22C55E",
                marginLeft: "auto",
              }}
            >
              {lastDateDisplay}
            </Text>
          )}
        </View>

        {/* ✅ Insight dynamique depuis dernière analyse */}
        <Text style={{ fontSize: 13, color: "#166534", lineHeight: 20 }}>
          {aiInsight ??
            "Lancez une analyse IA pour obtenir un diagnostic complet de l'état de santé de vos volailles."}
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
            {/* ✅ ID dynamique */}
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
              {lastAnalysis
                ? `Analyse #${lastAnalysis.id ?? "—"}`
                : "Aucune analyse disponible"}
            </Text>
            {/* ✅ Date dynamique */}
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
              {lastDateDisplay ?? "—"} · Gemma 3
            </Text>
          </View>
          {/* ✅ Score — "—" si null */}
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              backgroundColor:
                lastAnalysis?.score != null ? "#F0FDF4" : "#F8FAFC",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: lastAnalysis?.score != null ? "#166534" : "#94A3B8",
              }}
            >
              {lastScoreDisplay}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            {
              label: "Mortalité",
              value: lastAnalysis?.mortality ?? "—",
              color:
                lastAnalysis?.mortality === "Aucune"
                  ? "#22C55E"
                  : lastAnalysis?.mortality === "Détectée"
                    ? "#EF4444"
                    : "#94A3B8",
            },
            {
              label: "Comportement",
              value: lastAnalysis?.behavior ?? "—",
              color:
                lastAnalysis?.behavior === "Normal"
                  ? "#22C55E"
                  : lastAnalysis?.behavior === "Anormal"
                    ? "#F59E0B"
                    : "#94A3B8",
            },
            {
              label: "Confiance",
              value: confidenceDisplay,
              color: lastAnalysis?.confidence != null ? "#22C55E" : "#94A3B8",
            },
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
                style={{
                  fontSize: 10,
                  color: "#94A3B8",
                  fontWeight: "600",
                }}
              >
                {stat.label}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: stat.color,
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
