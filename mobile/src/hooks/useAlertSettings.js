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

// Les clés attendues depuis la BD (SystemConfig.defaultThresholds)
// Pas de valeurs hardcodées — null signifie "pas encore chargé depuis la BD"
const EMPTY_THRESHOLDS = {
  temperatureMin: null,
  temperatureMax: null,
  humidityMin: null,
  humidityMax: null,
  co2Max: null,
  co2Warning: null,
  co2Critical: null,
  nh3Max: null,
  dustMax: null,
  waterLevelMin: null,
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
  // Vérifier qu'aucune valeur n'est encore null (BD pas encore chargée)
  const hasNull = Object.entries(vals).some(
    ([k, v]) =>
      [
        "temperatureMin",
        "temperatureMax",
        "humidityMin",
        "humidityMax",
        "co2Max",
        "nh3Max",
        "dustMax",
        "waterLevelMin",
      ].includes(k) && v === null,
  );
  if (hasNull) return "Les seuils ne sont pas encore chargés";

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

// ── Normalisation réponse BD ──────────────────────────────────────────────────

// Extrait uniquement les clés connues depuis SystemConfig.defaultThresholds
function normalizeDBThresholds(data) {
  if (!data) return null;

  // La BD retourne soit data directement, soit data.defaultThresholds
  const src = data.defaultThresholds ?? data;

  const result = {};
  const keys = Object.keys(EMPTY_THRESHOLDS);

  for (const key of keys) {
    // On n'accepte que les valeurs numériques — on rejette null/undefined/NaN
    const val = src[key];
    if (typeof val === "number" && !isNaN(val)) {
      result[key] = val;
    }
    // Si la clé est absente de la BD, elle reste absente du résultat
    // (le merge avec les seuils du poulailler gérera le cas)
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function useAlertSettings({ poultryId, activeTab, setToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState(EMPTY_THRESHOLDS);
  const [defaultThresholds, setDefaultThresholds] = useState(EMPTY_THRESHOLDS);
  const [dbLoadError, setDbLoadError] = useState(false);

  const previousThresholds = useRef(EMPTY_THRESHOLDS);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(thresholds) !== JSON.stringify(previousThresholds.current),
    [thresholds],
  );

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!poultryId) return;

    try {
      setLoading(true);
      setDbLoadError(false);

      // ── Étape 1 : seuils par défaut depuis BD (obligatoire) ───────────────
      // On attend ce résultat avant tout — c'est la source de vérité
      let dbDefaults = null;

      try {
        const defaultRes = await getDefaultThresholds();

        if (defaultRes.success && defaultRes.data) {
          dbDefaults = normalizeDBThresholds(defaultRes.data);
        }
      } catch (e) {
        console.error("[AlertSettings] getDefaultThresholds error:", e.message);
      }

      if (!dbDefaults) {
        // BD inaccessible ou retourne des données invalides
        setDbLoadError(true);
        setToast({
          visible: true,
          message: "Impossible de charger les seuils système depuis la BD",
          type: "error",
        });
        // On ne peut pas afficher de valeurs sensées sans la BD → on arrête ici
        setLoading(false);
        return;
      }

      setDefaultThresholds(dbDefaults);
      console.log("[AlertSettings] Seuils BD chargés ✓", dbDefaults);

      // ── Étape 2 : seuils poulailler + alertes + stats en parallèle ────────
      const [threshRes, alertRes, statsRes] = await Promise.all([
        getThresholds(poultryId),
        getAlerts(poultryId),
        getAlertStats(poultryId),
      ]);

      // Merge : base = BD, override = seuils propres au poulailler
      // Si le poulailler n'a pas de seuil personnalisé → on garde celui de la BD
      if (threshRes.success && threshRes.data) {
        const poultryThresholds = normalizeDBThresholds(threshRes.data) ?? {};
        const merged = { ...dbDefaults, ...poultryThresholds };
        setThresholds(merged);
        previousThresholds.current = merged;
      } else {
        // Pas de seuils propres → on affiche uniquement ceux de la BD
        setThresholds(dbDefaults);
        previousThresholds.current = dbDefaults;
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
      console.error("[AlertSettings] fetchData error:", e);
      setToast({
        visible: true,
        message: "Erreur de chargement des données",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [poultryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Threshold handlers ────────────────────────────────────────────────────
  const handleThresholdChange = (key, text) => {
    const numeric = text.replace(/[^0-9.-]/g, "");
    if (numeric === "" || !isNaN(parseFloat(numeric))) {
      setThresholds((prev) => ({
        ...prev,
        [key]: numeric === "" ? null : parseFloat(numeric),
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
      } else {
        setToast({
          visible: true,
          message: res.message || "Erreur lors de l'enregistrement",
          type: "error",
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
    if (dbLoadError || !defaultThresholds) {
      setToast({
        visible: true,
        message: "Seuils système non disponibles",
        type: "error",
      });
      return;
    }

    Alert.alert(
      "Réinitialiser",
      "Réinitialiser aux valeurs par défaut de la configuration système (BD) ?",
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
        prev.map((a) => (a._id === alertId ? { ...a, read: true } : a)),
      );
      setStats((prev) =>
        prev ? { ...prev, unread: Math.max(0, prev.unread - 1) } : prev,
      );
    } catch (e) {
      console.log("[AlertSettings] markAsRead error:", e);
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic update immédiat
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setStats((prev) => (prev ? { ...prev, unread: 0 } : prev));

    try {
      await markAllAlertsAsRead(poultryId);
    } catch (e) {
      console.log("[AlertSettings] markAllAsRead error:", e);
      // Rollback si backend échoue
      const alertRes = await getAlerts(poultryId);
      if (alertRes.success) {
        setAlerts(
          Array.isArray(alertRes.data) ? alertRes.data.slice(0, 30) : [],
        );
      }
      setToast({
        visible: true,
        message: "Erreur lors du marquage",
        type: "error",
      });
    }
  };

  const handleDeleteRead = () => {
    if (!poultryId) {
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
            const res = await deleteReadAlerts(poultryId);
            const deleted = res?.data?.deleted ?? res?.deleted ?? 0;

            const [alertRes, statsRes] = await Promise.all([
              getAlerts(poultryId),
              getAlertStats(poultryId),
            ]);

            if (alertRes.success) {
              setAlerts(
                Array.isArray(alertRes.data) ? alertRes.data.slice(0, 30) : [],
              );
            }
            if (statsRes.success) {
              setStats(statsRes.data);
            }

            setToast({
              visible: true,
              message:
                deleted > 0
                  ? `${deleted} alerte(s) supprimée(s)`
                  : "Aucune alerte lue à supprimer",
              type: deleted > 0 ? "success" : "info",
            });
          } catch (e) {
            console.log("[AlertSettings] deleteRead error:", e);
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
    defaultThresholds,
    dbLoadError,
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
