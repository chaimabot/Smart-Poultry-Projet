/**
 * NotificationService — Smart Poultry (Mobile)
 *
 * Couche d'abstraction entre le composant React Native et l'API backend.
 * Gère la récupération, le comptage, le groupement et le marquage des alertes.
 *
 * Toutes les fonctions sont asynchrones et gèrent les erreurs en interne
 * pour ne jamais faire planter le composant appelant.
 */

import api from "./api"; // Votre instance axios configurée (baseURL + token auth)

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Alert
 * @property {string}  _id
 * @property {string}  poulailler
 * @property {"sensor"|"door"|"actuator"|"mqtt"} type
 * @property {string}  key
 * @property {string|null} parameter
 * @property {string|null} sensorLabel
 * @property {string|null} sensorUnit
 * @property {number|null} value
 * @property {number|null} threshold
 * @property {"above"|"below"|null} direction
 * @property {"info"|"warn"|"danger"} severity
 * @property {string}  icon
 * @property {string}  message
 * @property {boolean} read
 * @property {boolean} isRead
 * @property {string|null} resolvedAt
 * @property {string}  timestamp   — alias de createdAt pour le mobile
 * @property {string}  createdAt
 * @property {string}  updatedAt
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. RÉCUPÉRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère toutes les alertes d'un poulailler, triées du plus récent au plus ancien.
 *
 * @param {string} poultryId
 * @param {{ read?: boolean, severity?: string, type?: string, limit?: number, page?: number }} options
 * @returns {Promise<Alert[]>}
 */
