import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import SectionGestionEau from "./sectionControlsTab/SectionGestionEau";
import SectionGestionLampe from "./sectionControlsTab/SectionGestionLampe";
import SectionGestionVentilateur from "./sectionControlsTab/SectionGestionVentilateur";
import SectionGestionPorte from "./sectionControlsTab/SectionGestionPorte";
function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ControlsTab({
  isConnected,
  actuators,
  toggleFanAuto,
  setFan,
  toggleLampAuto,
  setLamp,
  toggleDoor,
  stopDoor,
  doorMoving = false,
  doorMode,
  setDoorMode,
  doorSchedule,
  setDoorSchedule,
  feeder = {
    schedules: [],
    durationSec: 5,
    isDistributing: false,
    lastDistribution: null,
  },
  setFeeder,
  distributeFood,
  addSchedule,
  removeSchedule,
  updateSchedule,
  poultryId,
  pumpData,
  onRefresh,
  onUpdateActuator,
}) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: 20,
        paddingBottom: 40,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Actionneurs ── */}
      <SectionLabel>Actionneurs</SectionLabel>
      <View style={{ gap: 10, marginBottom: 24 }}>
        {/* Ventilateur */}
        <SectionGestionVentilateur
          poultryId={poultryId}
          data={{
            mode: actuators.fanAuto ? "auto" : "manual",
            status: actuators.fan,
          }}
          onUpdate={onRefresh}
        />

        {/* Lampe Chauffante */}
        <SectionGestionLampe
          poultryId={poultryId}
          data={actuators.lamp || { lampAuto: false, lampOn: false }}
          onUpdate={onRefresh}
        />

        {/* Porte Automatique */}
        <SectionGestionPorte
          poultryId={poultryId}
          isConnected={isConnected}
          data={actuators.door}
          doorMoving={doorMoving}
          doorMode={doorMode}
          setDoorMode={setDoorMode}
          doorSchedule={doorSchedule}
          setDoorSchedule={setDoorSchedule}
          toggleDoor={toggleDoor}
          stopDoor={stopDoor}
        />
      </View>
      {/* Section Pompe à Eau */}
      <SectionGestionEau
        poultryId={poultryId}
        data={pumpData || { pumpAuto: false, pumpOn: false }}
        onUpdate={onRefresh}
      />
      {/* ── Distributeur ── */}
      <SectionLabel>Distributeur de nourriture</SectionLabel>
      <View style={[card, { marginBottom: 24 }]}>
        {/* En-tête */}
        <View style={[row, { marginBottom: 16 }]}>
          <IconBox bg="#FFF7ED">
            <MaterialIcons name="set-meal" size={22} color="#F97316" />
          </IconBox>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Alimentation automatique</Text>
            <Text style={sub}>
              {feeder.lastDistribution
                ? `Dernière : ${formatTime(feeder.lastDistribution)}`
                : "Aucune distribution aujourd'hui"}
            </Text>
          </View>
          {feeder.isDistributing && (
            <View
              style={{
                backgroundColor: "#FFF7ED",
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 5,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }}
            >
              <ActivityIndicator size="small" color="#F97316" />
              <Text
                style={{ fontSize: 10, fontWeight: "700", color: "#F97316" }}
              >
                En cours...
              </Text>
            </View>
          )}
        </View>

        {/* Durée */}
        <View
          style={{
            backgroundColor: "#F8FAFC",
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: "#F1F5F9",
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: "700",
              color: "#94A3B8",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Durée de distribution
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity
              onPress={() =>
                setFeeder((p) => ({
                  ...p,
                  durationSec: Math.max(1, p.durationSec - 1),
                }))
              }
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="remove" size={20} color="#64748B" />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: "#1E293B",
                flex: 1,
                textAlign: "center",
              }}
            >
              {feeder.durationSec}s
            </Text>
            <TouchableOpacity
              onPress={() =>
                setFeeder((p) => ({
                  ...p,
                  durationSec: Math.min(30, p.durationSec + 1),
                }))
              }
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="add" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontSize: 10,
              color: "#94A3B8",
              textAlign: "center",
              marginTop: 6,
              fontWeight: "500",
            }}
          >
            Durée d'activation du moteur (1 – 30 sec)
          </Text>
        </View>

        <View
          style={{ height: 1, backgroundColor: "#F1F5F9", marginBottom: 14 }}
        />

        {/* Horaires */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 9,
              fontWeight: "700",
              color: "#94A3B8",
              textTransform: "uppercase",
            }}
          >
            Horaires programmés ({feeder.schedules.length})
          </Text>
          <TouchableOpacity
            onPress={addSchedule}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#F0FDF4",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#22C55E40",
            }}
          >
            <MaterialIcons name="add" size={14} color="#22C55E" />
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#22C55E" }}>
              Ajouter
            </Text>
          </TouchableOpacity>
        </View>

        {feeder.schedules.length === 0 && (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 20,
              backgroundColor: "#F8FAFC",
              borderRadius: 12,
              marginBottom: 14,
            }}
          >
            <MaterialIcons name="schedule" size={28} color="#CBD5E1" />
            <Text
              style={{
                fontSize: 12,
                color: "#94A3B8",
                marginTop: 8,
                fontWeight: "500",
              }}
            >
              Aucun horaire programmé
            </Text>
          </View>
        )}

        {feeder.schedules.map((schedule) => (
          <View
            key={schedule.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              backgroundColor: schedule.enabled ? "#F0FDF4" : "#F8FAFC",
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: schedule.enabled ? "#22C55E30" : "#F1F5F9",
            }}
          >
            <TouchableOpacity
              onPress={() =>
                updateSchedule(schedule.id, "enabled", !schedule.enabled)
              }
            >
              <Toggle value={schedule.enabled} />
            </TouchableOpacity>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() =>
                    updateSchedule(
                      schedule.id,
                      "hour",
                      (schedule.hour + 1) % 24,
                    )
                  }
                >
                  <MaterialIcons
                    name="keyboard-arrow-up"
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: schedule.enabled ? "#1E293B" : "#94A3B8",
                    width: 28,
                    textAlign: "center",
                  }}
                >
                  {pad(schedule.hour)}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    updateSchedule(
                      schedule.id,
                      "hour",
                      (schedule.hour - 1 + 24) % 24,
                    )
                  }
                >
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: schedule.enabled ? "#1E293B" : "#94A3B8",
                  marginBottom: 2,
                }}
              >
                :
              </Text>
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() =>
                    updateSchedule(
                      schedule.id,
                      "minute",
                      (schedule.minute + 5) % 60,
                    )
                  }
                >
                  <MaterialIcons
                    name="keyboard-arrow-up"
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: schedule.enabled ? "#1E293B" : "#94A3B8",
                    width: 28,
                    textAlign: "center",
                  }}
                >
                  {pad(schedule.minute)}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    updateSchedule(
                      schedule.id,
                      "minute",
                      (schedule.minute - 5 + 60) % 60,
                    )
                  }
                >
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={16}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 11,
                fontWeight: "600",
                color: schedule.enabled ? "#22C55E" : "#94A3B8",
                marginLeft: 4,
              }}
            >
              {schedule.enabled ? "● Actif" : "○ Désactivé"}
            </Text>
            <TouchableOpacity
              onPress={() => removeSchedule(schedule.id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: "#FEF2F2",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        <View
          style={{ height: 1, backgroundColor: "#F1F5F9", marginVertical: 14 }}
        />

        {/* Bouton Distribution manuelle */}
        <TouchableOpacity
          onPress={() => distributeFood("manual")}
          disabled={!isConnected || feeder.isDistributing}
          style={{
            padding: 14,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor:
              !isConnected || feeder.isDistributing ? "#F1F5F9" : "#F97316",
            opacity: !isConnected || feeder.isDistributing ? 0.6 : 1,
          }}
        >
          {feeder.isDistributing ? (
            <ActivityIndicator size="small" color="#F97316" />
          ) : (
            <MaterialIcons
              name="restaurant"
              size={18}
              color={!isConnected ? "#94A3B8" : "#fff"}
            />
          )}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "800",
              color: !isConnected || feeder.isDistributing ? "#94A3B8" : "#fff",
            }}
          >
            {feeder.isDistributing
              ? `Distribution... (${feeder.durationSec}s)`
              : "Distribuer maintenant"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ── Micro-composants ──────────────────────────────────────────────────────────

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

function IconBox({ bg, children }) {
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
      }}
    >
      {children}
    </View>
  );
}

function Segment({ options, selected }) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#F1F5F9",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt, i) => (
        <View
          key={i}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 16,
            backgroundColor: selected === i ? "#22C55E" : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: selected === i ? "#fff" : "#94A3B8",
            }}
          >
            {opt}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Toggle({ value }) {
  return (
    <View style={{ width: 46, height: 26 }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: value ? "#22C55E" : "#E2E8F0",
          borderRadius: 13,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 20,
          height: 20,
          left: value ? 22 : 3,
          top: 3,
          borderRadius: 10,
          backgroundColor: "#fff",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 2,
        }}
      />
    </View>
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
const row = { flexDirection: "row", alignItems: "center" };
const labelStyle = { fontSize: 14, fontWeight: "700", color: "#1E293B" };
const sub = { fontSize: 11, color: "#94A3B8", fontWeight: "500", marginTop: 2 };
