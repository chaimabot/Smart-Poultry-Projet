import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  configurerPlanning,
  controlPorte,
} from "../../../../../services/porteService";

const DOOR_COLOR = "#92400E";
const DOOR_BG = "#FEF3C7";

const pad = (n) => String(n).padStart(2, "0");

const buildTime = (hour, minute) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

export default function SectionGestionPorte({
  poultryId,
  data,
  doorMoving,
  doorMode,
  setDoorMode,
  doorSchedule,
  setDoorSchedule,
}) {
  const [loading, setLoading] = useState(false);
  const [showOpenPicker, setShowOpenPicker] = useState(false);
  const [showClosePicker, setShowClosePicker] = useState(false);

  const isAutoMode = doorMode === "horaire" || doorMode === "auto";
  const openTime = useMemo(
    () => buildTime(doorSchedule?.openHour ?? 7, doorSchedule?.openMinute ?? 0),
    [doorSchedule?.openHour, doorSchedule?.openMinute],
  );
  const closeTime = useMemo(
    () =>
      buildTime(doorSchedule?.closeHour ?? 18, doorSchedule?.closeMinute ?? 0),
    [doorSchedule?.closeHour, doorSchedule?.closeMinute],
  );

  const isDoorOpen = Boolean(data);
  const disableOpen = isDoorOpen && !doorMoving;

  const handleToggleMode = async () => {
    if (!setDoorMode) return;

    const nextMode = isAutoMode ? "manual" : "horaire";
    const enabled = nextMode === "horaire";

    console.log("[PORTE][UI] Changement de mode", {
      poultryId,
      from: isAutoMode ? "horaire" : "manual",
      to: nextMode,
      enabled,
    });

    setDoorMode(nextMode);

    try {
      if (!poultryId) throw new Error("Identifiant du poulailler introuvable.");

      await configurerPlanning(poultryId, {
        openHour: openTime.getHours(),
        openMinute: openTime.getMinutes(),
        closeHour: closeTime.getHours(),
        closeMinute: closeTime.getMinutes(),
        enabled,
      });

      console.log("[PORTE][UI] Mode porte synchronise", {
        poultryId,
        mode: nextMode,
        enabled,
      });
    } catch (error) {
      console.error("[PORTE][UI] Echec synchronisation mode porte", {
        poultryId,
        error: error?.message || error?.error || error,
      });
      setDoorMode(isAutoMode ? "horaire" : "manual");
      Alert.alert(
        "Erreur",
        error?.message || error?.error || "Impossible de changer le mode de la porte.",
      );
    }
  };

  const handleSavePlanning = async () => {
    if (!poultryId) {
      Alert.alert("Erreur", "Identifiant du poulailler introuvable.");
      return;
    }

    const payload = {
      openHour: openTime.getHours(),
      openMinute: openTime.getMinutes(),
      closeHour: closeTime.getHours(),
      closeMinute: closeTime.getMinutes(),
      enabled: true,
    };

    setLoading(true);
    try {
      console.log("[PORTE][UI] Envoi planning", {
        poultryId,
        ...payload,
      });

      await configurerPlanning(poultryId, payload);

      console.log("[PORTE][UI] Planning synchronise avec succes", {
        poultryId,
      });
      Alert.alert("Succes", "Planning synchronise avec le poulailler.");
    } catch (error) {
      console.error("[PORTE][UI] Echec synchronisation planning", {
        poultryId,
        error: error?.message || error?.error || error,
      });

      const message =
        error?.message ||
        error?.error ||
        "Impossible de synchroniser le planning.";
      Alert.alert("Erreur", message);
    } finally {
      setLoading(false);
    }
  };

  const runDoorAction = async (action) => {
    if (!poultryId) {
      Alert.alert("Erreur", "Identifiant du poulailler introuvable.");
      return;
    }

    console.log("[PORTE][UI] Action demandee", {
      poultryId,
      action,
      currentMode: isAutoMode ? "horaire" : "manual",
      isDoorOpen,
      doorMoving,
    });

    // La commande passe par le backend pour publier sur le bon topic MQTT:
    // `poulailler/<deviceId>/cmd/door`, celui qu'ecoute l'ESP32.
    await controlPorte(poultryId, action);
  };

  const handleManualAction = async (action) => {
    try {
      await runDoorAction(action);

      console.log("[PORTE][UI] Action executee avec succes", {
        poultryId,
        action,
      });

      const successLabel =
        action === "open"
          ? "ouverte"
          : action === "close"
            ? "fermee"
            : "arretee";

      Alert.alert("Succes", `Porte ${successLabel}.`);
    } catch (error) {
      console.error("[PORTE][UI] Echec action porte", {
        poultryId,
        action,
        error: error?.message || error?.error || error,
      });

      const message =
        error?.message || error?.error || "La commande a echoue.";
      Alert.alert("Erreur", message);
    }
  };

  const updateScheduleTime = (type, nextDate) => {
    if (!nextDate || !setDoorSchedule) return;

    console.log("[PORTE][UI] Horaire modifie", {
      poultryId,
      type,
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
    });

    setDoorSchedule((prev) => ({
      ...prev,
      ...(type === "open"
        ? {
            openHour: nextDate.getHours(),
            openMinute: nextDate.getMinutes(),
          }
        : {
            closeHour: nextDate.getHours(),
            closeMinute: nextDate.getMinutes(),
          }),
    }));
  };

  return (
    <View style={styles.card}>
      <View style={[styles.row, { marginBottom: isAutoMode ? 16 : 14 }]}>
        <View style={[styles.iconBox, { backgroundColor: DOOR_BG }]}>
          <MaterialIcons name="door-front" size={22} color={DOOR_COLOR} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Porte Automatique</Text>
          <Text style={styles.sub}>
            {isAutoMode
              ? "Auto - Horaires"
              : `Manuel - ${
                  doorMoving ? "Mouvement..." : isDoorOpen ? "Ouverte" : "Fermee"
                }`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleToggleMode}
          style={styles.segmentWrapper}
        >
          <Segment options={["AUTO", "MANU"]} selected={isAutoMode ? 0 : 1} />
        </TouchableOpacity>
      </View>

      {isAutoMode && (
        <View style={styles.planningSection}>
          <Text style={styles.sectionTitle}>Horaires</Text>

          <View style={styles.timeRow}>
            <TouchableOpacity
              onPress={() => setShowOpenPicker(true)}
              style={styles.timeInput}
            >
              <Text style={styles.timeLabel}>OUVERTURE</Text>
              <Text style={styles.timeValue}>
                {pad(openTime.getHours())}:{pad(openTime.getMinutes())}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowClosePicker(true)}
              style={styles.timeInput}
            >
              <Text style={styles.timeLabel}>FERMETURE</Text>
              <Text style={styles.timeValue}>
                {pad(closeTime.getHours())}:{pad(closeTime.getMinutes())}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleSavePlanning}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Synchroniser</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {!isAutoMode && (
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={() => handleManualAction("open")}
            style={[
              styles.btn,
              styles.btnPrimary,
              disableOpen && styles.btnDisabled,
            ]}
            disabled={disableOpen}
          >
            <MaterialIcons
              name="arrow-upward"
              size={16}
              color={isDoorOpen ? DOOR_COLOR : "#fff"}
            />
            <Text
              style={[styles.btnText, { color: isDoorOpen ? DOOR_COLOR : "#fff" }]}
            >
              Ouvrir
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleManualAction("close")}
            style={[
              styles.btn,
              styles.btnSecondary,
            ]}
          >
            <MaterialIcons name="arrow-downward" size={16} color="#EF4444" />
            <Text style={[styles.btnText, { color: "#EF4444" }]}>Fermer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleManualAction("stop")}
            style={[
              styles.btn,
              { backgroundColor: "#FEF2F2", borderColor: "#FEA5A540" },
            ]}
          >
            <MaterialIcons name="stop-circle" size={16} color="#EA580C" />
            <Text style={[styles.btnText, { color: "#EA580C" }]}>Arreter</Text>
          </TouchableOpacity>
        </View>
      )}

      {showOpenPicker && (
        <DateTimePicker
          value={openTime}
          mode="time"
          is24Hour
          onChange={(_, nextDate) => {
            setShowOpenPicker(false);
            updateScheduleTime("open", nextDate);
          }}
        />
      )}

      {showClosePicker && (
        <DateTimePicker
          value={closeTime}
          mode="time"
          is24Hour
          onChange={(_, nextDate) => {
            setShowClosePicker(false);
            updateScheduleTime("close", nextDate);
          }}
        />
      )}
    </View>
  );
}

function Segment({ options, selected }) {
  return (
    <View style={styles.segment}>
      {options.map((opt, i) => (
        <View
          key={i}
          style={[styles.segmentBtn, selected === i && styles.segmentActive]}
        >
          <Text
            style={[styles.segmentText, selected === i && styles.textWhite]}
          >
            {opt}
          </Text>
        </View>
      ))}
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
    borderRadius: 999,
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
  segmentActive: { backgroundColor: DOOR_COLOR },
  segmentText: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  textWhite: { color: "#fff" },
  planningSection: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeInput: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 4,
  },
  timeValue: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  saveBtn: {
    backgroundColor: DOOR_COLOR,
    padding: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
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
  btnPrimary: {
    backgroundColor: DOOR_COLOR,
    borderColor: `${DOOR_COLOR}40`,
  },
  btnSecondary: {
    backgroundColor: "#F8FAFC",
    borderColor: "#F1F5F9",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 12, fontWeight: "700" },
});
