// hooks/useAlertSettings.js
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Alert } from "react-native";
import {
  getThresholds,
  updateThresholds,
  getAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  deleteReadAlerts,
  getAlertStats,
  getDefaultThresholds,
} from "../services/poultry";

// ── Constantes ────────────────────────────────────────────────────────────────

export const FALLBACK_THRESHOLDS = {
  temperatureMin: 18,
  temperatureMax: 28,
  humidityMin: 40,
  humidityMax: 70,
  co2Max: 1500,
  nh3Max: 25,
  dustMax: 150,
  waterLevelMin: 20,
};

export const PARAM_ICONS = {
  temperature: { icon: "thermostat", color: "#ef4444" },
  humidity: { icon: "water-drop", color: "#3b82f6" },
  co2: { icon: "air", color: "#f97316" },
  nh3: { icon: "science", color: "#a855f7" },
  dust: { icon: "blur-on", color: "#f59e0b" },
  waterLevel: { icon: "water", color: "#06b6d4" },
};

// ── Validation ────────────────────────────────────────────────────────────────

export function validateThresholds(vals) {
  if (vals.temperatureMin >= vals.temperatureMax)
    return "Température min doit être < max";
  if (vals.humidityMin >= vals.humidityMax)
    return "Humidité min doit être < max";
  if (vals.temperatureMin < -20 || vals.temperatureMax > 50)
    return "Température hors plage (-20°C à 50°C)";
  if (vals.humidityMin < 0 || vals.humidityMax > 100)
    return "Humidité entre 0% et 100%";
  if (vals.co2Max < 400 || vals.co2Max > 5000)
    return "CO₂ entre 400 et 5000 ppm";
  if (vals.nh3Max < 0 || vals.nh3Max > 100) return "NH₃ entre 0 et 100 ppm";
  if (vals.waterLevelMin < 0 || vals.waterLevelMin > 100)
    return "Niveau d'eau entre 0 et 100%";
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function useAlertSettings({ poultryId, activeTab, setToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(FALLBACK_THRESHOLDS);
  const [defaultThresholds, setDefaultThresholds] =
    useState(FALLBACK_THRESHOLDS);

  const previousThresholds = useRef(FALLBACK_THRESHOLDS);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(thresholds) !== JSON.stringify(previousThresholds.current),
    [thresholds],
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Seuils par défaut depuis SystemConfig
      let fetchedDefaults = FALLBACK_THRESHOLDS;
      try {
        const defaultRes = await getDefaultThresholds();
        if (defaultRes.success && defaultRes.data) {
          fetchedDefaults = { ...FALLBACK_THRESHOLDS, ...defaultRes.data };
          setDefaultThresholds(fetchedDefaults);
        }
      } catch (e) {
        console.log("[AlertSettings] Erreur seuils par défaut:", e);
      }

      // 2. Seuils + alertes + stats en parallèle
      const [threshRes, alertRes, statsRes] = await Promise.all([
        getThresholds(poultryId),
        getAlerts(poultryId),
        getAlertStats(poultryId),
      ]);

      if (threshRes.success) {
        const t = { ...fetchedDefaults, ...threshRes.data };
        setThresholds(t);
        previousThresholds.current = t;
      } else {
        setThresholds(fetchedDefaults);
        previousThresholds.current = fetchedDefaults;
      }

      if (alertRes.success) {
        setAlerts(
          Array.isArray(alertRes.data) ? alertRes.data.slice(0, 30) : [],
        );
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (e) {
      console.log("[AlertSettings] fetchData error:", e);
    } finally {
      setLoading(false);
    }
  }, [poultryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── FIX: Suppression du useEffect d'auto-mark-read ────────────────────────
  // L'auto-mark-read causait une race condition : toutes les alertes étaient
  // marquées "lues" en state AVANT que le serveur confirme, rendant
  // "Supprimer lues" inefficace (le serveur ne les voyait pas encore comme lues).
  // L'utilisateur utilise désormais le bouton "Tout lire" explicitement.

  // ── Threshold handlers ────────────────────────────────────────────────────
  const handleThresholdChange = (key, text) => {
    const numeric = text.replace(/[^0-9.-]/g, "");
    if (numeric === "" || !isNaN(parseFloat(numeric))) {
      setThresholds((prev) => ({
        ...prev,
        [key]: numeric === "" ? 0 : parseFloat(numeric) || 0,
      }));
    }
  };

  const handleSave = async () => {
    const err = validateThresholds(thresholds);
    if (err) {
      setToast({ visible: true, message: err, type: "error" });
      return;
    }
    try {
      setSaving(true);
      const res = await updateThresholds(poultryId, thresholds);
      if (res.success) {
        previousThresholds.current = thresholds;
        setToast({
          visible: true,
          message: "Seuils enregistrés ✓",
          type: "success",
        });
      }
    } catch (e) {
      setToast({
        visible: true,
        message: "Erreur lors de l'enregistrement",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Réinitialiser",
      "Voulez-vous réinitialiser les seuils aux valeurs par défaut ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Réinitialiser",
          onPress: () => {
            setThresholds(defaultThresholds);
            previousThresholds.current = defaultThresholds;
          },
        },
      ],
    );
  };

  // ── Alert handlers ────────────────────────────────────────────────────────
  const handleMarkAsRead = async (alertId) => {
    try {
      await markAlertAsRead(alertId);
      setAlerts((prev) =>
        prev.map((a) =>
          a._id === alertId ? { ...a, read: true, isRead: true } : a,
        ),
      );
      setStats((prev) =>
        prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev,
      );
    } catch (e) {
      console.log(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, read: true, isRead: true })),
      );
      setStats((prev) => (prev ? { ...prev, unread: 0 } : prev));
    } catch (e) {
      console.log("[AlertSettings] markAllAsRead error:", e);
    }
  };

  const handleDeleteRead = () => {
    // 🔴 Sécurité : vérifier ID
    if (!poultryId) {
      console.log("ERROR: poultryId is undefined");
      setToast({
        visible: true,
        message: "Erreur: poulailler non défini",
        type: "error",
      });
      return;
    }

    Alert.alert("Supprimer", "Supprimer les alertes lues ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            console.log("Deleting alerts for:", poultryId);

            // 🔥 Appel API
            const res = await deleteReadAlerts(poultryId);

            console.log("DELETE RESULT:", res);

            // 🔴 Recharge depuis backend (source de vérité)
            const alertRes = await getAlerts(poultryId);
            if (alertRes.success) {
              setAlerts(
                Array.isArray(alertRes.data) ? alertRes.data.slice(0, 30) : [],
              );
            }

            // 🔴 Refresh stats
            const statsRes = await getAlertStats(poultryId);
            if (statsRes.success) {
              setStats(statsRes.data);
            }

            // 🔥 Feedback réel
            const deleted = res?.deleted || 0;

            setToast({
              visible: true,
              message:
                deleted > 0
                  ? `${deleted} alerte(s) supprimée(s)`
                  : "Aucune alerte lue à supprimer",
              type: deleted > 0 ? "success" : "error",
            });
          } catch (e) {
            console.log("DELETE ERROR:", e);

            setToast({
              visible: true,
              message: "Erreur lors de la suppression",
              type: "error",
            });
          }
        },
      },
    ]);
  };

  return {
    loading,
    saving,
    stats,
    alerts,
    thresholds,
    hasChanges,
    fetchData,
    handleThresholdChange,
    handleSave,
    handleReset,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleDeleteRead,
  };
}
