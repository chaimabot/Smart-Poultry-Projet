import api from "./api";

/**
 * Envoyer une commande au ventilateur (On/Off ou Auto/Manual)
 * @param {string} id - L'ID du poulailler
 * @param {string} mode - 'auto' ou 'manual'
 * @param {string} action - 'on' ou 'off'
 */
export const controlVentilateur = async (id, mode, action) => {
  try {
    // Appel de la route PATCH configurée dans le backend pour le ventilateur
    const response = await api.patch(`/ventilateur/${id}/control`, {
      mode, // 'auto' ou 'manual'
      action, // 'on' ou 'off'
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

/**
 * Mettre à jour les seuils de température pour le ventilateur
 * @param {string} id - L'ID du poulailler
 * @param {number} temperatureMax - Seuil où le ventilateur s'allume (ex: 30°C)
 */
export const updateVentilateurThresholds = async (id, temperatureMax) => {
  try {
    // Appel de la route PUT pour les seuils du ventilateur
    const response = await api.put(`/ventilateur/${id}/thresholds`, {
      temperatureMax,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
