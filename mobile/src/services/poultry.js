// services/poultry.js - COMPLET ✅ Sans doublons
import api from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// POULAILLERS
// ─────────────────────────────────────────────────────────────────────────────

// Récupère la liste de tous les poulaillers
export const getPoultries = async () => {
  try {
    const response = await api.get("/poulaillers");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les informations d'un poulailler par son id
export const getPoultryById = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Crée un nouveau poulailler
export const createPoultry = async (poultryData) => {
  try {
    console.log(
      "[createPoultry] body envoyé :",
      JSON.stringify(poultryData, null, 2),
    );
    const response = await api.post("/poulaillers", poultryData);
    return response.data;
  } catch (error) {
    console.log(
      "[createPoultry] erreur complète :",
      JSON.stringify(error.response?.data, null, 2),
    );
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Met à jour les informations d'un poulailler
export const updatePoultry = async (id, poultryData) => {
  try {
    const response = await api.put(`/poulaillers/${id}`, poultryData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Supprime un poulailler
export const deletePoultry = async (id) => {
  try {
    await api.delete(`/poulaillers/${id}`);
    return true;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Archive un poulailler
export const archivePoultry = async (id) => {
  try {
    const response = await api.post(`/poulaillers/${id}/archive`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Restaure un poulailler archivé
export const restorePoultry = async (id) => {
  try {
    const response = await api.put(`/poulaillers/${id}`, {
      isArchived: false,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère la liste des poulaillers archivés
export const getArchivedPoultries = async () => {
  try {
    const response = await api.get("/poulaillers/archives");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère un résumé global des poulaillers
export const getPoultriesSummary = async () => {
  try {
    const response = await api.get("/poulaillers/summary");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les poulaillers en état critique
export const getCriticalPoultries = async () => {
  try {
    const response = await api.get("/poulaillers/critical");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les seuils d'un poulailler
export const getThresholds = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}/thresholds`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Met à jour les seuils d'un poulailler
export const updateThresholds = async (id, thresholds) => {
  try {
    const response = await api.put(`/poulaillers/${id}/thresholds`, thresholds);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les données de monitoring (capteurs)
export const getMonitoringData = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}/monitoring`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ✅ CORRIGÉ — déclaration complète de la fonction
// Envoie une commande pour contrôler un actionneur
export const controlActuator = async (id, actuator, state, mode = "manual") => {
  try {
    const response = await api.patch(`/poulaillers/${id}/actuators`, {
      actuator,
      state,
      mode,
    });
    return response.data;
  } catch (error) {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Erreur réseau";
    throw new Error(message);
  }
};

// Récupère l'historique des mesures d'un capteur
export const getMeasureHistory = async (
  id,
  sensor = "temperature",
  period = "24h",
) => {
  try {
    const response = await api.get(`/poulaillers/${id}/history`, {
      params: { sensor, period },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Récupère les seuils par défaut du système
export const getDefaultThresholds = async () => {
  try {
    const response = await api.get("/system-config/default-thresholds");
    return response.data;
  } catch (error) {
    console.error("[poultry] getDefaultThresholds error:", error.message);
    return { success: false, data: null };
  }
};

// Récupère le device (module ESP32) associé à un poulailler
export const getDeviceByPoulailler = async (poulaillerId) => {
  try {
    const response = await api.get(`/devices/by-poulailler/${poulaillerId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ALERTES
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/alerts/poulailler/:id ───────────────────────────────────────────
// Récupère les alertes d'un poulailler
// Retourne { success, count, total, page, pages, data: [...] }
export const getAlerts = async (poulaillerId, params = {}) => {
  try {
    const response = await api.get(`/alerts/poulailler/${poulaillerId}`, {
      params,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── GET /api/alerts/stats ─────────────────────────────────────────────────────
// Récupère les statistiques des alertes d'un poulailler
export const getAlertStats = async (poultryId) => {
  try {
    const response = await api.get("/alerts/stats", {
      params: { poultryId },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── PATCH /api/alerts/:id/read ───────────────────────────────────────────────
// Marque une alerte spécifique comme lue
export const markAlertAsRead = async (alertId) => {
  try {
    const response = await api.patch(`/alerts/${alertId}/read`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── PATCH /api/alerts/bulk/read ──────────────────────────────────────────────
// Marque plusieurs alertes comme lues en une seule requête
// Body : { alertIds: ["id1", "id2", ...] }
export const markBulkAlertsAsRead = async (alertIds) => {
  try {
    const response = await api.patch(`/alerts/bulk/read`, { alertIds });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── POST /api/alerts/read ────────────────────────────────────────────────────
// Marque toutes les alertes d'un poulailler comme lues
export const markAllAlertsAsRead = async (poultryId) => {
  try {
    const response = await api.post("/alerts/read", {
      poulaillerId: poultryId,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── DELETE /api/alerts ───────────────────────────────────────────────────────
// Supprime les alertes déjà lues d'un poulailler
export const deleteReadAlerts = async (poultryId) => {
  try {
    const response = await api.delete("/alerts", {
      params: { poultryId },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── DELETE /api/alerts/:id ───────────────────────────────────────────────────
// Supprime une alerte spécifique
export const deleteOneAlert = async (alertId) => {
  try {
    const response = await api.delete(`/alerts/${alertId}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── DELETE /api/alerts/bulk ──────────────────────────────────────────────────
// Supprime plusieurs alertes par IDs
// Body : { alertIds: ["id1", "id2", ...] }
export const deleteBulkAlerts = async (alertIds) => {
  try {
    const response = await api.delete(`/alerts/bulk`, {
      data: { alertIds },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ── POST /api/alerts ─────────────────────────────────────────────────────────
// Crée une alerte liée à un actionneur (porte, ventilateur, lampe)
export const createActuatorAlert = async (poultryId, actuator, state) => {
  try {
    const response = await api.post("/alerts", {
      poulaillerId: poultryId,
      type: "actuator",
      actuator,
      state: state ? "on" : "off",
      triggeredBy: "manual",
    });
    return response.data;
  } catch (error) {
    console.error("[poultry] createActuatorAlert error:", error.message);
    return null;
  }
};

// ── GET /api/poulaillers/:id/commands ── Historique commandes
export const getPoulaillerCommands = async (poultryId) => {
  try {
    const response = await api.get(`/poulaillers/${poultryId}/commands`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
