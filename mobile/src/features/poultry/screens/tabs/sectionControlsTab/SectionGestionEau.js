import React from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { controlPump } from "../../../../../services/pompeService";

const SectionGestionEau = ({ poultryId, data, onUpdate }) => {
  const [pumpOn, setPumpOn] = React.useState(data.pumpOn);
  const [pumpAuto, setPumpAuto] = React.useState(data.pumpAuto);

  React.useEffect(() => {
    setPumpOn(data.pumpOn);
    setPumpAuto(data.pumpAuto);
  }, [data.pumpOn, data.pumpAuto]);

  const handleToggleAuto = async () => {
    try {
      const newMode = pumpAuto ? "manual" : "auto";
      const currentAction = pumpOn ? "on" : "off";
      await controlPump(poultryId, newMode, currentAction);
      setPumpAuto(!pumpAuto);
      if (onUpdate) onUpdate();
    } catch (error) {
      const errorMsg =
        error.error ||
        error.message ||
        "Impossible de changer le mode de la pompe.";
      console.error("[SectionGestionEau] Error:", error);
      Alert.alert("Erreur", errorMsg);
    }
  };

  const handleToggleStatus = async (action) => {
    if (pumpAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Veuillez désactiver le mode automatique pour contrôler la pompe manuellement.",
      );
      return;
    }

    try {
      const response = await controlPump(poultryId, "manual", action);
      setPumpOn(action === "on");
      if (onUpdate) onUpdate();
      Alert.alert(
        "Succès",
        `Pompe ${action === "on" ? "démarrée" : "arrêtée"}`,
      );
    } catch (error) {
      const errorMsg =
        error.error || error.message || "La commande de la pompe a échoué.";
      console.error("[SectionGestionEau] Error:", error);
      if (errorMsg.includes("Accès non autorisé")) {
        Alert.alert(
          "Authentification requise",
          "Veuillez vous reconnecter pour contrôler la pompe.",
        );
      } else {
        Alert.alert("Erreur", errorMsg);
      }
    }
  };

  return (
    <View style={[styles.container, styles.card]}>
      {/* En-tête */}
      <View style={[styles.row, { marginBottom: pumpAuto ? 0 : 14 }]}>
        <View style={styles.iconBox}>
          <MaterialIcons name="water-drop" size={22} color="#0EA5E9" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.labelStyle}>Pompe à Eau</Text>
          <Text style={styles.sub}>
            {pumpAuto
              ? "Auto — Niveau d'eau"
              : `Manuel — ${pumpOn ? "● En marche" : "○ Arrêtée"}`}
          </Text>
        </View>
        <TouchableOpacity onPress={handleToggleAuto}>
          <Segment options={["AUTO", "MANU"]} selected={pumpAuto ? 0 : 1} />
        </TouchableOpacity>
      </View>

      {/* Boutons de contrôle manuel */}
      {!pumpAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => handleToggleStatus("on")}
            disabled={pumpOn}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 999,
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: pumpOn ? "#F0F7FE" : "#0EA5E9",
              borderWidth: 1,
              borderColor: "#0EA5E940",
              opacity: !pumpOn ? 1 : 0.5,
            }}
          >
            <MaterialIcons
              name="play-arrow"
              size={16}
              color={pumpOn ? "#0EA5E9" : "#fff"}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: pumpOn ? "#0EA5E9" : "#fff",
              }}
            >
              Démarrer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleToggleStatus("off")}
            disabled={!pumpOn}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 999,
              overflow: "hidden",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: pumpOn ? "#FEF2F2" : "#F8FAFC",
              borderWidth: 1,
              borderColor: pumpOn ? "#EF444440" : "#F1F5F9",
              opacity: pumpOn ? 1 : 0.5,
            }}
          >
            <MaterialIcons name="stop" size={16} color="#EF4444" />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: "#EF4444",
              }}
            >
              Arrêter
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

function Segment({ options, selected }) {
  const [height, setHeight] = React.useState(0);
  const radius = height > 0 ? height / 2 : 999;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#F1F5F9",
        borderRadius: radius,
        padding: 3,
        gap: 2,
        overflow: "hidden",
      }}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      {options.map((opt, i) => (
        <View
          key={i}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: radius,
            backgroundColor: selected === i ? "#0EA5E9" : "transparent",
            overflow: "hidden",
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

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  card: {
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
  },
  row: { flexDirection: "row", alignItems: "center" },
  labelStyle: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  sub: { fontSize: 11, color: "#94A3B8", fontWeight: "500", marginTop: 2 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#F0F7FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
});

export default SectionGestionEau;
