import api from "./api"; // ton instance axios configurée avec baseURL + token

// ── Obtenir le SSID WiFi actuel enregistré pour un poulailler ────────────────
export const getDeviceWifi = async (poultryId) => {
  const response = await api.get(`/wifi/${poultryId}`);
  return response.data;
};

export const updateDeviceWifi = async (poultryId, { ssid, password }) => {
  const response = await api.put(`/wifi/${poultryId}`, { ssid, password });
  return response.data;
};
