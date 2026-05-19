// hooks/useAIAnalysis.js
import { useState, useCallback } from "react";
import api from "../services/api";

export function useAIAnalysis(poulaillerId) {
  const [analyzing, setAnalyzing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [latestResult, setLatestResult] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);

  // ── Capture + analyse via ESP32CAM (MQTT + polling) ─────────────────────
  // ✅ FIX : /ai/capture retourne { requestId } pour polling,
  //          PAS imageBase64 directement. On poll /ai/capture-status/:requestId.
  const captureFromCamera = useCallback(
    async ({ onStatusUpdate } = {}) => {
      if (!poulaillerId) throw new Error("ID poulailler requis");

      setCapturing(true);
      try {
        // 1. Déclencher la capture MQTT
        const triggerRes = await api.post(`/ai/capture/${poulaillerId}`);
        if (!triggerRes.data?.success) {
          throw new Error(
            triggerRes.data?.error || "Erreur déclenchement capture",
          );
        }

        const { requestId } = triggerRes.data.data;
        if (!requestId) throw new Error("Aucun requestId reçu du serveur");

        onStatusUpdate?.("capturing");

        // 2. Polling toutes les 2s jusqu'à completed ou failed (max 90s)
        const result = await new Promise((resolve, reject) => {
          const start = Date.now();
          const TIMEOUT_MS = 90_000;

          const interval = setInterval(async () => {
            try {
              if (Date.now() - start > TIMEOUT_MS) {
                clearInterval(interval);
                return reject(
                  new Error("Timeout — ESP32CAM n'a pas répondu (90s)"),
                );
              }

              const statusRes = await api.get(
                `/ai/capture-status/${requestId}`,
              );
              const data = statusRes.data?.data;

              if (!data) return;

              onStatusUpdate?.(data.status);

              if (data.status === "completed") {
                clearInterval(interval);
                resolve(data);
              } else if (data.status === "failed") {
                clearInterval(interval);
                reject(new Error(statusRes.data?.error || "Capture échouée"));
              }
              // pending / capturing / uploading / analyzing → on continue
            } catch (pollErr) {
              if (pollErr.response?.status === 404) {
                clearInterval(interval);
                reject(new Error("Session expirée. Relancez l'analyse."));
              }
              // Erreur réseau passagère → on continue
            }
          }, 2000);
        });

        return result; // { status, imageUrl, thumbnailUrl, analysis }
      } finally {
        setCapturing(false);
      }
    },
    [poulaillerId],
  );

  // ── Analyse depuis une image base64 (mobile camera ou galerie) ──────────
  // ✅ FIX : utilise /ai/receive-image (endpoint réel pour upload d'image mobile)
  //          puis poll le résultat via capture-status
  const analyze = useCallback(
    async (imageBase64) => {
      if (!poulaillerId) throw new Error("ID poulailler requis");

      setAnalyzing(true);
      try {
        // Nettoyer le préfixe data:image si présent
        const clean = imageBase64.includes(",")
          ? imageBase64.split(",")[1]
          : imageBase64;

        // Envoyer l'image au backend (même endpoint que l'ESP32)
        const uploadRes = await api.post("/ai/receive-image", {
          poulaillerId,
          imageBase64: clean,
          // deviceId non requis pour upload mobile — le backend accepte poulaillerId direct
        });

        if (!uploadRes.data?.success) {
          throw new Error(uploadRes.data?.error || "Erreur upload image");
        }

        // Si la réponse contient déjà un résultat (analyse synchrone)
        if (uploadRes.data?.data?.result) {
          const result = uploadRes.data.data.result;
          setLatestResult(result);
          return result;
        }

        // Sinon poll si un requestId est retourné
        if (uploadRes.data?.data?.requestId) {
          const { requestId } = uploadRes.data.data;
          const polled = await new Promise((resolve, reject) => {
            const start = Date.now();
            const interval = setInterval(async () => {
              if (Date.now() - start > 60_000) {
                clearInterval(interval);
                return reject(new Error("Timeout analyse"));
              }
              try {
                const sr = await api.get(`/ai/capture-status/${requestId}`);
                const d = sr.data?.data;
                if (d?.status === "completed") {
                  clearInterval(interval);
                  resolve(d);
                } else if (d?.status === "failed") {
                  clearInterval(interval);
                  reject(new Error(sr.data?.error || "Analyse échouée"));
                }
              } catch (_) {}
            }, 2000);
          });
          const result = polled.analysis;
          setLatestResult(result);
          return result;
        }

        throw new Error("Réponse inattendue du serveur");
      } finally {
        setAnalyzing(false);
      }
    },
    [poulaillerId],
  );

  // ── Charger la dernière analyse depuis la BD ─────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!poulaillerId) return null;
    try {
      const res = await api.get(`/ai/latest/${poulaillerId}`);
      if (res.data?.success && res.data.data) {
        const result = res.data.data.result ?? null;
        setLatestResult(result);
        return res.data.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }, [poulaillerId]);

  // ── Chat IA vétérinaire ──────────────────────────────────────────────────
  const askVet = useCallback(
    async (question, history = []) => {
      if (!poulaillerId) throw new Error("ID poulailler requis");

      setChatLoading(true);
      try {
        const response = await api.post("/ai/chat", {
          question,
          poulaillerId,
          history,
        });

        if (!response.data?.success) {
          throw new Error(response.data?.error || "Erreur chat");
        }

        return response.data.data.answer;
      } finally {
        setChatLoading(false);
      }
    },
    [poulaillerId],
  );

  return {
    capturing,
    analyzing,
    latestResult,
    chatLoading,
    captureFromCamera, // ESP32CAM via MQTT + polling
    analyze, // image base64 mobile → upload + résultat
    fetchLatest, // dernière analyse en BD
    askVet, // chatbot vétérinaire
  };
}
