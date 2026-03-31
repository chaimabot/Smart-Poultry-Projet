import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

export default function ActuatorsSection({
  darkMode,
  poultryId,
  actuators,
  onControl,
}) {
  const [mode, setMode] = useState("auto");

  const toggleMode = () => {
    const newMode = mode === "auto" ? "manu" : "auto";
    setMode(newMode);
    // Call backend API
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Actionneurs</Text>

      {/* Ventilateur */}
      <BlurView intensity={20} style={styles.actuatorCard}>
        <View style={styles.actuatorRow}>
          <View style={styles.actuatorLeft}>
            <View style={[styles.actuatorIconWrap, styles.active]}>
              <MaterialIcons name="cyclone" size={24} color="#1a4a2e" />
            </View>
            <View>
              <Text style={styles.actuatorName}>Ventilateur</Text>
              <Text style={styles.actuatorSub}>
                Mode auto — seuils CO2 / Temp
              </Text>
            </View>
          </View>
          <View style={styles.modePill}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "auto" && styles.modeBtnActive]}
              onPress={toggleMode}
            >
              <Text style={styles.modeBtnText}>AUTO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === "manu" && styles.modeBtnActive]}
              onPress={toggleMode}
            >
              <Text style={styles.modeBtnText}>MANU</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      {/* Lampe */}
      <BlurView intensity={20} style={styles.actuatorCard}>
        <View style={styles.actuatorRow}>
          <View style={styles.actuatorLeft}>
            <View style={[styles.actuatorIconWrap, styles.active]}>
              <MaterialIcons name="lightbulb" size={24} color="#1a4a2e" />
            </View>
            <View>
              <Text style={styles.actuatorName}>Lampe Chauffante</Text>
              <Text style={[styles.actuatorSub, styles.on]}>Statut : ON</Text>
            </View>
          </View>
          {/* Toggle switch exact du HTML */}
          <View style={styles.toggleWrap}>
            <TouchableOpacity style={styles.toggle}>
              <View style={styles.toggleSlider} />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      {/* Porte */}
      <BlurView intensity={20} style={styles.actuatorCard}>
        <View style={styles.actuatorRow}>
          <View style={styles.actuatorLeft}>
            <View style={styles.actuatorIconWrap}>
              <MaterialIcons name="sensor_door" size={24} color="#4a6655" />
            </View>
            <View>
              <Text style={styles.actuatorName}>Porte Automatique</Text>
              <Text style={styles.actuatorSub}>Fermée actuellement</Text>
            </View>
          </View>
          <View style={styles.modePill}>
            <TouchableOpacity style={[styles.modeBtn, styles.modeBtnActive]}>
              <Text style={styles.modeBtnText}>HORAIRE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeBtn}>
              <Text style={styles.modeBtnText}>MANU</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Horaires */}
        <View style={styles.scheduleRow}>
          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleLabel}>Ouverture</Text>
            <TouchableOpacity style={styles.timeInput}>
              <Text>07:00</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.scheduleItem}>
            <Text style={styles.scheduleLabel}>Fermeture</Text>
            <TouchableOpacity style={styles.timeInput}>
              <Text>18:00</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Boutons manuels */}
        <View style={styles.doorBtns}>
          <TouchableOpacity style={styles.doorBtn}>
            <MaterialIcons name="lock_open" size={16} />
            <Text>Ouvrir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doorBtn}>
            <MaterialIcons name="lock" size={16} />
            <Text>Fermer</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#7a9986",
    marginBottom: 10,
  },
  actuatorCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddeae0",
  },
  actuatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actuatorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actuatorIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#eef3ee",
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    backgroundColor: "#d4eddf",
  },
  actuatorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0e1f16",
  },
  actuatorSub: {
    fontSize: 10,
    color: "#7a9986",
    fontWeight: "500",
    marginTop: 2,
  },
  on: {
    color: "#2d7a4f",
    fontWeight: "700",
  },
  modePill: {
    flexDirection: "row",
    backgroundColor: "#eef3ee",
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "700",
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "#7a9986",
  },
  modeBtnActive: {
    backgroundColor: "#1a4a2e",
    color: "white",
  },
  toggleWrap: {
    // Toggle styles from HTML
  },
  toggle: {
    width: 44,
    height: 24,
    position: "relative",
  },
  toggleSlider: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#eef3ee",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddeae0",
  },
  scheduleRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ddeae0",
  },
  scheduleItem: {
    flex: 1,
    backgroundColor: "#eef3ee",
    borderRadius: 10,
    padding: 8,
  },
  scheduleLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#7a9986",
    textTransform: "uppercase",
    letterSpacing: 0.1,
    marginBottom: 4,
  },
  timeInput: {
    fontFamily: "monospace",
    fontSize: 16,
    fontWeight: "600",
    color: "#0e1f16",
  },
  doorBtns: {
    display: "flex",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#ddeae0",
  },
  doorBtn: {
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: "600",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#ddeae0",
    backgroundColor: "#f7faf7",
    color: "#0e1f16",
  },
});
