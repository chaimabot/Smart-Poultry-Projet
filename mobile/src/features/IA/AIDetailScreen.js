// screens/ai/AIDetailScreen.jsx
import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const scoreColor = (score) => {
  if (score >= 75) return "#22C55E";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
};

const scoreLabel = (score) => {
  if (score >= 75) return "État Normal";
  if (score >= 50) return "Attention";
  return "Critique";
};

const statusStyle = (ok) => ({
  color: ok ? "#22C55E" : "#EF4444",
  icon: ok ? "check-circle" : "cancel",
  bg: ok ? "#F0FDF4" : "#FEF2F2",
});

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, label }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}
    >
      <MaterialIcons name={icon} size={16} color="#94A3B8" />
      <Text
        style={{
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "#94A3B8",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Card({ style, children }) {
  return (
    <View
      style={[
        {
          marginHorizontal: 20,
          marginBottom: 14,
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function ScoreCircle({ score }) {
  const color = scoreColor(score);
  const pct = Math.min(Math.max(score, 0), 100);
  return (
    <View
      style={{
        width: 90,
        height: 90,
        borderRadius: 45,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* outer ring via border trick */}
      <View
        style={{
          position: "absolute",
          width: 90,
          height: 90,
          borderRadius: 45,
          borderWidth: 7,
          borderColor: "#F1F5F9",
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 90,
          height: 90,
          borderRadius: 45,
          borderWidth: 7,
          borderTopColor: pct > 75 ? color : "transparent",
          borderRightColor: pct > 25 ? color : "transparent",
          borderBottomColor: pct > 50 ? color : "transparent",
          borderLeftColor: pct > 0 ? color : "transparent",
          transform: [{ rotate: "-90deg" }],
        }}
      />
      <Text style={{ fontSize: 26, fontWeight: "800", color }}>{score}</Text>
    </View>
  );
}

function DetectionItem({ name, desc, confidence, ok }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: ok ? "#F0FDF4" : "#FEF2F2",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons
          name={ok ? "check-circle" : "cancel"}
          size={22}
          color={ok ? "#22C55E" : "#EF4444"}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#1E293B" }}>
          {name}
        </Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
          {desc}
        </Text>
        {/* mini bar */}
        <View
          style={{
            height: 4,
            backgroundColor: "#F1F5F9",
            borderRadius: 2,
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${confidence}%`,
              height: "100%",
              backgroundColor: ok ? "#22C55E" : "#EF4444",
              borderRadius: 2,
            }}
          />
        </View>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: ok ? "#22C55E" : "#EF4444",
            marginTop: 4,
          }}
        >
          {confidence}% confiance
        </Text>
      </View>
    </View>
  );
}

function SensorItem({ icon, name, value, unit, ok, status }) {
  const bg = ok ? "#F0FDF4" : "#FEF3C7";
  const col = ok ? "#22C55E" : "#F59E0B";
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialIcons name={icon} size={18} color={col} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#94A3B8",
            textTransform: "uppercase",
          }}
        >
          {name}
        </Text>
        <Text
          style={{ fontSize: 16, fontWeight: "800", color: col, marginTop: 2 }}
        >
          {value}
          {unit}
        </Text>
        <Text
          style={{ fontSize: 11, fontWeight: "600", color: col, marginTop: 1 }}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}

function MetricItem({ emoji, title, value, desc }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 14,
        alignItems: "center",
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
          marginBottom: 8,
        }}
      >
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#1E293B" }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#22C55E",
          marginTop: 4,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          color: "#94A3B8",
          marginTop: 2,
          textAlign: "center",
        }}
      >
        {desc}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AIDetailScreen({ route, navigation }) {
  const { analysis, poultryName } = route?.params || {};
  const insets = useSafeAreaInsets();

  // Fallback demo data when called without real params
  const data = analysis?.data || {
    healthScore: 80,
    urgencyLevel: "normal",
    diagnostic:
      "État général satisfaisant. Les volailles présentent un comportement normal, l'environnement est propre et bien ventilé.",
    confidence: 85,
    processingTime: 4.7,
    createdAt: new Date().toISOString(),
    detections: {
      mortalityDetected: false,
      behaviorNormal: true,
      densityOk: true,
      cleanEnvironment: true,
      ventilationAdequate: true,
    },
    advices: [
      "Maintenir la surveillance régulière des volailles — comportement et appétit",
      "Vérifier la ventilation aux heures les plus chaudes (12h–16h) — prévoir 28°C+",
      "Contrôler l'état des abreuvoirs ce soir — niveau à 55%, tendance à la baisse",
    ],
    sensors: {
      temperature: { value: 24, ok: true, status: "Dans les normes" },
      humidity: { value: 58, ok: true, status: "Dans les normes" },
      airQuality: { value: 70, ok: true, status: "Excellente" },
      waterLevel: { value: 55, ok: true, status: "Suffisant" },
    },
    imageQuality: {
      sizeKb: 8,
      width: 1280,
      height: 720,
      clarity: 92,
      status: "optimized",
    },
    model: {
      name: "Gemma 3 12B",
      platform: "Cloudflare AI",
      fallback: "LLaVA 1.5 7B",
      version: "v2.1.0",
    },
  };

  const score = data.healthScore ?? 80;
  const color = scoreColor(score);
  const detections = data.detections ?? {};
  const sensors = data.sensors ?? {};
  const pName = poultryName || "Poulailler";

  const detectionList = [
    {
      name: "Comportement normal",
      desc: "Volailles actives, pas de signes de stress",
      ok: detections.behaviorNormal !== false,
      confidence: 95,
    },
    {
      name: "Aucune mortalité",
      desc: "Aucun cadavre visible dans l'image",
      ok: !detections.mortalityDetected,
      confidence: 99,
    },
    {
      name: "Densité adéquate",
      desc: "Répartition des volailles homogène",
      ok: detections.densityOk !== false,
      confidence: 88,
    },
    {
      name: "Environnement propre",
      desc: "Litière en bon état, pas d'accumulation",
      ok: detections.cleanEnvironment !== false,
      confidence: 92,
    },
    {
      name: "Ventilation correcte",
      desc: "Circulation d'air visible, pas de condensation",
      ok: detections.ventilationAdequate !== false,
      confidence: 90,
    },
  ];

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message:
          `📊 Rapport IA — ${pName}\n` +
          `Score santé : ${score}/100 (${scoreLabel(score)})\n` +
          `Confiance : ${data.confidence}%\n` +
          `Date : ${fmtDate(data.createdAt)}\n\n` +
          `Diagnostic : ${data.diagnostic}`,
      });
    } catch {
      // ignore
    }
  }, [pName, score, data]);

  const handleRelaunch = useCallback(() => {
    Alert.alert(
      "Relancer l'analyse",
      "Lancer une nouvelle analyse IA pour ce poulailler ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Relancer",
          onPress: () => {
            navigation.navigate("AIAnalysisScreen", {
              poultryId: analysis?.poultryId,
              poultryName: pName,
            });
          },
        },
      ],
    );
  }, [navigation, analysis, pName]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View
        style={{
          backgroundColor: "#fff",
          paddingTop: Platform.OS === "ios" ? insets.top + 6 : 10,
          paddingBottom: 14,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: "#F1F5F9",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center", marginHorizontal: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#1E293B" }}>
            Détail Analyse
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#94A3B8",
              fontWeight: "500",
              marginTop: 1,
            }}
          >
            {fmtDate(data.createdAt)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleShare}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="share-outline" size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >
        {/* ── Hero banner ── */}
        <View
          style={{
            height: 140,
            backgroundColor: "#1E293B",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* background pattern */}
          <View style={{ position: "absolute", inset: 0, opacity: 0.07 }}>
            {[...Array(5)].map((_, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  width: 160 + i * 40,
                  height: 160 + i * 40,
                  borderRadius: (160 + i * 40) / 2,
                  borderWidth: 1,
                  borderColor: "#fff",
                  top: "50%",
                  left: "50%",
                  marginTop: -(80 + i * 20),
                  marginLeft: -(80 + i * 20),
                }}
              />
            ))}
          </View>

          {/* badge top-left */}
          <View
            style={{
              position: "absolute",
              top: 14,
              left: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "rgba(255,255,255,0.15)",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <MaterialIcons name="psychology" size={14} color="#fff" />
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#fff" }}>
              Analyse IA
            </Text>
          </View>

          {/* score badge top-right */}
          <View
            style={{
              position: "absolute",
              top: 14,
              right: 16,
              backgroundColor: color,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#fff" }}>
              {score}/100
            </Text>
          </View>

          {/* poultry emoji */}
          <Text style={{ fontSize: 56 }}>🐔</Text>
          <Text
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              fontWeight: "600",
              marginTop: 4,
            }}
          >
            {pName}
          </Text>
        </View>

        {/* ── Score card ── */}
        <Card style={{ marginTop: -24, zIndex: 10 }}>
          {/* main row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 20,
              marginBottom: 20,
            }}
          >
            <ScoreCircle score={score} />
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: "#F0FDF4",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 20,
                  alignSelf: "flex-start",
                  marginBottom: 10,
                }}
              >
                <MaterialIcons name="check-circle" size={16} color={color} />
                <Text style={{ fontSize: 14, fontWeight: "700", color }}>
                  {scoreLabel(score)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
                {[
                  { icon: "timer", val: `${data.processingTime ?? "—"}s` },
                  { icon: "verified", val: `${data.confidence ?? "—"}%` },
                  {
                    icon: "calendar-today",
                    val: fmtDate(data.createdAt).split("à")[0].trim(),
                  },
                ].map((m, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <MaterialIcons name={m.icon} size={13} color="#94A3B8" />
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#94A3B8",
                        fontWeight: "500",
                      }}
                    >
                      {m.val}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* score bar */}
          <View
            style={{
              height: 10,
              backgroundColor: "#F1F5F9",
              borderRadius: 5,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${score}%`,
                height: "100%",
                backgroundColor: color,
                borderRadius: 5,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 6,
            }}
          >
            {["0", "25", "50", "75", "100"].map((l) => (
              <Text
                key={l}
                style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600" }}
              >
                {l}
              </Text>
            ))}
          </View>

          {/* diagnostic */}
          {!!data.diagnostic && (
            <View
              style={{
                marginTop: 16,
                backgroundColor: "#F8FAFC",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: "#64748B",
                  lineHeight: 20,
                  fontWeight: "500",
                }}
              >
                {data.diagnostic}
              </Text>
            </View>
          )}
        </Card>

        {/* ── Détections visuelles ── */}
        <Card>
          <SectionTitle icon="visibility" label="Détections Visuelles" />
          {detectionList.map((d, i) => (
            <DetectionItem key={i} {...d} />
          ))}
        </Card>

        {/* ── Corrélation capteurs ── */}
        <Card>
          <SectionTitle icon="sensors" label="Corrélation Capteurs" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <SensorItem
              icon="thermostat"
              name="Température"
              value={sensors.temperature?.value ?? "--"}
              unit="°C"
              ok={sensors.temperature?.ok !== false}
              status={sensors.temperature?.status ?? "—"}
            />
            <SensorItem
              icon="water_drop"
              name="Humidité"
              value={sensors.humidity?.value ?? "--"}
              unit="%"
              ok={sensors.humidity?.ok !== false}
              status={sensors.humidity?.status ?? "—"}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <SensorItem
              icon="air"
              name="Qualité air"
              value={sensors.airQuality?.value ?? "--"}
              unit="%"
              ok={sensors.airQuality?.ok !== false}
              status={sensors.airQuality?.status ?? "—"}
            />
            <SensorItem
              icon="opacity"
              name="Niveau eau"
              value={sensors.waterLevel?.value ?? "--"}
              unit="%"
              ok={sensors.waterLevel?.ok !== false}
              status={sensors.waterLevel?.status ?? "—"}
            />
          </View>
        </Card>

        {/* ── Métriques image ── */}
        <Card>
          <SectionTitle icon="image" label="Métriques Image" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <MetricItem
              emoji="📐"
              title="Résolution"
              value={`${data.imageQuality?.width ?? "--"}×${data.imageQuality?.height ?? "--"}`}
              desc="Qualité HD"
            />
            <MetricItem
              emoji="🎯"
              title="Clarté"
              value={`${data.imageQuality?.clarity ?? "--"}%`}
              desc="Bonne visibilité"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricItem
              emoji="💾"
              title="Taille"
              value={`${data.imageQuality?.sizeKb ?? "--"} Ko`}
              desc="Optimisé IA"
            />
            <MetricItem
              emoji="⚡"
              title="Traitement"
              value={`${data.processingTime ?? "--"}s`}
              desc={data.model?.name ?? "IA"}
            />
          </View>
        </Card>

        {/* ── Recommandations ── */}
        {Array.isArray(data.advices) && data.advices.length > 0 && (
          <Card>
            <SectionTitle icon="lightbulb" label="Recommandations IA" />
            {data.advices.map((advice, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  backgroundColor: "#F0FDF4",
                  borderRadius: 14,
                  padding: 14,
                  marginBottom: i < data.advices.length - 1 ? 10 : 0,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: "#22C55E",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}
                  >
                    {i + 1}
                  </Text>
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: "#166534",
                    lineHeight: 22,
                    fontWeight: "500",
                  }}
                >
                  {advice}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── Infos techniques ── */}
        <Card style={{ backgroundColor: "#1E293B" }}>
          <SectionTitle icon="memory" label="Informations Techniques" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            {[
              { k: "MODÈLE IA", v: data.model?.name ?? "--" },
              { k: "PLATEFORME", v: data.model?.platform ?? "--" },
              { k: "FALLBACK", v: data.model?.fallback ?? "--" },
              { k: "VERSION", v: data.model?.version ?? "--" },
            ].map((item) => (
              <View key={item.k} style={{ width: "45%" }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: "600",
                  }}
                >
                  {item.k}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#fff",
                    fontWeight: "700",
                    marginTop: 4,
                  }}
                >
                  {item.v}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>

      {/* ── Bottom actions ── */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "#fff",
          paddingTop: 14,
          paddingBottom: 14 + (insets.bottom || 0),
          paddingHorizontal: 20,
          flexDirection: "row",
          gap: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 10,
        }}
      >
        <TouchableOpacity
          onPress={handleShare}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            backgroundColor: "#F1F5F9",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="download-outline" size={18} color="#64748B" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B" }}>
            Exporter
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRelaunch}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            backgroundColor: "#22C55E",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            shadowColor: "#22C55E",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="refresh" size={18} color="#fff" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>
            Relancer analyse
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
