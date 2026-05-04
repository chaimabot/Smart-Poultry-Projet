import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import SectionGestionEau from "./sectionControlsTab/SectionGestionEau";
import SectionGestionLampe from "./sectionControlsTab/SectionGestionLampe";
import SectionGestionVentilateur from "./sectionControlsTab/SectionGestionVentilateur";
import SectionGestionPorte from "./sectionControlsTab/SectionGestionPorte";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(date) {
  if (!date) return null;
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Composants atomiques réutilisables ───────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 14,
        marginTop: 8,
      }}
    >
      <View
        style={{
          width: 4,
          height: 18,
          borderRadius: 2,
          backgroundColor: "#22C55E",
          marginRight: 10,
        }}
      />
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "#64748B",
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function Card({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 3,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function IconBox({ bg, icon, color, size = 22 }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
      }}
    >
      <MaterialIcons name={icon} size={size} color={color} />
    </View>
  );
}

function Badge({ children, bg, color, icon }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
      }}
    >
      {icon && <MaterialIcons name={icon} size={12} color={color} />}
      <Text style={{ fontSize: 10, fontWeight: "700", color }}>{children}</Text>
    </View>
  );
}

function Stepper({ value, onDecrement, onIncrement, min, max, unit, label }) {
  return (
    <View
      style={{
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
      }}
    >
      {label && (
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#94A3B8",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 12,
          }}
        >
          {label}
        </Text>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <TouchableOpacity
          onPress={onDecrement}
          activeOpacity={0.7}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
          <MaterialIcons name="remove" size={20} color="#64748B" />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#0F172A",
            flex: 1,
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          }}
        >
          {value}
          {unit && (
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#94A3B8" }}>
              {unit}
            </Text>
          )}
        </Text>
        <TouchableOpacity
          onPress={onIncrement}
          activeOpacity={0.7}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 1,
          }}
        >
          <MaterialIcons name="add" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Toggle({ value, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={{ width: 50, height: 28 }}>
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: value ? "#22C55E" : "#CBD5E1",
            borderRadius: 14,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            width: 22,
            height: 22,
            left: value ? 26 : 2,
            top: 3,
            borderRadius: 11,
            backgroundColor: "#fff",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 3,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

function TimePicker({
  hour,
  minute,
  onHourUp,
  onHourDown,
  onMinuteUp,
  onMinuteDown,
  enabled,
}) {
  const textColor = enabled ? "#0F172A" : "#94A3B8";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ alignItems: "center" }}>
        <TouchableOpacity onPress={onHourUp} hitSlop={{ top: 10, bottom: 5 }}>
          <MaterialIcons name="keyboard-arrow-up" size={18} color="#94A3B8" />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: textColor,
            width: 32,
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          }}
        >
          {pad(hour)}
        </Text>
        <TouchableOpacity onPress={onHourDown} hitSlop={{ top: 5, bottom: 10 }}>
          <MaterialIcons name="keyboard-arrow-down" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: textColor,
          marginBottom: 2,
        }}
      >
        :
      </Text>
      <View style={{ alignItems: "center" }}>
        <TouchableOpacity onPress={onMinuteUp} hitSlop={{ top: 10, bottom: 5 }}>
          <MaterialIcons name="keyboard-arrow-up" size={18} color="#94A3B8" />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: textColor,
            width: 32,
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          }}
        >
          {pad(minute)}
        </Text>
        <TouchableOpacity
          onPress={onMinuteDown}
          hitSlop={{ top: 5, bottom: 10 }}
        >
          <MaterialIcons name="keyboard-arrow-down" size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: "#F1F5F9", marginVertical: 16 }}
    />
  );
}

