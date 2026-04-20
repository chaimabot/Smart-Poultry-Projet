import React from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const STATUS_COLORS = { normal: "#22C55E", warn: "#F59E0B", danger: "#EF4444" };

export default function OverviewTab({
  refreshing,
  onRefresh,
  poultryInfo,
  isConnected,
  sensors,
  thresholds,
}) {
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
          const threshold = thresholds?.[sensor.key];
          return (
            <View key={i} style={[card, { flexBasis: "47%", flexGrow: 1 }]}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: col + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialIcons name={sensor.icon} size={18} color={col} />
                </View>
                <View
                  style={{
                    backgroundColor: col + "18",
                    borderRadius: 20,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: col,
                    }}
                  >
                    {sensor.status === "normal"
                      ? "OK"
                      : sensor.status === "warn"
                        ? "Attn."
                        : "Danger"}
                  </Text>
                </View>
              </View>
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
                    fontWeight: "800",
                    color: "#1E293B",
                    lineHeight: 30,
                  }}
                >
                  {sensor.value}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "#94A3B8",
                    marginBottom: 2,
                  }}
                >
                  {sensor.unit}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: "#94A3B8",
                  marginTop: 4,
                }}
              >
                {sensor.name}
              </Text>
              {threshold && (
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: "#FFF7ED",
                      borderRadius: 6,
                      padding: 4,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        color: "#F59E0B",
                        fontWeight: "700",
                      }}
                    >
                      ⚠ {threshold.warn}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: "#FEF2F2",
                      borderRadius: 6,
                      padding: 4,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        color: "#EF4444",
                        fontWeight: "700",
                      }}
                    >
                      ✕ {threshold.danger}
                    </Text>
                  </View>
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
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};
