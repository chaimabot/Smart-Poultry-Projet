import React from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { controlLamp } from "../../../../../services/lampeService";

/**
 * SectionGestionLampe
 *
 * Props:
 *  - poultryId   : string
 *  - data        : { lampOn: bool, lampAuto: bool }
 *  - onUpdate    : () => void   — rafraîchit l'état parent après une action
 *  - onToggleAuto: () => Promise<void>  — délègue le toggle AUTO au hook
 *                  (optionnel : si absent, appel direct à controlLamp)
 *  - lampAutoReason : string — raison affichée quand la lampe est en mode AUTO
 */
const SectionGestionLampe = ({
  poultryId,
  data,
  onUpdate,
  onToggleAuto,
  lampAutoReason,
}) => {
  const [lampOn, setLampOn] = React.useState(data.lampOn);
  const [lampAuto, setLampAuto] = React.useState(data.lampAuto);
  // Verrou anti double-appel : empêche deux commandes simultanées
  const isSubmitting = React.useRef(false);

  // Sync si data change depuis le parent (ex: mise à jour MQTT)
  // On ne sync QUE si on n'est pas en train d'envoyer une commande,
  // pour éviter que le retour MQTT écrase un état local optimiste.
  React.useEffect(() => {
    if (!isSubmitting.current) {
      setLampOn(data.lampOn);
      setLampAuto(data.lampAuto);
    }
  }, [data.lampOn, data.lampAuto]);

  // ── Toggle AUTO / MANUEL ──────────────────────────────────────────────────
  const handleToggleAuto = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    // ✅ Mise à jour optimiste immédiate — l'UI bascule sans attendre MQTT
    const newAuto = !lampAuto;
    setLampAuto(newAuto);

    try {
      if (onToggleAuto) {
        await onToggleAuto();
      } else {
        const newMode = newAuto ? "auto" : "manual";
        const currentAction = lampOn ? "on" : "off";
        await controlLamp(poultryId, newMode, currentAction);
        if (onUpdate) onUpdate();
      }
    } catch (error) {
      // Rollback si l'API échoue
      setLampAuto(!newAuto);
      const errorMsg =
        error.error ||
        error.message ||
        "Impossible de changer le mode de la lampe.";
      console.error("[SectionGestionLampe] handleToggleAuto error:", error);
      Alert.alert("Erreur", errorMsg);
    } finally {
      isSubmitting.current = false;
    }
  };

  // ── Commande manuelle ON / OFF ────────────────────────────────────────────
  const handleToggleStatus = async (action) => {
    if (lampAuto) {
      Alert.alert(
        "Mode Automatique actif",
        "Veuillez désactiver le mode automatique pour contrôler la lampe manuellement.",
      );
      return;
    }
    if (isSubmitting.current) return; // anti double-tap
    isSubmitting.current = true;

    // Mise à jour optimiste immédiate de l'UI
    setLampOn(action === "on");

    try {
      console.log("[SectionGestionLampe] Envoi commande lampe:", {
        poultryId,
        mode: "manual",
        action,
      });
      const response = await controlLamp(poultryId, "manual", action);
      console.log("[SectionGestionLampe] Réponse API:", response);
      // Ne PAS appeler onUpdate/onRefresh ici :
      // le retour MQTT /status de l'ESP32 synchronise l'UI automatiquement.
      // Appeler onRefresh déclencherait fetchPoultryInfo → réécriture de
      // lampAutoRef depuis la DB (potentiellement stale) → boucle de commandes.
    } catch (error) {
      // Rollback de la mise à jour optimiste en cas d'erreur
      setLampOn(action !== "on");
      const errorMsg =
        error.error || error.message || "La commande de la lampe a échoué.";
      console.error("[SectionGestionLampe] handleToggleStatus error:", error);
      if (errorMsg.includes("Accès non autorisé")) {
        Alert.alert(
          "Authentification requise",
          "Veuillez vous reconnecter pour contrôler la lampe.",
        );
      } else {
        Alert.alert("Erreur", errorMsg);
      }
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <View style={[styles.container, styles.card]}>
      {/* ── En-tête ── */}
      <View style={[styles.row, { marginBottom: lampAuto ? 4 : 14 }]}>
        <View style={styles.iconBox}>
          <MaterialIcons name="lightbulb" size={22} color="#F59E0B" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.labelStyle}>Lampe Chauffante</Text>
          <Text style={styles.sub}>
            {lampAuto
              ? "Auto — Température"
              : `Manuel — ${lampOn ? "● Allumée" : "○ Éteinte"}`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleToggleAuto}
          style={styles.segmentWrapper}
        >
          <Segment options={["AUTO", "MANU"]} selected={lampAuto ? 0 : 1} />
        </TouchableOpacity>
      </View>

      {/* ── Raison du mode automatique ── */}
      {lampAuto && lampAutoReason ? (
        <View style={styles.autoReasonBox}>
          <MaterialIcons name="info-outline" size={13} color="#F59E0B" />
          <Text style={styles.autoReasonText}>{lampAutoReason}</Text>
        </View>
      ) : null}

      {/* ── Boutons de contrôle manuel ── */}
      {!lampAuto && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Bouton Allumer */}
          <TouchableOpacity
            onPress={() => handleToggleStatus("on")}
            disabled={lampOn}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: lampOn ? "#F0F7FE" : "#F59E0B",
              borderWidth: 1,
              borderColor: "#F59E0B40",
              opacity: !lampOn ? 1 : 0.5,
            }}
          >
            <MaterialIcons
              name="play-arrow"
              size={16}
              color={lampOn ? "#F59E0B" : "#fff"}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: lampOn ? "#F59E0B" : "#fff",
              }}
            >
              Allumer
            </Text>
          </TouchableOpacity>

          {/* Bouton Éteindre */}
          <TouchableOpacity
            onPress={() => handleToggleStatus("off")}
            disabled={!lampOn}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: lampOn ? "#FEF2F2" : "#F8FAFC",
              borderWidth: 1,
              borderColor: lampOn ? "#EF444440" : "#F1F5F9",
              opacity: lampOn ? 1 : 0.5,
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
              Éteindre
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ── Micro-composant Segment ───────────────────────────────────────────────────
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
            borderRadius: 100,
            backgroundColor: selected === i ? "#F59E0B" : "transparent",
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
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  segmentWrapper: {
    overflow: "hidden",
    borderRadius: 100,
  },
  autoReasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  autoReasonText: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "500",
    flex: 1,
  },
});

export default SectionGestionLampe;