function EmptyState({ icon, text }) {
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 24,
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#F1F5F9",
      }}
    >
      <MaterialIcons name={icon} size={32} color="#CBD5E1" />
      <Text
        style={{
          fontSize: 13,
          color: "#94A3B8",
          marginTop: 10,
          fontWeight: "500",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

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
        paddingTop: 24,
        paddingBottom: 48,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Actionneurs ── */}
      <SectionLabel>Actionneurs</SectionLabel>
      <View style={{ gap: 12, marginBottom: 28 }}>
        {/* Ventilateur */}
        <SectionGestionVentilateur
          fanOn={actuators.fan}
          fanAuto={actuators.fanAuto}
          onToggleAuto={toggleFanAuto}
          onFanOn={() => setFan(true)}
          onFanOff={() => setFan(false)}
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

      {/* ── Pompe à Eau ── */}
      <SectionLabel>Gestion de l'eau</SectionLabel>
      <SectionGestionEau
        poultryId={poultryId}
        data={pumpData || { pumpAuto: false, pumpOn: false }}
        onUpdate={onRefresh}
      />

      {/* ── Distributeur de nourriture ── */}
      <SectionLabel>Distributeur de nourriture</SectionLabel>
      <Card style={{ marginBottom: 24 }}>
        {/* En-tête */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <IconBox bg="#FFF7ED" icon="set-meal" color="#F97316" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>
              Alimentation automatique
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: "#94A3B8",
                fontWeight: "500",
                marginTop: 3,
              }}
            >
              {feeder.lastDistribution
                ? `Dernière : ${formatTime(feeder.lastDistribution)}`
                : "Aucune distribution aujourd'hui"}
            </Text>
          </View>
          {feeder.isDistributing && (
            <Badge bg="#FFF7ED" color="#F97316" icon="sync">
              En cours
            </Badge>
          )}
        </View>

        {/* Durée */}
        <Stepper
          label="Durée de distribution"
          value={feeder.durationSec}
          unit="s"
          min={1}
          max={30}
          onDecrement={() =>
            setFeeder((p) => ({
              ...p,
              durationSec: Math.max(1, p.durationSec - 1),
            }))
          }
          onIncrement={() =>
            setFeeder((p) => ({
              ...p,
              durationSec: Math.min(30, p.durationSec + 1),
            }))
          }
        />
        <Text
          style={{
            fontSize: 11,
            color: "#94A3B8",
            textAlign: "center",
            marginTop: 8,
            fontWeight: "500",
          }}
        >
          Durée d'activation du moteur (1 – 30 secondes)
        </Text>

        <Divider />

        {/* Horaires */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "800",
              color: "#94A3B8",
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Horaires programmés ({feeder.schedules.length})
          </Text>
          <TouchableOpacity
            onPress={addSchedule}
            activeOpacity={0.8}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: "#F0FDF4",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#22C55E30",
            }}
          >
            <MaterialIcons name="add" size={14} color="#22C55E" />
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#22C55E" }}>
              Ajouter
            </Text>
          </TouchableOpacity>
        </View>

        {feeder.schedules.length === 0 && (
          <EmptyState icon="schedule" text="Aucun horaire programmé" />
        )}

        {feeder.schedules.map((schedule) => (
          <View
            key={schedule.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              backgroundColor: schedule.enabled ? "#F0FDF4" : "#F8FAFC",
              padding: 12,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: schedule.enabled ? "#22C55E25" : "#E2E8F0",
            }}
          >
            <Toggle
              value={schedule.enabled}
              onPress={() =>
                updateSchedule(schedule.id, "enabled", !schedule.enabled)
              }
            />

            <TimePicker
              hour={schedule.hour}
              minute={schedule.minute}
              enabled={schedule.enabled}
              onHourUp={() =>
                updateSchedule(schedule.id, "hour", (schedule.hour + 1) % 24)
              }
              onHourDown={() =>
                updateSchedule(
                  schedule.id,
                  "hour",
                  (schedule.hour - 1 + 24) % 24,
                )
              }
              onMinuteUp={() =>
                updateSchedule(
                  schedule.id,
                  "minute",
                  (schedule.minute + 5) % 60,
                )
              }
              onMinuteDown={() =>
                updateSchedule(
                  schedule.id,
                  "minute",
                  (schedule.minute - 5 + 60) % 60,
                )
              }
            />

            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: schedule.enabled ? "#22C55E" : "#94A3B8",
                }}
              >
                {schedule.enabled ? "● Actif" : "○ Inactif"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => removeSchedule(schedule.id)}
              activeOpacity={0.7}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: "#FEF2F2",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#FECACA",
              }}
            >
              <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        <Divider />

        {/* Bouton Distribution manuelle */}
        <TouchableOpacity
          onPress={() => distributeFood("manual")}
          disabled={!isConnected || feeder.isDistributing}
          activeOpacity={0.8}
          style={{
            padding: 16,
            borderRadius: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            backgroundColor:
              !isConnected || feeder.isDistributing ? "#F1F5F9" : "#F97316",
            opacity: !isConnected || feeder.isDistributing ? 0.5 : 1,
            borderWidth: !isConnected || feeder.isDistributing ? 1 : 0,
            borderColor: "#E2E8F0",
          }}
        >
          {feeder.isDistributing ? (
            <ActivityIndicator size="small" color="#F97316" />
          ) : (
            <MaterialIcons
              name="restaurant"
              size={20}
              color={!isConnected ? "#94A3B8" : "#fff"}
            />
          )}
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: !isConnected || feeder.isDistributing ? "#94A3B8" : "#fff",
              letterSpacing: 0.3,
            }}
          >
            {feeder.isDistributing
              ? `Distribution en cours... (${feeder.durationSec}s)`
              : "Distribuer maintenant"}
          </Text>
        </TouchableOpacity>

        {!isConnected && (
          <Text
            style={{
              fontSize: 11,
              color: "#94A3B8",
              textAlign: "center",
              marginTop: 10,
              fontWeight: "500",
            }}
          >
            Connectez-vous au poulailler pour distribuer
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}
