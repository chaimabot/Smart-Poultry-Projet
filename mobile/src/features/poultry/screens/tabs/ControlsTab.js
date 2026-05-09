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
  togglePumpAuto,
  pumpAutoReason,
  setFan,
  fanAutoReason,
  lampAutoReason,
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
          fanAutoReason={fanAutoReason} // ← AJOUTE ÇA !
          onToggleAuto={toggleFanAuto}
          onFanOn={() => setFan(true)}
          onFanOff={() => setFan(false)}
        />

        <SectionGestionLampe
          poultryId={poultryId}
          data={{
            lampOn: actuators.lamp ?? false, // ← boolean extrait proprement
            lampAuto: actuators.lampAuto ?? false, // ← boolean extrait proprement
          }}
          onUpdate={onRefresh}
          onToggleAuto={toggleLampAuto}
          lampAutoReason={lampAutoReason}
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
        data={pumpData}
        pumpAutoReason={pumpAutoReason}
        onToggleAuto={togglePumpAuto}
        onUpdate={onRefresh}
      />
    </ScrollView>
  );
}
