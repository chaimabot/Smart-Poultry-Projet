// components/SectionGestionEau.jsx

import React from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { controlPump } from "../../../../../services/pompeService";

const SectionGestionEau = ({
  poultryId,
  data,
  onUpdate,
  onToggleAuto,
  pumpAutoReason,
}) => {
  const [pumpOn, setPumpOn] = React.useState(data?.pumpOn ?? false);
  const [pumpAuto, setPumpAuto] = React.useState(data?.pumpAuto ?? false);
  const isSubmitting = React.useRef(false);

  // Sync depuis le parent — bloqué pendant une commande en cours
  React.useEffect(() => {
    if (!isSubmitting.current) {
      setPumpOn(data?.pumpOn ?? false);
      setPumpAuto(data?.pumpAuto ?? false);
    }
  }, [data?.pumpOn, data?.pumpAuto]);

  const handleToggleAuto = async () => {
    if (!poultryId) {
      Alert.alert("Poulailler introuvable", "...");
      return;
    }
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const newAuto = !pumpAuto;

    //    Mise à jour optimiste UI
    setPumpAuto(newAuto);
    if (!newAuto) {
      setPumpOn(false); //    Forcer arrêt visuel immédiat
    }

    console.log(
      "[SectionGestionEau] Toggle AUTO:",
      newAuto ? "AUTO" : "MANUEL",
    );

    try {
      if (onToggleAuto) {
        await onToggleAuto();
      } else {
        await controlPump(
          poultryId,
          newAuto ? "auto" : "manual",
          null,
          true, // changeModeOnly
        );
        if (onUpdate) onUpdate();
      }
      console.log("[SectionGestionEau]    Mode changé");
    } catch (error) {
      // Rollback
      setPumpAuto(!newAuto);
      const errorMsg = error.error || error.message || "Impossible.";
      console.error("[SectionGestionEau] error:", error);
      Alert.alert("Erreur", errorMsg);
    } finally {
      isSubmitting.current = false;
    }
  };
  // ── Commande manuelle ON / OFF ───────────────────────────────────────────
  const handleToggleStatus = async (action) => {
    if (pumpAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Veuillez désactiver le mode automatique pour contrôler la pompe manuellement.",
      );
      return;
    }
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    // Mise à jour optimiste
    setPumpOn(action === "on");

    console.log("[SectionGestionEau] Commande manuelle:", action);

    try {
      //    Appel avec changeModeOnly=false pour envoyer la commande
      await controlPump(
        poultryId,
        "manual",
        action,
        false, //    changeModeOnly = false (envoyer la commande)
      );
      console.log("[SectionGestionEau]    Commande envoyée");
    } catch (error) {
      // Rollback
      setPumpOn(action !== "on");
      const errorMsg =
        error.error || error.message || "La commande de la pompe a échoué.";
      console.error("[SectionGestionEau] handleToggleStatus error:", error);
      if (errorMsg.includes("Accès non autorisé")) {
        Alert.alert(
          "Authentification requise",
          "Veuillez vous reconnecter pour contrôler la pompe.",
        );
      } else {
        Alert.alert("Erreur", errorMsg);
      }
    } finally {
      isSubmitting.current = false;
    }
  };

  //    Détecter si la pompe tourne en mode AUTO (pour couleur)
  const isAutoActive = pumpAuto && pumpOn;

  return (
    <View style={styles.card}>
      {/* ── En-tête ── */}
      <View style={[styles.row, { marginBottom: pumpAuto ? 4 : 14 }]}>
        <View style={styles.iconBox}>
          <MaterialIcons name="water-drop" size={22} color="#0EA5E9" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Pompe à Eau</Text>
          <Text style={styles.sub}>
            {pumpAuto
              ? `Auto — ${pumpOn ? "● En marche" : "○ En attente"}`
              : `Manuel — ${pumpOn ? "● En marche" : "○ Arrêtée"}`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleToggleAuto}
          style={styles.segmentWrapper}
        >
          <View style={styles.segment}>
            <View style={[styles.segmentBtn, pumpAuto && styles.segmentActive]}>
              <Text style={[styles.segmentText, pumpAuto && styles.textWhite]}>
                AUTO
              </Text>
            </View>
            <View
              style={[styles.segmentBtn, !pumpAuto && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, !pumpAuto && styles.textWhite]}>
                MANU
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/*    ── Raison du mode automatique (dynamique selon état) ── */}
      {pumpAuto && pumpAutoReason && (
        <View
          style={[
            styles.reasonBox,
            isAutoActive ? styles.reasonBoxActive : styles.reasonBoxIdle,
          ]}
        >
          <MaterialIcons
            name={isAutoActive ? "warning-amber" : "check-circle-outline"}
            size={14}
            color={isAutoActive ? "#F59E0B" : "#0EA5E9"}
          />
          <Text
            style={[
              styles.reasonText,
              { color: isAutoActive ? "#92400E" : "#0C4A6E" },
            ]}
          >
            {pumpAutoReason}
          </Text>
        </View>
      )}

      {/* ── Boutons manuels ── */}
      {!pumpAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => handleToggleStatus("on")}
            disabled={pumpOn}
            style={[styles.btn, styles.btnOn, pumpOn && styles.btnDisabled]}
          >
            <MaterialIcons
              name="play-arrow"
              size={16}
              color={pumpOn ? "#0EA5E9" : "#fff"}
            />
            <Text
              style={[styles.btnText, { color: pumpOn ? "#0EA5E9" : "#fff" }]}
            >
              Démarrer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleToggleStatus("off")}
            disabled={!pumpOn}
            style={[styles.btn, styles.btnOff, !pumpOn && styles.btnDisabled]}
          >
            <MaterialIcons name="stop" size={16} color="#EF4444" />
            <Text style={[styles.btnText, { color: "#EF4444" }]}>Arrêter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/*    ── Info mode auto (mis à jour : serveur) ── */}
      {pumpAuto && (
        <View style={styles.autoInfo}>
          <MaterialIcons name="cloud-done" size={13} color="#0EA5E9" />
          <Text style={styles.autoInfoText}>
            Le serveur surveille le niveau d'eau en continu et commande la pompe
            automatiquement, 24h/24
          </Text>
        </View>
      )}
    </View>
  );
};

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
    borderRadius: 999,
    backgroundColor: "#F0F7FE",
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
  segmentActive: { backgroundColor: "#0EA5E9" },
  segmentText: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  textWhite: { color: "#fff" },

  //    Reason box dynamique
  reasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 4,
    borderLeftWidth: 3,
  },
  reasonBoxActive: {
    backgroundColor: "#FEF3C7",
    borderLeftColor: "#F59E0B",
  },
  reasonBoxIdle: {
    backgroundColor: "#F0F9FF",
    borderLeftColor: "#0EA5E9",
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
  btnOn: { backgroundColor: "#0EA5E9", borderColor: "#0EA5E940" },
  btnOff: { backgroundColor: "#F8FAFC", borderColor: "#F1F5F9" },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 12, fontWeight: "700" },
  autoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F0F9FF",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  autoInfoText: { fontSize: 10, color: "#0C4A6E", flex: 1, fontWeight: "500" },
});

export default SectionGestionEau;
