import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { controlVentilateur } from "../../../../../services/ventilateurService";

export default function SectionGestionVentilateur({
  poultryId,
  data,
  onUpdate,
}) {
  const [fanOn, setFanOn] = React.useState(data?.status === true);
  const [fanAuto, setFanAuto] = React.useState(data?.mode === "auto");

  React.useEffect(() => {
    setFanOn(data?.status === true);
    setFanAuto(data?.mode === "auto");
  }, [data?.mode, data?.status]);

  const handleToggleAuto = async () => {
    try {
      const newMode = fanAuto ? "manual" : "auto";
      const currentAction = fanOn ? "on" : "off";

      console.log("[SectionGestionVentilateur] Envoi commande ventilateur:", {
        poultryId,
        mode: newMode,
        action: currentAction,
      });

      const response = await controlVentilateur(
        poultryId,
        newMode,
        currentAction,
      );

      console.log("[SectionGestionVentilateur] Réponse API:", response);

      setFanAuto(!fanAuto);
      if (onUpdate) onUpdate();
    } catch (error) {
      const errorMsg =
        error.error ||
        error.message ||
        "Impossible de changer le mode du ventilateur.";
      console.error("[SectionGestionVentilateur] Error:", error);
      Alert.alert("Erreur", errorMsg);
    }
  };

  const handleToggleStatus = async (action) => {
    if (fanAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Veuillez désactiver le mode automatique pour contrôler le ventilateur manuellement.",
      );
      return;
    }

    try {
      console.log("[SectionGestionVentilateur] Envoi commande ventilateur:", {
        poultryId,
        mode: "manual",
        action,
      });

      const response = await controlVentilateur(poultryId, "manual", action);

      console.log("[SectionGestionVentilateur] Réponse API:", response);

      setFanOn(action === "on");
      if (onUpdate) onUpdate();

      Alert.alert(
        "Succès",
        `Ventilateur ${action === "on" ? "démarré" : "arrêté"}`,
      );
    } catch (error) {
      const errorMsg =
        error.error || error.message || "La commande du ventilateur a échoué.";
      console.error("[SectionGestionVentilateur] Error:", error);

      if (errorMsg.includes("Accès non autorisé")) {
        Alert.alert(
          "Authentification requise",
          "Veuillez vous reconnecter pour contrôler le ventilateur.",
        );
      } else {
        Alert.alert("Erreur", errorMsg);
      }
    }
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
              ? "Auto â€” Température"
              : `Manuel â€” ${fanOn ? "● En marche" : "○ Arrêté"}`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleToggleAuto}
          style={styles.segmentWrapper}
        >
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

      {!fanAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => handleToggleStatus("on")}
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
            onPress={() => handleToggleStatus("off")}
            disabled={!fanOn}
            style={[styles.btn, styles.btnOff]}
          >
            <MaterialIcons name="stop" size={16} color="#EF4444" />
            <Text style={[styles.btnText, { color: "#EF4444" }]}>Arrêter</Text>
          </TouchableOpacity>
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
  segmentWrapper: {
    overflow: "hidden",
    borderRadius: 100,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  segmentActive: { backgroundColor: "#22C55E" },
  segmentText: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  textWhite: { color: "#fff" },
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
  btnDisabled: { backgroundColor: "#F0FDF4", opacity: 0.6 },
  btnText: { fontSize: 12, fontWeight: "700" },
});
