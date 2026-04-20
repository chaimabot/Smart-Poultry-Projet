// src/services/porteService.js

import api from "./api";

/**
 * Contrôle manuel de la porte
 */
export const controlPorte = async (poultryId, action) => {
  if (!poultryId) {
    throw new Error("poultryId est requis");
  }

  if (!["open", "close", "stop"].includes(action)) {
    throw new Error(`Action invalide : ${action}`);
  }

  try {
    console.log(
      `[PorteService] Contrôle porte → Poulailler ID: ${poultryId} | Action: ${action}`,
    );

    // ← Correction : on enlève le /api/ (déjà présent dans baseURL)
    const response = await api.post(`/porte/${poultryId}/control`, { action });

    console.log(`[PorteService] Succès pour poulailler ${poultryId}`);
    return response.data;
  } catch (error) {
    console.error(
      `[PorteService] Erreur :`,
      error.response?.data || error.message,
    );

    if (error.response?.status === 404) {
      throw new Error(
        `Route non trouvée. URL envoyée : /porte/${poultryId}/control`,
      );
    }

    throw (
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Erreur lors du contrôle de la porte"
    );
  }
};

/**
 * Configuration du planning
 */
export const configurerPlanning = async (poultryId, config) => {
  if (!poultryId) throw new Error("poultryId est requis");

  try {
    const response = await api.post(`/porte/${poultryId}/planning`, config);
    return response.data;
  } catch (error) {
    console.error(`[PorteService] Erreur planning:`, error.response?.data);
    throw error.response?.data?.message || "Erreur planning";
  }
};
