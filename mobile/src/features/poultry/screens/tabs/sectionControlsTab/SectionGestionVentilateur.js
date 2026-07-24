// components/SectionGestionVentilateur.jsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

export default function SectionGestionVentilateur({
  fanOn,
  fanAuto,
  fanAutoReason, //   Raison du déclenchement AUTO (depuis backend)
  onToggleAuto,
  onFanOn,
  onFanOff,
}) {
  const handleManualOn = () => {
    if (fanAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Désactivez le mode automatique pour contrôler manuellement.",
      );
      return;
    }
    onFanOn?.();
  };

  const handleManualOff = () => {
    if (fanAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Désactivez le mode automatique pour contrôler manuellement.",
      );
      return;
    }
    onFanOff?.();
  };

  return (
    <View style={styles.card}>
      <View style={[styles.row, { marginBottom: fanAuto ? 0 : 14 }]}>
        <View style={[styles.iconBox, { backgroundColor: "#F0FDF4" }]}>
          <MaterialIcons name="cyclone" size={22} color="#22C55E" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Ventilateur</Text>
          <Text style={styles.sub}>
            {fanAuto
              ? `Auto — ${fanOn ? "● En marche" : "○ En attente"}`
              : `Manuel — ${fanOn ? "● En marche" : "○ Arrêté"}`}
          </Text>
        </View>

        {/* Toggle AUTO / MANU */}
        <TouchableOpacity onPress={onToggleAuto} style={styles.segmentWrapper}>
          <View style={styles.segment}>
            <View style={[styles.segmentBtn, fanAuto && styles.segmentActive]}>
              <Text style={[styles.segmentText, fanAuto && styles.textWhite]}>
                AUTO
              </Text>
            </View>
            <View style={[styles.segmentBtn, !fanAuto && styles.segmentActive]}>
              <Text style={[styles.segmentText, !fanAuto && styles.textWhite]}>
                MANU
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/*   Afficher la raison en mode AUTO (vient du backend) */}
      {fanAuto && fanAutoReason && (
        <View
          style={[
            styles.reasonBox,
            fanOn ? styles.reasonBoxActive : styles.reasonBoxIdle,
          ]}
        >
          <MaterialIcons
            name={fanOn ? "warning-amber" : "check-circle-outline"}
            size={14}
            color={fanOn ? "#F59E0B" : "#22C55E"}
          />
          <Text
            style={[
              styles.reasonText,
              { color: fanOn ? "#92400E" : "#166534" },
            ]}
          >
            {fanAutoReason}
          </Text>
        </View>
      )}

      {/* Boutons manuels */}
      {!fanAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={handleManualOn}
            disabled={fanOn}
            style={[styles.btn, styles.btnOn, fanOn && styles.btnDisabled]}
          >
            <MaterialIcons
              name="play-arrow"
              size={16}
              color={fanOn ? "#22C55E" : "#fff"}
            />
            <Text
              style={[styles.btnText, { color: fanOn ? "#22C55E" : "#fff" }]}
            >
              Démarrer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleManualOff}
            disabled={!fanOn}
            style={[styles.btn, styles.btnOff, !fanOn && styles.btnDisabled]}
          >
            <MaterialIcons name="stop" size={16} color="#EF4444" />
            <Text style={[styles.btnText, { color: "#EF4444" }]}>Arrêter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/*   Info mode auto - mis à jour : c'est le SERVEUR qui contrôle */}
      {fanAuto && (
        <View style={styles.autoInfo}>
          <MaterialIcons name="cloud-done" size={13} color="#22C55E" />
          <Text style={styles.autoInfoText}>
            Le serveur surveille les seuils en continu et commande le
            ventilateur automatiquement, 24h/24
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 10,
    elevation: 2,
  },
  row: { flexDirection: "row", alignItems: "center" },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  label: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  sub: { fontSize: 11, color: "#94A3B8", fontWeight: "500", marginTop: 2 },
  segmentWrapper: { overflow: "hidden", borderRadius: 100 },
  segment: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  segmentBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  segmentActive: { backgroundColor: "#22C55E" },
  segmentText: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  textWhite: { color: "#fff" },

  //   Style pour la raison AUTO - dynamique selon état
  reasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
  },
  reasonBoxActive: {
    backgroundColor: "#FEF3C7",
    borderLeftColor: "#F59E0B",
  },
  reasonBoxIdle: {
    backgroundColor: "#F0FDF4",
    borderLeftColor: "#22C55E",
  },
  reasonText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },

  btn: {
    flex: 1,
    padding: 11,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
  },
  btnOn: { backgroundColor: "#22C55E", borderColor: "#22C55E40" },
  btnOff: { backgroundColor: "#F8FAFC", borderColor: "#F1F5F9" },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 12, fontWeight: "700" },
  autoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  autoInfoText: { fontSize: 10, color: "#166534", flex: 1, fontWeight: "500" },
});