export const getNotifications = async (poultryId, options = {}) => {
  if (!poultryId) return [];

  try {
    const params = { poultryId, limit: 50, page: 1, ...options };
    const response = await api.get("/alerts", { params });

    if (response.data?.success && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error("[NotificationService] getNotifications :", error.message);
    return [];
  }
};

/**
 * Récupère uniquement les alertes non lues.
 *
 * @param {string} poultryId
 * @returns {Promise<Alert[]>}
 */
export const getUnreadNotifications = async (poultryId) => {
  return getNotifications(poultryId, { read: false });
};

/**
 * Récupère uniquement les alertes de type "danger" non lues.
 *
 * @param {string} poultryId
 * @returns {Promise<Alert[]>}
 */
export const getDangerNotifications = async (poultryId) => {
  return getNotifications(poultryId, { severity: "danger", read: false });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMPTEURS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le nombre d'alertes non lues pour un poulailler.
 *
 * @param {string} poultryId
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (poultryId) => {
  if (!poultryId) return 0;

  try {
    const response = await api.get("/alerts/stats", {
      params: { poultryId },
    });

    if (response.data?.success) {
      return response.data.data.unread ?? 0;
    }
    return 0;
  } catch (error) {
    console.error("[NotificationService] getUnreadCount :", error.message);
    return 0;
  }
};

/**
 * Retourne le nombre d'alertes "danger" non lues.
 *
 * @param {string} poultryId
 * @returns {Promise<number>}
 */
export const getDangerCount = async (poultryId) => {
  if (!poultryId) return 0;

  try {
    const response = await api.get("/alerts/stats", {
      params: { poultryId },
    });

    if (response.data?.success) {
      return response.data.data.danger ?? 0;
    }
    return 0;
  } catch (error) {
    console.error("[NotificationService] getDangerCount :", error.message);
    return 0;
  }
};

/**
 * Retourne les statistiques complètes d'alertes pour un poulailler.
 *
 * @param {string} poultryId
 * @returns {Promise<{ total: number, unread: number, danger: number, byType: Array, byParameter: Array } | null>}
 */
export const getAlertStats = async (poultryId) => {
  if (!poultryId) return null;

  try {
    const response = await api.get("/alerts/stats", {
      params: { poultryId },
    });

    if (response.data?.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error("[NotificationService] getAlertStats :", error.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. DERNIÈRES ALERTES PAR SÉVÉRITÉ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne la dernière alerte "danger" non résolue (ou null).
 *
 * @param {string} poultryId
 * @returns {Promise<Alert|null>}
 */
export const getLastDanger = async (poultryId) => {
  const alerts = await getNotifications(poultryId, {
    severity: "danger",
    read: false,
    limit: 1,
  });
  return alerts[0] ?? null;
};

/**
 * Retourne la dernière alerte "warn" non résolue (ou null).
 *
 * @param {string} poultryId
 * @returns {Promise<Alert|null>}
 */
export const getLastWarn = async (poultryId) => {
  const alerts = await getNotifications(poultryId, {
    severity: "warn",
    read: false,
    limit: 1,
  });
  return alerts[0] ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MARQUAGE COMME LU
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marque toutes les alertes d'un poulailler comme lues (appel API backend).
 *
 * @param {string} poultryId
 * @returns {Promise<boolean>} — true si succès
 */
export const markAllRead = async (poultryId) => {
  if (!poultryId) return false;

  try {
    const response = await api.post("/alerts/read", {
      poulaillerId: poultryId,
    });
    return response.data?.success === true;
  } catch (error) {
    console.error("[NotificationService] markAllRead :", error.message);
    return false;
  }
};

/**
 * Marque une alerte spécifique comme lue.
 *
 * @param {string} alertId
 * @returns {Promise<boolean>}
 */
export const markOneRead = async (alertId) => {
  if (!alertId) return false;

  try {
    const response = await api.patch(`/alerts/${alertId}/read`);
    return response.data?.success === true;
  } catch (error) {
    console.error("[NotificationService] markOneRead :", error.message);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. FORMATAGE TEMPS RELATIF
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit un timestamp ISO en chaîne relative lisible.
 * Exemples : "À l'instant", "il y a 5 min", "il y a 2 h", "Hier", "il y a 3 j"
 *
 * @param {string|Date|null} timestamp
 * @returns {string}
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "À l'instant";

  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000); // secondes

  if (diff < 60) return "À l'instant";
  if (diff < 3600) {
    const min = Math.floor(diff / 60);
    return `il y a ${min} min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `il y a ${h} h`;
  }

  const days = Math.floor(diff / 86400);
  if (days === 1) return "Hier";
  if (days < 7) return `il y a ${days} j`;

  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. GROUPEMENT PAR DATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groupe une liste d'alertes par date (Aujourd'hui / Hier / Plus ancien).
 *
 * @param {Alert[]} notifications
 * @returns {{ label: string, data: Alert[] }[]}
 */
export const groupNotificationsByDate = (notifications) => {
  if (!Array.isArray(notifications) || notifications.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    today: [],
    yesterday: [],
    older: [],
  };

  for (const notif of notifications) {
    const ts = notif.timestamp || notif.createdAt;
    if (!ts) {
      groups.older.push(notif);
      continue;
    }

    const notifDate = new Date(ts);
    notifDate.setHours(0, 0, 0, 0);

    if (notifDate.getTime() === today.getTime()) {
      groups.today.push(notif);
    } else if (notifDate.getTime() === yesterday.getTime()) {
      groups.yesterday.push(notif);
    } else {
      groups.older.push(notif);
    }
  }

  const result = [];
  if (groups.today.length > 0) {
    result.push({ label: "Aujourd'hui", data: groups.today });
  }
  if (groups.yesterday.length > 0) {
    result.push({ label: "Hier", data: groups.yesterday });
  }
  if (groups.older.length > 0) {
    result.push({ label: "Plus ancien", data: groups.older });
  }

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. COULEURS ET STYLES PAR SÉVÉRITÉ (pour les composants React Native)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne les couleurs associées à une sévérité d'alerte.
 *
 * @param {"info"|"warn"|"danger"} severity
 * @returns {{ bg: string, dot: string, badgeBg: string, badgeColor: string, badgeBorder: string, label: string }}
 */
export const getSeverityStyle = (severity) => {
  switch (severity) {
    case "danger":
      return {
        bg: "#FEF2F2",
        dot: "#EF4444",
        badgeBg: "#FEF2F2",
        badgeColor: "#EF4444",
        badgeBorder: "#EF444430",
        label: "Danger",
      };
    case "warn":
      return {
        bg: "#FFF7ED",
        dot: "#F59E0B",
        badgeBg: "#FFF7ED",
        badgeColor: "#F59E0B",
        badgeBorder: "#F59E0B30",
        label: "Attention",
      };
    case "info":
    default:
      return {
        bg: "#F0FDF4",
        dot: "#22C55E",
        badgeBg: "#F0FDF4",
        badgeColor: "#22C55E",
        badgeBorder: "#22C55E30",
        label: "Info",
      };
  }
};

/**
 * Retourne le label lisible d'un type d'alerte.
 *
 * @param {"sensor"|"door"|"actuator"|"mqtt"} type
 * @returns {string}
 */
export const getTypeLabel = (type) => {
  const labels = {
    sensor: "Capteur",
    door: "Porte",
    actuator: "Actionneur",
    mqtt: "Connexion",
  };
  return labels[type] || type;
};
