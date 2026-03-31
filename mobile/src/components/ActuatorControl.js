import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import Toast from "./Toast";
import { controlActuator } from "../services/poultry";

const jours = [
  { key: "L", label: "Lun" },
  { key: "M", label: "Mar" },
  { key: "Me", label: "Mer" },
  { key: "J", label: "Jeu" },
  { key: "V", label: "Ven" },
  { key: "S", label: "Sam" },
  { key: "D", label: "Dim" },
];

export default function ActuatorControl({
  darkMode = false,
  poultryId,
  actuators,
}) {
  // ── États locaux ───────────────────────────────────────────────────────────
  const [doorState, setDoorState] = useState(
    actuators?.door?.status === "open" ? "Ouverte" : "Fermée",
  );
  const [doorMode, setDoorMode] = useState(
    actuators?.door?.mode === "auto" ? "Auto" : "Manuel",
  );
  const [doorProcessing, setDoorProcessing] = useState(false);

  const [fanState, setFanState] = useState(
    actuators?.ventilation?.status === "on" ? "Actif" : "Arrêt",
  );
  const [fanMode, setFanMode] = useState(
    actuators?.ventilation?.mode === "auto" ? "Auto" : "Manuel",
  );
  const [fanProcessing, setFanProcessing] = useState(false);

  const [lampState, setLampState] = useState(
    actuators?.lamp?.status === "on" ? "Allumée" : "Éteinte",
  );
  const [lampMode, setLampMode] = useState(
    actuators?.lamp?.mode === "auto" ? "Auto" : "Manuel",
  );
  const [lampProcessing, setLampProcessing] = useState(false);

  // ── Refs pour bloquer la synchro pendant actions/changements de mode ───────
  const doorActionInProgress = useRef(false);
  const doorModeInProgress = useRef(false);
  const fanActionInProgress = useRef(false);
  const fanModeInProgress = useRef(false);
  const lampActionInProgress = useRef(false);
  const lampModeInProgress = useRef(false);

  // ── Synchronisation depuis le serveur (bloquée pendant actions locales) ────
  useEffect(() => {
    if (!doorActionInProgress.current && !doorModeInProgress.current) {
      if (actuators?.door?.status) {
        setDoorState(actuators.door.status === "open" ? "Ouverte" : "Fermée");
      }
      if (actuators?.door?.mode) {
        setDoorMode(actuators.door.mode === "auto" ? "Auto" : "Manuel");
      }
    }
    if (!fanActionInProgress.current && !fanModeInProgress.current) {
      if (actuators?.ventilation?.status) {
        setFanState(actuators.ventilation.status === "on" ? "Actif" : "Arrêt");
      }
      if (actuators?.ventilation?.mode) {
        setFanMode(actuators.ventilation.mode === "auto" ? "Auto" : "Manuel");
      }
    }
    if (!lampActionInProgress.current && !lampModeInProgress.current) {
      if (actuators?.lamp?.status) {
        setLampState(actuators.lamp.status === "on" ? "Allumée" : "Éteinte");
      }
      if (actuators?.lamp?.mode) {
        setLampMode(actuators.lamp.mode === "auto" ? "Auto" : "Manuel");
      }
    }
  }, [actuators]);

  // ── Horaires ───────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState([
    {
      id: 1,
      openTime: "06:00",
      closeTime: "08:00",
      days: ["L", "M", "Me", "J", "V"],
    },
    {
      id: 2,
      openTime: "17:00",
      closeTime: "20:00",
      days: ["L", "M", "Me", "J", "V", "S", "D"],
    },
  ]);
  const [newSchedule, setNewSchedule] = useState({
    openTime: "06:00",
    closeTime: "20:00",
    days: ["L", "M", "Me", "J", "V"],
  });
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [processingSchedule, setProcessingSchedule] = useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success",
  });
  const showToast = (message, type = "success") =>
    setToast({ visible: true, message, type });
  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  // ── Modes Auto ↔ Manuel ────────────────────────────────────────────────────
  const toggleDoorMode = async () => {
    const newMode = doorMode === "Auto" ? "Manuel" : "Auto";
    doorModeInProgress.current = true;
    setDoorMode(newMode);
    setDoorProcessing(true);
    try {
      await controlActuator(
        poultryId,
        "door",
        doorState === "Ouverte" ? "open" : "closed",
        newMode === "Manuel" ? "manual" : "auto",
      );
      showToast(`Porte : Mode ${newMode} activé`);
    } catch (e) {
      showToast(e.message || "Erreur changement de mode", "error");
      setDoorMode(doorMode);
    } finally {
      setDoorProcessing(false);
      setTimeout(() => {
        doorModeInProgress.current = false;
      }, 3000);
    }
  };

  const toggleFanMode = async () => {
    const newMode = fanMode === "Auto" ? "Manuel" : "Auto";
    fanModeInProgress.current = true;
    setFanMode(newMode);
    setFanProcessing(true);
    try {
      await controlActuator(
        poultryId,
        "ventilation",
        fanState === "Actif" ? "on" : "off",
        newMode === "Manuel" ? "manual" : "auto",
      );
      showToast(`Ventilation : Mode ${newMode} activé`);
    } catch (e) {
      showToast(e.message || "Erreur changement de mode", "error");
      setFanMode(fanMode);
    } finally {
      setFanProcessing(false);
      setTimeout(() => {
        fanModeInProgress.current = false;
      }, 3000);
    }
  };

  const toggleLampMode = async () => {
    const newMode = lampMode === "Auto" ? "Manuel" : "Auto";
    lampModeInProgress.current = true;
    setLampMode(newMode);
    setLampProcessing(true);
    try {
      await controlActuator(
        poultryId,
        "lamp",
        lampState === "Allumée" ? "on" : "off",
        newMode === "Manuel" ? "manual" : "auto",
      );
      showToast(`Lampe : Mode ${newMode} activé`);
    } catch (e) {
      showToast(e.message || "Erreur changement de mode", "error");
      setLampMode(lampMode);
    } finally {
      setLampProcessing(false);
      setTimeout(() => {
        lampModeInProgress.current = false;
      }, 3000);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleDoor = async () => {
    if (doorMode === "Auto") {
      showToast("Passez d'abord en mode Manuel", "warning");
      return;
    }
    if (!poultryId) {
      showToast("ID poulailler manquant", "error");
      return;
    }
    const newState = doorState === "Fermée" ? "Ouverte" : "Fermée";
    doorActionInProgress.current = true;
    setDoorProcessing(true);
    setDoorState(newState);
    try {
      await controlActuator(
        poultryId,
        "door",
        newState === "Ouverte" ? "open" : "closed",
        "manual",
      );
      showToast(`Porte ${newState.toLowerCase()}`);
    } catch (e) {
      setDoorState(doorState);
      showToast(e.message || "Erreur contrôle porte", "error");
    } finally {
      setDoorProcessing(false);
      setTimeout(() => {
        doorActionInProgress.current = false;
      }, 2000);
    }
  };

  const toggleFan = async () => {
    if (fanMode === "Auto") {
      showToast("Passez d'abord en mode Manuel", "warning");
      return;
    }
    if (!poultryId) {
      showToast("ID poulailler manquant", "error");
      return;
    }
    const newState = fanState === "Arrêt" ? "Actif" : "Arrêt";
    fanActionInProgress.current = true;
    setFanProcessing(true);
    setFanState(newState);
    try {
      await controlActuator(
        poultryId,
        "ventilation",
        newState === "Actif" ? "on" : "off",
        "manual",
      );
      showToast(`Ventilation ${newState === "Actif" ? "démarrée" : "arrêtée"}`);
    } catch (e) {
      setFanState(fanState);
      showToast(e.message || "Erreur contrôle ventilation", "error");
    } finally {
      setFanProcessing(false);
      setTimeout(() => {
        fanActionInProgress.current = false;
      }, 2000);
    }
  };

  const toggleLamp = async () => {
    if (lampMode === "Auto") {
      showToast("Passez d'abord en mode Manuel", "warning");
      return;
    }
    if (!poultryId) {
      showToast("ID poulailler manquant", "error");
      return;
    }
    const newState = lampState === "Éteinte" ? "Allumée" : "Éteinte";
    lampActionInProgress.current = true;
    setLampProcessing(true);
    setLampState(newState);
    try {
      await controlActuator(
        poultryId,
        "lamp",
        newState === "Allumée" ? "on" : "off",
        "manual",
      );
      showToast(`Lampe ${newState === "Allumée" ? "allumée" : "éteinte"}`);
    } catch (e) {
      setLampState(lampState);
      showToast(e.message || "Erreur contrôle lampe", "error");
    } finally {
      setLampProcessing(false);
      setTimeout(() => {
        lampActionInProgress.current = false;
      }, 2000);
    }
  };

  // ── Horaires ───────────────────────────────────────────────────────────────
  const addSchedule = () => {
    if (
      !newSchedule.openTime ||
      !newSchedule.closeTime ||
      newSchedule.days.length === 0
    ) {
      showToast("Veuillez remplir tous les champs", "error");
      return;
    }
    const id = Math.max(...schedules.map((s) => s.id), 0) + 1;
    setSchedules((prev) => [...prev, { ...newSchedule, id }]);
    setShowScheduleForm(false);
    setNewSchedule({
      openTime: "06:00",
      closeTime: "20:00",
      days: ["L", "M", "Me", "J", "V"],
    });
    showToast("Créneau horaire ajouté");
  };

  const deleteSchedule = (id) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    showToast("Créneau supprimé");
  };

  const savePlanning = () => {
    setProcessingSchedule(true);
    setTimeout(() => {
      setProcessingSchedule(false);
      setShowScheduleModal(false);
      showToast("Planning sauvegardé avec succès !");
    }, 1500);
  };

  const toggleDay = (day) => {
    setNewSchedule((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort(
            (a, b) =>
              jours.findIndex((j) => j.key === a) -
              jours.findIndex((j) => j.key === b),
          ),
    }));
  };

  const cardBg = darkMode
    ? "rgba(30, 41, 59, 0.7)"
    : "rgba(255, 255, 255, 0.7)";
  const textColor = darkMode ? "#fff" : "#0f172a";
  const secondaryText = "#64748b";

  // ── Rendu d'un équipement ──────────────────────────────────────────────────
  const renderDevice = (
    name,
    icon,
    state,
    mode,
    processing,
    onToggleMode,
    onToggle,
    activeColor,
  ) => (
    <BlurView
      intensity={20}
      tint={darkMode ? "dark" : "light"}
      style={[
        styles.deviceCard,
        {
          backgroundColor: cardBg,
          borderColor: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
        },
      ]}
    >
      <View style={styles.deviceHeader}>
        <View
          style={[styles.deviceIcon, { backgroundColor: activeColor + "20" }]}
        >
          <MaterialIcons name={icon} size={24} color={activeColor} />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: textColor }]}>{name}</Text>
          <Text
            style={[
              styles.deviceState,
              {
                color:
                  state === "Ouverte" ||
                  state === "Actif" ||
                  state === "Allumée"
                    ? activeColor
                    : "#64748b",
              },
            ]}
          >
            {processing ? "En cours..." : state}
          </Text>
        </View>
        <View
          style={[
            styles.modeBadge,
            {
              backgroundColor:
                mode === "Auto" ? activeColor + "20" : "#f9731620",
            },
          ]}
        >
          <Text
            style={[
              styles.modeBadgeText,
              {
                color: mode === "Auto" ? activeColor : "#f97316",
              },
            ]}
          >
            {mode.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.controlButtons}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === "Auto" && styles.modeBtnActive]}
          onPress={mode !== "Auto" ? onToggleMode : null}
          disabled={processing}
        >
          <MaterialIcons
            name="autorenew"
            size={16}
            color={mode === "Auto" ? "#fff" : "#64748b"}
          />
          <Text
            style={[
              styles.modeBtnText,
              mode === "Auto" && styles.modeBtnTextActive,
            ]}
          >
            Auto
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeBtn, mode === "Manuel" && styles.modeBtnActive]}
          onPress={mode !== "Manuel" ? onToggleMode : null}
          disabled={processing}
        >
          <MaterialIcons
            name="touch-app"
            size={16}
            color={mode === "Manuel" ? "#fff" : "#64748b"}
          />
          <Text
            style={[
              styles.modeBtnText,
              mode === "Manuel" && styles.modeBtnTextActive,
            ]}
          >
            Manuel
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "Manuel" ? (
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: activeColor },
            processing && { opacity: 0.7 },
          ]}
          onPress={onToggle}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons
              name={
                name === "Porte"
                  ? state === "Fermée"
                    ? "door-sliding"
                    : "door-front"
                  : name === "Lampe"
                    ? state === "Éteinte"
                      ? "lightbulb"
                      : "lightbulb-outline"
                    : state === "Arrêt"
                      ? "play-arrow"
                      : "stop"
              }
              size={20}
              color="#fff"
            />
          )}
          <Text style={styles.actionBtnText}>
            {name === "Porte"
              ? state === "Fermée"
                ? "Ouvrir"
                : "Fermer"
              : name === "Lampe"
                ? state === "Éteinte"
                  ? "Allumer"
                  : "Éteindre"
                : state === "Arrêt"
                  ? "Démarrer"
                  : "Arrêter"}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.autoInfo}>
          <MaterialIcons name="info-outline" size={14} color={secondaryText} />
          <Text style={[styles.autoInfoText, { color: secondaryText }]}>
            Mode automatique activé
          </Text>
        </View>
      )}
    </BlurView>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>
        Contrôle des Équipements
      </Text>

      {renderDevice(
        "Porte",
        "door-front",
        doorState,
        doorMode,
        doorProcessing,
        toggleDoorMode,
        toggleDoor,
        "#10b981",
      )}
      {renderDevice(
        "Ventilation",
        "toys",
        fanState,
        fanMode,
        fanProcessing,
        toggleFanMode,
        toggleFan,
        "#3b82f6",
      )}
      {renderDevice(
        "Lampe",
        "lightbulb",
        lampState,
        lampMode,
        lampProcessing,
        toggleLampMode,
        toggleLamp,
        "#f59e0b",
      )}

      <TouchableOpacity
        style={[styles.scheduleBtn, { borderColor: "#22C55E" }]}
        onPress={() => setShowScheduleModal(true)}
      >
        <MaterialIcons name="schedule" size={20} color="#22C55E" />
        <Text style={[styles.scheduleBtnText, { color: "#22C55E" }]}>
          Programmation horaire (porte)
        </Text>
        <MaterialIcons name="chevron-right" size={20} color="#22C55E" />
      </TouchableOpacity>

      <Modal visible={showScheduleModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: darkMode ? "#1e293b" : "#fff" },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                Programmation horaire
              </Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <MaterialIcons name="close" size={24} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.subTitle, { color: textColor }]}>
                Créneaux programmés
              </Text>

              {schedules.length === 0 ? (
                <Text style={[styles.emptyText, { color: secondaryText }]}>
                  Aucun créneau
                </Text>
              ) : (
                schedules.map((schedule) => (
                  <View
                    key={schedule.id}
                    style={[styles.scheduleItem, { backgroundColor: cardBg }]}
                  >
                    <View style={styles.scheduleInfo}>
                      <Text style={[styles.scheduleTime, { color: textColor }]}>
                        {schedule.openTime} - {schedule.closeTime}
                      </Text>
                      <Text
                        style={[styles.scheduleDays, { color: secondaryText }]}
                      >
                        {schedule.days
                          .map((d) => jours.find((j) => j.key === d)?.label)
                          .join(", ")}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteSchedule(schedule.id)}
                      style={styles.deleteBtn}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={20}
                        color="#ef4444"
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {showScheduleForm ? (
                <View
                  style={[styles.scheduleForm, { backgroundColor: cardBg }]}
                >
                  <Text style={[styles.formTitle, { color: textColor }]}>
                    Nouveau créneau
                  </Text>
                  <View style={styles.timeRow}>
                    <View style={styles.timeInput}>
                      <Text
                        style={[styles.inputLabel, { color: secondaryText }]}
                      >
                        Ouverture
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
                            color: textColor,
                          },
                        ]}
                        value={newSchedule.openTime}
                        onChangeText={(text) =>
                          setNewSchedule((prev) => ({
                            ...prev,
                            openTime: text,
                          }))
                        }
                        placeholder="HH:MM"
                        placeholderTextColor={secondaryText}
                      />
                    </View>
                    <View style={styles.timeInput}>
                      <Text
                        style={[styles.inputLabel, { color: secondaryText }]}
                      >
                        Fermeture
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: darkMode ? "#0f172a" : "#f1f5f9",
                            color: textColor,
                          },
                        ]}
                        value={newSchedule.closeTime}
                        onChangeText={(text) =>
                          setNewSchedule((prev) => ({
                            ...prev,
                            closeTime: text,
                          }))
                        }
                        placeholder="HH:MM"
                        placeholderTextColor={secondaryText}
                      />
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.inputLabel,
                      { color: secondaryText, marginTop: 12 },
                    ]}
                  >
                    Jours
                  </Text>
                  <View style={styles.daysRow}>
                    {jours.map((jour) => (
                      <TouchableOpacity
                        key={jour.key}
                        style={[
                          styles.dayBtn,
                          newSchedule.days.includes(jour.key) &&
                            styles.dayBtnActive,
                        ]}
                        onPress={() => toggleDay(jour.key)}
                      >
                        <Text
                          style={[
                            styles.dayBtnText,
                            newSchedule.days.includes(jour.key) &&
                              styles.dayBtnTextActive,
                          ]}
                        >
                          {jour.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.formButtons}>
                    <TouchableOpacity
                      style={[styles.formBtn, { backgroundColor: "#ef4444" }]}
                      onPress={() => setShowScheduleForm(false)}
                    >
                      <Text style={styles.formBtnText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.formBtn, { backgroundColor: "#22C55E" }]}
                      onPress={addSchedule}
                    >
                      <Text style={styles.formBtnText}>Ajouter</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addBtn, { borderColor: "#22C55E" }]}
                  onPress={() => setShowScheduleForm(true)}
                >
                  <MaterialIcons name="add" size={20} color="#22C55E" />
                  <Text style={[styles.addBtnText, { color: "#22C55E" }]}>
                    Ajouter un créneau
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, processingSchedule && { opacity: 0.7 }]}
              onPress={savePlanning}
              disabled={processingSchedule}
            >
              {processingSchedule ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialIcons name="save" size={20} color="#fff" />
              )}
              <Text style={styles.saveBtnText}>
                {processingSchedule ? "Sauvegarde..." : "Sauvegarder planning"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  deviceCard: { borderRadius: 20, padding: 16, borderWidth: 1 },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceInfo: { flex: 1, marginLeft: 12 },
  deviceName: { fontSize: 16, fontWeight: "700" },
  deviceState: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  modeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  modeBadgeText: { fontSize: 11, fontWeight: "800" },
  controlButtons: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modeBtnActive: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  modeBtnText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  modeBtnTextActive: { color: "#fff" },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  autoInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  autoInfoText: { fontSize: 12, fontWeight: "500" },
  scheduleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  scheduleBtnText: { flex: 1, marginLeft: 12, fontSize: 14, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalTitle: { fontSize: 20, fontWeight: "800" },
  modalBody: { padding: 20 },
  subTitle: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
  emptyText: { textAlign: "center", marginVertical: 20 },
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  scheduleInfo: { flex: 1 },
  scheduleTime: { fontSize: 15, fontWeight: "700" },
  scheduleDays: { fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 8,
  },
  addBtnText: { fontSize: 14, fontWeight: "700" },
  scheduleForm: { padding: 16, borderRadius: 16, marginTop: 12 },
  formTitle: { fontSize: 14, fontWeight: "700", marginBottom: 16 },
  timeRow: { flexDirection: "row", gap: 12 },
  timeInput: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  input: { padding: 12, borderRadius: 10, fontSize: 15, fontWeight: "600" },
  daysRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  dayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  dayBtnActive: { backgroundColor: "#22C55E", borderColor: "#22C55E" },
  dayBtnText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  dayBtnTextActive: { color: "#fff" },
  formButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  formBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  formBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#22C55E",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
