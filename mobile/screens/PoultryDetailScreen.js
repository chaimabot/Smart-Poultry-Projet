import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { getPoultryDetails } from "../services/poultry";
import SensorCard from "../components/SensorCard";
import TrendChart from "../components/TrendChart";
import ControlsTab from "../../src/features/poultry/screens/tabs/ControlsTab";
import usePoultryState from "../../src/hooks/usePoultryState";

const PoultryDetailScreen = ({ route }) => {
  const { id: poultryId } = route.params;
  const [poultry, setPoultry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("monitoring"); // 'monitoring' | 'controls'

  // Feeder state (local - TODO: sync with backend if exists)
  const [feeder, setFeeder] = useState({
    schedules: [],
    durationSec: 5,
    isDistributing: false,
    lastDistribution: null,
  });

  // usePoultryState hook for real-time data
  const {
    loading: hookLoading,
    refreshing: hookRefreshing,
    isConnected,
    actuators,
    pumpData,
    doorMode,
    setDoorMode,
    doorSchedule,
    setDoorSchedule,
    toggleFanAuto,
    setFan,
    fanAutoReason,
    toggleLampAuto,
    setLamp,
    lampAutoReason,
    onRefresh: refreshPoultry,
    poultryInfo,
    // Door handlers (TODO: implement proper API calls)
    toggleDoor = () => console.log("toggleDoor"),
    stopDoor = () => console.log("stopDoor"),
    doorMoving = false,
  } = usePoultryState({ poultryId, poultryName: poultry?.name });

  const fetchBasicData = useCallback(async () => {
    try {
      console.log(
        `[PoultryDetail] Récupération données poulailler ${poultryId}...`,
      );
      const data = await getPoultryDetails(poultryId);
      console.log(`[PoultryDetail] Données:`, data);
      setPoultry(data);
    } catch (err) {
      console.error(`[PoultryDetail] Erreur:`, err.message);
      setError("Impossible de charger les données");
    }
  }, [poultryId]);

  useEffect(() => {
    fetchBasicData();
    const interval = setInterval(fetchBasicData, 30000);
    return () => clearInterval(interval);
  }, [fetchBasicData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchBasicData(), refreshPoultry()]);
    setRefreshing(false);
  };

  // Feeder handlers
  const distributeFood = (type) => {
    console.log(`Distribuer nourriture (${type})`);
    setFeeder((prev) => ({ ...prev, isDistributing: true }));
    setTimeout(() => {
      setFeeder((prev) => ({
        ...prev,
        isDistributing: false,
        lastDistribution: new Date(),
      }));
    }, 5000);
  };

  const addSchedule = () => {
    const id = Date.now().toString();
    setFeeder((prev) => ({
      ...prev,
      schedules: [
        ...prev.schedules,
        {
          id,
          hour: 12,
          minute: 0,
          enabled: true,
        },
      ],
    }));
  };

  const removeSchedule = (id) => {
    setFeeder((prev) => ({
      ...prev,
      schedules: prev.schedules.filter((s) => s.id !== id),
    }));
  };

  const updateSchedule = (id, field, value) => {
    setFeeder((prev) => ({
      ...prev,
      schedules: prev.schedules.map((s) =>
        s.id === id ? { ...s, [field]: value } : s,
      ),
    }));
  };

  const isLoading = loading || hookLoading;

  if (isLoading && !poultry) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 10 }}>Chargement...</Text>
      </View>
    );
  }

  if (!poultry) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red" }}>{error || "Poulailler non trouvé"}</Text>
      </View>
    );
  }

  const monitoring = poultry.lastMonitoring;
  const hasData = monitoring && monitoring.timestamp;

  const sensors = [
    {
      label: "Température",
      value: monitoring?.temperature,
      unit: "°C",
      icon: "🌡️",
    },
    { label: "Humidité", value: monitoring?.humidity, unit: "%", icon: "💧" },
    { label: "CO2", value: monitoring?.co2, unit: "ppm", icon: "💨" },
    { label: "NH3", value: monitoring?.nh3, unit: "ppm", icon: "🔬" },
    { label: "Poussière", value: monitoring?.dust, unit: "mg/m³", icon: "✨" },
    { label: "Eau", value: monitoring?.waterLevel, unit: "%", icon: "🚰" },
  ];

  const lastUpdated = monitoring?.timestamp
    ? new Date(monitoring.timestamp).toLocaleString("fr-FR")
    : "Données en attente...";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{poultryInfo.name || poultry.name}</Text>
        <Text style={styles.subtitle}>
          {poultryInfo.location || poultry.location}
        </Text>
        <Text style={styles.connectionStatus}>
          {isConnected ? "🟢 Connecté" : "🔴 Hors ligne"}
        </Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "monitoring" && styles.tabActive,
          ]}
          onPress={() => setActiveTab("monitoring")}
        >
          <MaterialIcons
            name="dashboard"
            size={20}
            color={activeTab === "monitoring" ? "#0066cc" : "#999"}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "monitoring" && styles.tabTextActive,
            ]}
          >
            Monitoring
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === "controls" && styles.tabActive,
          ]}
          onPress={() => setActiveTab("controls")}
        >
          <MaterialIcons
            name="tune"
            size={20}
            color={activeTab === "controls" ? "#0066cc" : "#999"}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "controls" && styles.tabTextActive,
            ]}
          >
            Contrôles
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "monitoring" ? (
          <>
            <View style={styles.statusBar}>
              <Text style={styles.lastUpdate}>
                Dernière mise à jour: {lastUpdated}
              </Text>
            </View>

            {hasData ? (
              <>
                <View style={styles.sensorsGrid}>
                  {sensors.map((sensor, index) => (
                    <SensorCard
                      key={index}
                      label={sensor.label}
                      value={sensor.value}
                      unit={sensor.unit}
                      icon={sensor.icon}
                    />
                  ))}
                </View>

                <View style={styles.chartSection}>
                  <Text style={styles.sectionTitle}>
                    Tendance Température (24h)
                  </Text>
                  <TrendChart poultryId={poultryId} metric="temperature" />
                </View>
              </>
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>
                  ⏳ En attente des données du capteur...
                </Text>
                <Text style={styles.placeholderSubtext}>
                  Assurez-vous que l'ESP32 est alimenté et connecté au réseau
                  MQTT
                </Text>
              </View>
            )}
          </>
        ) : (
          <ControlsTab
            isConnected={isConnected}
            actuators={actuators}
            toggleFanAuto={toggleFanAuto}
            setFan={setFan}
            fanAutoReason={fanAutoReason}
            toggleLampAuto={toggleLampAuto}
            setLamp={setLamp}
            toggleDoor={toggleDoor}
            stopDoor={stopDoor}
            doorMoving={doorMoving}
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
            poultryId={poultryId}
            pumpData={pumpData}
            onRefresh={refreshPoultry}
          />
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: "#0066cc",
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#ddd",
    marginBottom: 4,
  },
  connectionStatus: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "500",
  },
  tabHeader: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#0066cc",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#999",
  },
  tabTextActive: {
    color: "#0066cc",
    fontWeight: "700",
  },
  content: {
    flex: 1,
  },
  statusBar: {
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  lastUpdate: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  sensorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
  },
  chartSection: {
    padding: 16,
    backgroundColor: "#fff",
    margin: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  placeholder: {
    padding: 40,
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
  },
  placeholderSubtext: {
    fontSize: 12,
    color: "#ccc",
    marginTop: 10,
    textAlign: "center",
  },
});

export default PoultryDetailScreen;
