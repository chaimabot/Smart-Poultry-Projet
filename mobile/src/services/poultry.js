import api from "./api";

export const getPoultries = async () => {
  try {
    const response = await api.get("/poulaillers");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getPoultryById = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const createPoultry = async (poultryData) => {
  try {
    const response = await api.post("/poulaillers", poultryData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const updatePoultry = async (id, poultryData) => {
  try {
    const response = await api.put(`/poulaillers/${id}`, poultryData);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const deletePoultry = async (id) => {
  try {
    await api.delete(`/poulaillers/${id}`);
    return true;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const archivePoultry = async (id) => {
  try {
    const response = await api.post(`/poulaillers/${id}/archive`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const restorePoultry = async (id) => {
  try {
    const response = await api.put(`/poulaillers/${id}`, { isArchived: false });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getArchivedPoultries = async () => {
  try {
    const response = await api.get("/poulaillers/archives");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getPoultriesSummary = async () => {
  try {
    const response = await api.get("/poulaillers/summary");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getCriticalPoultries = async () => {
  try {
    const response = await api.get("/poulaillers/critical");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getThresholds = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}/thresholds`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const updateThresholds = async (id, thresholds) => {
  try {
    const response = await api.put(`/poulaillers/${id}/thresholds`, thresholds);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ✅ CORRIGÉ — utilise poulaillerId (nom attendu par le backend)
export const getAlerts = async (poultryId) => {
  try {
    const response = await api.get("/alerts", {
      params: { poulaillerId: poultryId },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ✅ CORRIGÉ — envoie alertId dans le body
export const markAlertAsRead = async (alertId) => {
  try {
    const response = await api.post("/alerts/read", { alertId });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ✅ NOUVEAU — marquer toutes les alertes d'un poulailler comme lues
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

// ✅ NOUVEAU — supprimer les alertes lues
export const deleteReadAlerts = async (poultryId) => {
  try {
    const response = await api.delete("/alerts", {
      params: { poulaillerId: poultryId },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// ✅ NOUVEAU — statistiques des alertes
export const getAlertStats = async (poultryId) => {
  try {
    const response = await api.get("/alerts/stats", {
      params: { poulaillerId: poultryId },
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const getMonitoringData = async (id) => {
  try {
    const response = await api.get(`/poulaillers/${id}/monitoring`);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const controlActuator = async (id, actuator, state, mode = "manual") => {
  try {
    const response = await api.patch(`/poulaillers/${id}/actuators`, {
      actuator,
      state,
      mode,
    });
    return response.data;
  } catch (error) {
    // ✅ Lever une vraie Error avec le message du serveur
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Erreur réseau";
    throw new Error(message);
  }
};

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

// ✅ NOUVEAU — récupérer les seuils par défaut depuis SystemConfig
export const getDefaultThresholds = async () => {
  try {
    const response = await api.get("/system-config/default-thresholds");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
