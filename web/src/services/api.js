import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      config.headers["x-auth-token"] = token;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const authAPI = {
  login: (credentials) => api.post("/auth/admin/login", credentials),
};

export const dashboardAPI = {
  getStats: () => api.get("/admin/dashboard/stats"),
};

export const eleveursAPI = {};

export const modulesAPI = {
  // Liste des modules avec pagination et filtres
  getAll: (params) => api.get("/admin/modules", { params }),

  // Obtenir un module par ID
  getById: (id) => api.get(`/admin/modules/${id}`),

  // Creer un nouveau module sans code claim
  create: (data) => api.post("/admin/modules", data),

  // Generate claim code pour un module existant ou nouveau
  generateClaimCode: (data) => api.post("/admin/modules/generate-claim", data),

  // Decoder le code QR et obtenir les infos du module avant claim
  decodeQR: (qrData) => api.post("/admin/modules/decode-qr", { qrData }),

  // Claimer un module avec son code
  // Claim + Associate en une seule etape
  claim: (claimCode, poulaillerId) =>
    api.post("/admin/modules/claim", { claimCode, poulaillerId }),

  // Associer le module a un poulailler
  associate: (moduleId, poulaillerId) =>
    api.put(`/admin/modules/${moduleId}/associate`, { poulaillerId }),

  // Dissocier le module d'un poulailler
  dissociate: (moduleId, data) =>
    api.put(`/admin/modules/${moduleId}/dissociate`, data),

  // Obtenir les poulaillers en attente de module
  getPendingPoulaillers: () => api.get("/admin/modules/pending-poulaillers"),

  // Supprimer un module
  delete: (id) => api.delete(`/admin/modules/${id}`),

  // Mettre a jour un module
  update: (id, data) => api.put(`/admin/modules/${id}`, data),
};

export const poulaillersAPI = {
  getAll: (params) => api.get("/admin/poulaillers", { params }),
  getById: (id) => api.get(`/admin/poulaillers/${id}`),
  update: (id, data) => api.put(`/admin/poulaillers/${id}`, data),
  delete: (id) => api.delete(`/admin/poulaillers/${id}`),
  getSeuils: (id) => api.get(`/poulaillers/${id}/seuils`),
  updateSeuils: (id, seuils) => api.put(`/poulaillers/${id}/seuils`, seuils),
};

export const alertesAPI = {
  getAll: (params) => api.get("/admin/alertes", { params }),
  getById: (id) => api.get(`/admin/alertes/${id}`),
  getStats: (period = "7d") => api.get(`/admin/alertes/stats?period=${period}`),
  markAsRead: (id) => api.put(`/admin/alertes/${id}/read`),
  resolve: (id) => api.put(`/admin/alertes/${id}/resolve`),
  delete: (id) => api.delete(`/admin/alertes/${id}`),
  markMultipleAsRead: (ids) =>
    api.put("/admin/alertes/mark-read", { alertIds: ids }),
  resolveMultiple: (ids) =>
    api.put("/admin/alertes/resolve-multiple", { alertIds: ids }),
  deleteMultiple: (ids) =>
    api.delete("/admin/alertes", { data: { alertIds: ids } }),
  export: (params) => api.get("/admin/alertes/export", { params }),
};

export const rapportsAPI = {
  getGlobal: (period = "7d") =>
    api.get(`/admin/rapports/global?period=${period}`),
  getAlertes: (period = "7d") =>
    api.get(`/admin/rapports/alertes?period=${period}`),
  getModules: (period = "7d") =>
    api.get(`/admin/rapports/modules?period=${period}`),
  getMesures: (period = "7d", poulaillerId) =>
    api.get(`/admin/rapports/mesures?period=${period}`, {
      params: { poulaillerId },
    }),
};

export const logsAPI = {
  getAll: (params) => api.get("/admin/logs", { params }),
  getStats: () => api.get("/admin/logs/stats"),
};

export const parametresAPI = {
  get: () => api.get("/admin/parametres"),
  update: (data) => api.put("/admin/parametres", data),
  updatePoulailler: (poulaillerId, thresholds) =>
    api.put(`/admin/parametres/${poulaillerId}`, { thresholds }),
};

export const utilisateursAPI = {
  getAll: (params) => api.get("/admin/utilisateurs", { params }),
  getById: (id) => api.get(`/admin/utilisateurs/${id}`),
  toggleStatus: (id) => api.put(`/admin/utilisateurs/${id}/toggle-status`),
  delete: (id) => api.delete(`/admin/utilisateurs/${id}`),
};

export default api;
