// services/pompeService.js (MOBILE)

import api from "./api";

/**
 * Envoyer une commande à la pompe
 * @param {string} id - ID du poulailler
 * @param {string} mode - 'auto' ou 'manual'
 * @param {string} action - 'on' ou 'off' (peut être null si changeModeOnly)
 * @param {boolean} changeModeOnly - Si true, ne change que le mode
 */
export const controlPump = async (id, mode, action, changeModeOnly = false) => {
  try {
    console.log("[controlPump] Envoi:", { id, mode, action, changeModeOnly });

    const response = await api.patch(`/pompe/${id}/control`, {
      mode,
      action,
      changeModeOnly,
    });

    console.log("[controlPump]   Réponse:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "[controlPump] ❌ Erreur:",
      error.response?.data || error.message,
    );
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

export const updatePumpThresholds = async (
  id,
  waterLevelMin,
  waterHysteresis,
) => {
  try {
    const response = await api.put(`/pompe/${id}/thresholds`, {
      waterLevelMin,
      waterHysteresis,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
