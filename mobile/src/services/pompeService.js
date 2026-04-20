import api from "./api";

// Envoyer une commande à la pompe (On/Off ou Auto/Manual)
export const controlPump = async (id, mode, action) => {
  try {
    // Utilise la route PATCH configurée dans le backend
    const response = await api.patch(`/pompe/${id}/control`, {
      mode, // 'auto' ou 'manual'
      action, // 'on' ou 'off'
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Mettre à jour les seuils de niveau d'eau
export const updatePumpThresholds = async (
  id,
  waterLevelMin,
  waterHysteresis,
) => {
  try {
    // Utilise la route PUT configurée dans le backend
    const response = await api.put(`/pompe/${id}/thresholds`, {
      waterLevelMin,
      waterHysteresis,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
