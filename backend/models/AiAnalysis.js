// services/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// Service IA — Smart Poultry
// Calqué exactement sur le pattern de services/poultry.js
// ─────────────────────────────────────────────────────────────────────────────
import api from "./api"; // ← même instance axios que poultry.js

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE
// ─────────────────────────────────────────────────────────────────────────────

// Envoie l'image capturée par le mobile au backend (même endpoint que l'ESP32)
// Body : { poulaillerId, imageBase64 }
export const sendImageToBackend = async (poulaillerId, imageBase64) => {
  try {
    const response = await api.post("/ai/receive-image", {
      poulaillerId,
      imageBase64,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSE IA
// ─────────────────────────────────────────────────────────────────────────────

// Déclenche une capture + analyse IA via l'ESP32-CAM
// Body : { triggeredBy: "user" }
// Retourne : { success, data: { requestId, pollUrl, cameraMac, mqttSent } }
export const analyzePoultry = async (poulaillerId, triggeredBy = "user") => {
  try {
    // ✅ FIX : l'endpoint correct est /ai/capture/:poulaillerId (pas /ai/analyze)
    const response = await api.post(`/ai/capture/${poulaillerId}`, {
      triggeredBy,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère la dernière analyse IA d'un poulailler
// Retourne : { success, data: AiAnalysis | null }
export const getLatestAnalysis = async (poulaillerId) => {
  try {
    const response = await api.get(`/ai/latest/${poulaillerId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère l'historique des analyses IA d'un poulailler (10 dernières)
// Retourne : { success, count, data: AiAnalysis[] }
export const getAnalysisHistory = async (poulaillerId) => {
  try {
    const response = await api.get(`/ai/history/${poulaillerId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les statistiques des analyses IA d'un poulailler
// Retourne : { success, data: { totalAnalyses, avgHealthScore, trend, lastScore, urgencyDistribution } }
export const getAnalysisStats = async (poulaillerId) => {
  try {
    const response = await api.get(`/ai/stats/${poulaillerId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHATBOT VÉTÉRINAIRE
// ─────────────────────────────────────────────────────────────────────────────

// Envoie une question au chatbot vétérinaire (Gemma 3 via Cloudflare)
// Body : { question, poulaillerId }
// Retourne : { success, data: { answer, context: { lastHealthScore, lastUrgency, lastAnalysisDate } } }
export const chatWithVet = async (question, poulaillerId) => {
  try {
    const response = await api.post("/ai/chat", {
      question,
      poulaillerId,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
