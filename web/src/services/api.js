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
      // Redirect to root (login page) instead of /login
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);

export const authAPI = {
  login: (credentials) => api.post("/auth/admin/login", credentials),
};

export const dashboardAPI = {
  getStats: () => api.get("/admin/dashboard/stats"),
  getAlertesChart: (period = "7d") =>
    api.get(`/admin/dashboard/alertes-chart?period=${period}`),
  getModulesActivity: () => api.get("/admin/dashboard/modules-activity"),
  getAlertesRecentes: (limit = 5) =>
    api.get(`/admin/dashboard/alertes-recentes?limit=${limit}`),
  getPoulaillersCritiques: (limit = 5) =>
    api.get(`/admin/dashboard/poulaillers-critiques?limit=${limit}`),
  getActiviteRecente: (limit = 5) =>
    api.get(`/admin/dashboard/activite-recente?limit=${limit}`),
};

export const eleveursAPI = {
  // Inviter un nouvel eleveur
  invite: (data) => api.post("/admin/eleveurs/invite", data),

  // Obtenir la liste des eleveurs
  getAll: (params) => api.get("/admin/eleveurs", { params }),

  // Obtenir un eleveur par ID
  getById: (id) => api.get(`/admin/eleveurs/${id}`),

  // Mettre a jour un eleveur
  update: (id, data) => api.put(`/admin/eleveurs/${id}`, data),

  // Basculer le statut (activer/desactiver)
  toggleStatus: (id) => api.put(`/admin/eleveurs/${id}/toggle-status`),

  // Supprimer un eleveur
  delete: (id) => api.delete(`/admin/eleveurs/${id}`),

  // Renoyer l'invitation
  resendInvite: (id) => api.post(`/admin/eleveurs/${id}/resend-invite`),
};

export const modulesAPI = {
  // GET
  getAll: (params) => api.get("/admin/modules", { params }),
  getPendingPoulaillers: () => api.get("/admin/modules/pending-poulaillers"),
  getById: (id) => api.get(`/admin/modules/${id}`),

  // CREATE / UPDATE / DELETE
  create: (data) => api.post("/admin/modules", data),
  update: (id, data) => api.put(`/admin/modules/${id}`, data),
  delete: (id) => api.delete(`/admin/modules/${id}`),

  // BUSINESS LOGIC
  claim: (data) => api.post("/admin/modules/claim", data),
  dissociate: (moduleId, data) =>
    api.patch(`/admin/modules/${moduleId}/dissociate`, data),
};

export const poulaillersAPI = {
  getAll: (params) => api.get("/admin/poulaillers", { params }),
  getById: (id) => api.get(`/admin/poulaillers/${id}`),
  create: (data) => api.post("/admin/poulaillers", data),
  update: (id, data) => api.put(`/admin/poulaillers/${id}`, data),
  delete: (id) => api.delete(`/admin/poulaillers/${id}`),
  getUsers: () => api.get("/admin/poulaillers/users"),
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
  export: (params) => api.get("/admin/logs/export", { params }),
  cleanup: (olderThanDays) =>
    api.delete("/admin/logs/cleanup", { data: { olderThanDays } }),
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
  inviteAdmin: (data) => api.post("/admin/utilisateurs/invite-admin", data),
};
export const dossiersAPI = {
  getAll: (params) => api.get("/admin/dossiers", { params }),

  getById: (id) => api.get(`/admin/dossiers/${id}`),

  validate: (id) => api.patch(`/admin/dossiers/validate/${id}`),

  updateAmounts: (id, data) => api.put(`/admin/dossiers/${id}/finance`, data),

  clore: (id, body) => api.patch(`/admin/dossiers/clore/${id}`, body),
  annuler: (id, body) => api.patch(`/admin/dossiers/annuler/${id}`, body),
  delete: (id) => api.delete(`/admin/dossiers/${id}`),
};

export default api;
