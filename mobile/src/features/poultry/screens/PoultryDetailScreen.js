// screens/PoultryDetailScreen.jsx
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";

import usePoultryState from "../../../hooks/usePoultryState";
import NotificationPopup from "../../../components/NotificationPopup";
import OverviewTab from "./tabs/OverviewTab";
import ControlsTab from "./tabs/ControlsTab";
import HistoryTab from "./tabs/HistoryTab";

// ── Config ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Aperçu", icon: "dashboard" },
  { key: "controls", label: "Contrôles", icon: "tune" },
  { key: "history", label: "Historique", icon: "history" },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PoultryDetailScreen({ route, navigation }) {
  const { poultryId, poultryName } = route?.params || {};
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState("overview");
  const [showNotifPopup, setShowNotifPopup] = useState(false);

  const {
    // state
    loading,
    refreshing,
    isConnected,
    alertCount,
    alerts,
    thresholds,
    sensors,
    poultryInfo,
    actuators,
    feeder,
    setFeeder,
    pumpData,
    doorMode,
    setDoorMode,
    doorSchedule,
    setDoorSchedule,
    pulseAnim,
    stopDoor,
    // handlers
    toggleFanAuto,
    toggleLampAuto,
    setFan,
    setLamp,
    toggleDoor,
    distributeFood,
    addSchedule,
    removeSchedule,
    updateSchedule,
    updateActuator,
    markAllRead,
    onRefresh,
  } = usePoultryState({ poultryId, poultryName });

  // ── FIX 1 : attendre que poultryInfo soit disponible ─────────────────────
  // `loading` peut passer à false avant que le backend renvoie poultryInfo.
  // On garde l'écran de chargement tant que l'objet est absent ou vide.
  if (loading || !poultryInfo) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#fff",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#22C55E" />
        <Text
          style={{
            marginTop: 12,
            color: "#94A3B8",
            fontSize: 13,
            fontWeight: "500",
          }}
        >
          Connexion MQTT...
        </Text>
      </SafeAreaView>
    );
  }

  // ── Valeur de secours pour le nom (FIX 2) ────────────────────────────────
  // Utilisée partout où poultryInfo.name est lu, au cas où le champ
  // arriverait null/undefined même après le guard ci-dessus.
  const displayName = poultryInfo?.name || poultryName || "Poulailler";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View
        style={{
          backgroundColor: "#fff",
          paddingTop: Platform.OS === "ios" ? insets.top + 8 : 12,
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
        {/* Back button */}
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

        {/* Title + connection status */}
        <View style={{ flex: 1, alignItems: "center", marginHorizontal: 12 }}>
          {/* ✅ FIX 2 — sécurisé avec displayName */}
          <Text
            style={{ fontSize: 16, fontWeight: "800", color: "#1E293B" }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <Animated.View
              style={{
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: isConnected ? "#22C55E" : "#EF4444",
                transform: [{ scale: isConnected ? pulseAnim : 1 }],
              }}
            />
            <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "500" }}>
              {isConnected ? "MQTT connecté" : "Hors ligne"}
            </Text>
          </View>
        </View>

        {/* Right actions */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Notifications */}
          <TouchableOpacity
            onPress={() => setShowNotifPopup(true)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={alertCount > 0 ? "notifications" : "notifications-outline"}
              size={22}
              color="#1E293B"
            />
            {alertCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: "#EF4444",
                  borderWidth: 1.5,
                  borderColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: "700",
                    lineHeight: 13,
                  }}
                >
                  {alertCount > 99 ? "99+" : alertCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Threshold config */}
          <TouchableOpacity
            onPress={() =>
              navigation.navigate("AlertSettingsScreen", {
                poultryId,
                // ✅ FIX 2 — sécurisé avec displayName
                poultryName: displayName,
              })
            }
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F0FDF4",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialIcons name="tune" size={20} color="#22C55E" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar ── */}
      <View
        style={{
          backgroundColor: "#fff",
          flexDirection: "row",
          borderBottomWidth: 1,
          borderBottomColor: "#F1F5F9",
          paddingHorizontal: 16,
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 12,
                borderBottomWidth: 2.5,
                borderBottomColor: active ? "#22C55E" : "transparent",
                gap: 4,
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={tab.icon}
                size={20}
                color={active ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: active ? "700" : "500",
                  color: active ? "#22C55E" : "#94A3B8",
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tab content ── */}
      <View style={{ flex: 1 }}>
        {activeTab === "overview" && (
          <OverviewTab
            refreshing={refreshing}
            onRefresh={onRefresh}
            poultryInfo={poultryInfo}
            isConnected={isConnected}
            sensors={sensors}
            thresholds={thresholds}
          />
        )}
        {activeTab === "controls" && (
          <ControlsTab
            isConnected={isConnected}
            actuators={actuators}
            toggleFanAuto={toggleFanAuto}
            setFan={setFan}
            toggleLampAuto={toggleLampAuto}
            setLamp={setLamp}
            toggleDoor={toggleDoor}
            stopDoor={stopDoor}
            doorMoving={actuators?.doorMoving}
            doorMode={doorMode}
            setDoorMode={setDoorMode}
            doorSchedule={doorSchedule}
            setDoorSchedule={setDoorSchedule}
            feeder={feeder}
            setFeeder={setFeeder}
            distributeFood={distributeFood}
            addSchedule={addSchedule}
            removeSchedule={removeSchedule}
            updateSchedule={updateSchedule}
            onUpdateActuator={updateActuator}
            poultryId={poultryId}
            pumpData={pumpData}
            onRefresh={onRefresh}
          />
        )}
        {activeTab === "history" && (
          <HistoryTab
            alerts={alerts}
            onMarkAllRead={markAllRead}
            onRefresh={onRefresh}
            refreshing={refreshing}
            navigation={navigation}
            poultryId={poultryId}
            // ✅ FIX 2 — sécurisé avec displayName
            poultryName={displayName}
          />
        )}
      </View>

      {/* ── Notification popup ── */}
      {showNotifPopup && (
        <NotificationPopup
          alerts={alerts}
          onClose={() => setShowNotifPopup(false)}
          onMarkAllRead={markAllRead}
          onViewAll={() => {
            setShowNotifPopup(false);
            navigation.navigate("AlertSettingsScreen", {
              poultryId,
              poultryName: displayName,
            });
          }}
        />
      )}
    </SafeAreaView>
  );
}
