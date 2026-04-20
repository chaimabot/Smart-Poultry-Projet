import api from "./api";

// Envoyer une commande à la lampe (On/Off ou Auto/Manual)
export const controlLamp = async (id, mode, action) => {
  try {
    // Utilise la route PATCH configurée dans le backend
    const response = await api.patch(`/lampe/${id}/control`, {
      mode, // 'auto' ou 'manual'
      action, // 'on' ou 'off'
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};

// Mettre à jour les seuils de température
export const updateLampThresholds = async (
  id,
  temperatureMin,
  temperatureMax,
) => {
  try {
    // Utilise la route PUT configurée dans le backend
    const response = await api.put(`/lampe/${id}/thresholds`, {
      temperatureMin,
      temperatureMax,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { error: "Erreur réseau" };
  }
};
