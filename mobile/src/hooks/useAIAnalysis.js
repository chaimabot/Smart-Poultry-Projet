// hooks/useAIAnalysis.js
// ─────────────────────────────────────────────────────────────────────────────
// Hook React Native — Smart Poultry
// Utilise services/ai.js (même pattern que services/poultry.js)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

import {
  sendImageToBackend,
  analyzePoultry,
  getLatestAnalysis,
  getAnalysisHistory,
  getAnalysisStats,
  chatWithVet,
} from "../services/aiAnalysis";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function uriToBase64(uri) {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

function mapUrgency(level) {
  if (level === "critique") return "danger";
  if (level === "attention") return "warn";
  return "ok";
}

function mapBadge(level) {
  if (level === "critique") return "CRITIQUE";
  if (level === "attention") return "ATTENTION";
  return "NORMAL";
}

function fmtTime(iso) {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Transforme un document AiAnalysis (MongoDB) en objet attendu par les écrans
export function formatAnalysis(doc) {
  if (!doc) return null;

  const result = doc.result ?? {};
  const sensors = doc.sensors ?? {};

  return {
    id: doc._id,
    poulaillerId: doc.poulaillerId,
    triggeredBy: doc.triggeredBy,
    createdAt: doc.createdAt,
    time: fmtTime(doc.createdAt),

    healthScore: result.healthScore ?? 0,
    urgencyLevel: result.urgencyLevel ?? "normal",
    status: mapUrgency(result.urgencyLevel),
    badge: mapBadge(result.urgencyLevel),

    diagnostic: result.diagnostic ?? "",
    advices: result.advices ?? [],
    confidence: result.confidence ?? 100,

    detections: {
      mortalityDetected: result.detections?.mortalityDetected ?? false,
      behaviorNormal: result.detections?.behaviorNormal ?? true,
      densityOk: result.detections?.densityOk ?? true,
      cleanEnvironment: result.detections?.cleanEnvironment ?? true,
      ventilationAdequate: result.detections?.ventilationAdequate ?? true,
    },

    // Capteurs enrichis pour AIDetailScreen
    sensors: {
      temperature: {
        value: sensors.temperature ?? "--",
        ok: sensors.temperature >= 18 && sensors.temperature <= 28,
        status:
          sensors.temperature > 28
            ? "Élevée"
            : sensors.temperature < 18
              ? "Basse"
              : "Normale",
      },
      humidity: {
        value: sensors.humidity ?? "--",
        ok: sensors.humidity >= 40 && sensors.humidity <= 70,
        status:
          sensors.humidity > 70
            ? "Élevée"
            : sensors.humidity < 40
              ? "Basse"
              : "Normale",
      },
      airQuality: {
        value: sensors.airQualityPercent ?? "--",
        ok: sensors.airQualityPercent >= 40,
        status:
          sensors.airQualityPercent < 20
            ? "Critique"
            : sensors.airQualityPercent < 40
              ? "Faible"
              : "Bonne",
      },
      waterLevel: {
        value: sensors.waterLevel ?? "--",
        ok: sensors.waterLevel >= 20,
        status:
          sensors.waterLevel < 20
            ? "Insuffisant"
            : sensors.waterLevel < 40
              ? "Faible"
              : "Suffisant",
      },
    },

    imageQuality: {
      sizeKb: doc.imageQuality?.sizeKb ?? 0,
      status: doc.imageQuality?.status ?? "poor",
      clarity: (doc.imageQuality?.sizeKb ?? 0) > 10 ? 85 : 60,
    },

    model: {
      name: "Gemma 3 12B",
      platform: "Cloudflare AI",
      fallback: "LLaVA 1.5",
      version: "gemma-3-12b-it",
    },
    processingTime: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function useAIAnalysis(poultryId) {
  const [analyzing, setAnalyzing] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // Evite les doubles appels si analyze est déjà en cours
  const lockRef = useRef(false);

  // ── Capture photo ──────────────────────────────────────────────────────────
  const captureImage = useCallback(async (source = "camera") => {
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") throw new Error("Permission caméra refusée");
    } else {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") throw new Error("Permission galerie refusée");
    }

    const options = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
      allowsEditing: false,
    };

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]?.uri) return null;
    return result.assets[0].uri;
  }, []);

  // ── Lancer une analyse IA ──────────────────────────────────────────────────
  const analyze = useCallback(
    async (imageUri) => {
      if (!poultryId) throw new Error("poultryId manquant");
      if (lockRef.current) throw new Error("Analyse déjà en cours");

      lockRef.current = true;
      setAnalyzing(true);
      setError(null);

      try {
        // 1. Conversion URI → base64
        const base64 = await uriToBase64(imageUri);

        // 2. Envoi image (même endpoint que l'ESP32)
        await sendImageToBackend(poultryId, base64);

        // 3. Déclenchement analyse (trigger MQTT + attente résultat)
        const response = await analyzePoultry(poultryId, "manual");

        if (!response?.success) {
          throw { error: response?.error || "Erreur analyse IA" };
        }

        const formatted = formatAnalysis(response.data);
        setLatestResult(formatted);
        return formatted;
      } catch (err) {
        const msg = err?.error || err?.message || "Erreur inconnue";
        setError(msg);
        throw { error: msg };
      } finally {
        setAnalyzing(false);
        lockRef.current = false;
      }
    },
    [poultryId],
  );

  // ── Dernière analyse ───────────────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!poultryId) return;
    try {
      const response = await getLatestAnalysis(poultryId);
      if (response?.success && response.data) {
        setLatestResult(formatAnalysis(response.data));
      }
    } catch (err) {
      setError(err?.error || err?.message);
    }
  }, [poultryId]);

  // ── Historique ─────────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!poultryId) return;
    try {
      const response = await getAnalysisHistory(poultryId);
      if (response?.success) {
        setHistory((response.data ?? []).map(formatAnalysis));
      }
    } catch (err) {
      setError(err?.error || err?.message);
    }
  }, [poultryId]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!poultryId) return;
    try {
      const response = await getAnalysisStats(poultryId);
      if (response?.success) {
        setStats(response.data);
      }
    } catch (err) {
      setError(err?.error || err?.message);
    }
  }, [poultryId]);

  // ── Chat vétérinaire ───────────────────────────────────────────────────────
  const askVet = useCallback(
    async (question) => {
      if (!poultryId) throw new Error("poultryId manquant");
      if (!question?.trim()) throw new Error("Question vide");

      setChatLoading(true);
      setError(null);

      try {
        const response = await chatWithVet(question.trim(), poultryId);

        if (!response?.success) {
          throw { error: response?.error || "Erreur chatbot" };
        }

        return {
          answer: response.data.answer,
          context: response.data.context,
        };
      } catch (err) {
        const msg = err?.error || err?.message || "Erreur inconnue";
        setError(msg);
        throw { error: msg };
      } finally {
        setChatLoading(false);
      }
    },
    [poultryId],
  );

  return {
    // État
    analyzing,
    chatLoading,
    latestResult,
    history,
    stats,
    error,

    // Actions
    captureImage,
    analyze,
    askVet,
    fetchLatest,
    fetchHistory,
    fetchStats,
  };
}
