const Log = require("../models/Log");

/**
 * Service centralisé pour la gestion des logs
 */
const logService = {
  /**
   * Créer une entrée de log
   * @param {Object} params - Paramètres du log
   * @param {string} params.type - Type de log
   * @param {string} params.severity - Sévérité (info, warning, error, critical)
   * @param {string} params.message - Message principal
   * @param {string} params.description - Description supplémentaire
   * @param {string} params.user - ID de l'utilisateur effectuant l'action
   * @param {string} params.targetUser - ID de l'utilisateur cible
   * @param {string} params.poulailler - ID du poulailler
   * @param {string} params.module - ID du module
   * @param {string} params.alert - ID de l'alerte
   * @param {string} params.command - ID de la commande
   * @param {Object} params.metadata - Métadonnées supplémentaires
   * @param {string} params.ipAddress - Adresse IP du client
   * @param {string} params.userAgent - User agent du client
   */
  create: async (params) => {
    try {
      const logEntry = await Log.create({
        type: params.type,
        severity: params.severity || "info",
        message: params.message,
        description: params.description,
        user: params.user,
        targetUser: params.targetUser,
        poulailler: params.poulailler,
        module: params.module,
        alert: params.alert,
        command: params.command,
        metadata: params.metadata || {},
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      return logEntry;
    } catch (error) {
      console.error("[LOG SERVICE ERROR]", error);
      // Ne pas throw l'erreur pour ne pas bloquer l'action principale
      return null;
    }
  },

  // Raccourcis pour les types de logs courants

  /**
   * Log de connexion utilisateur
   */
  userLogin: async (userId, ipAddress, userAgent) => {
    return logService.create({
      type: "user_login",
      severity: "info",
      message: "Connexion utilisateur",
      description: `L'utilisateur s'est connecté`,
      user: userId,
      ipAddress,
      userAgent,
    });
  },

  /**
   * Log de déconnexion utilisateur
   */
  userLogout: async (userId, ipAddress) => {
    return logService.create({
      type: "user_logout",
      severity: "info",
      message: "Déconnexion utilisateur",
      description: `L'utilisateur s'est déconnecté`,
      user: userId,
      ipAddress,
    });
  },

  /**
   * Log de création d'utilisateur
   */
  userCreated: async (adminUserId, newUserId, userEmail, ipAddress) => {
    return logService.create({
      type: "user_created",
      severity: "info",
      message: "Création d'utilisateur",
      description: `Nouvel utilisateur créé: ${userEmail}`,
      user: adminUserId,
      targetUser: newUserId,
      ipAddress,
    });
  },

  /**
   * Log de mise à jour d'utilisateur
   */
  userUpdated: async (adminUserId, targetUserId, changes, ipAddress) => {
    return logService.create({
      type: "user_updated",
      severity: "info",
      message: "Modification d'utilisateur",
      description: `Utilisateur modifié. Champs changés: ${changes.join(", ")}`,
      user: adminUserId,
      targetUser: targetUserId,
      metadata: { changes },
      ipAddress,
    });
  },

  /**
   * Log de suppression d'utilisateur
   */
  userDeleted: async (adminUserId, targetUserId, userEmail, ipAddress) => {
    return logService.create({
      type: "user_deleted",
      severity: "warning",
      message: "Suppression d'utilisateur",
      description: `Utilisateur supprimé: ${userEmail}`,
      user: adminUserId,
      targetUser: targetUserId,
      ipAddress,
    });
  },

  /**
   * Log de création de poulailler
   */
  poulaillerCreated: async (userId, poulaillerId, poulaillerName) => {
    return logService.create({
      type: "poulailler_created",
      severity: "info",
      message: "Création de poulailler",
      description: `Nouveau poulailler créé: ${poulaillerName}`,
      user: userId,
      poulailler: poulaillerId,
    });
  },

  /**
   * Log de mise à jour de poulailler
   */
  poulaillerUpdated: async (userId, poulaillerId, changes) => {
    return logService.create({
      type: "poulailler_updated",
      severity: "info",
      message: "Modification de poulailler",
      description: `Poulailler modifié. Champs changés: ${changes.join(", ")}`,
      user: userId,
      poulailler: poulaillerId,
      metadata: { changes },
    });
  },

  /**
   * Log de suppression de poulailler
   */
  poulaillerDeleted: async (userId, poulaillerId, poulaillerName) => {
    return logService.create({
      type: "poulailler_deleted",
      severity: "warning",
      message: "Suppression de poulailler",
      description: `Poulailler supprimé: ${poulaillerName}`,
      user: userId,
      poulailler: poulaillerId,
    });
  },

  /**
   * Log de claim de module
   */
  moduleClaimed: async (userId, poulaillerId, moduleId) => {
    return logService.create({
      type: "module_claimed",
      severity: "info",
      message: "Module associé",
      description: `Module ESP32 associé à un poulailler`,
      user: userId,
      poulailler: poulaillerId,
      module: moduleId,
    });
  },

  /**
   * Log de dissociation de module
   */
  moduleDissociated: async (userId, poulaillerId, moduleId) => {
    return logService.create({
      type: "module_dissociated",
      severity: "warning",
      message: "Module dissocié",
      description: `Module ESP32 dissocié d'un poulailler`,
      user: userId,
      poulailler: poulaillerId,
      module: moduleId,
    });
  },

  /**
   * Log de module hors ligne
   */
  moduleOffline: async (moduleId, poulaillerId) => {
    return logService.create({
      type: "module_offline",
      severity: "warning",
      message: "Module hors ligne",
      description: `Le module ESP32 est maintenant hors ligne`,
      poulailler: poulaillerId,
      module: moduleId,
    });
  },

  /**
   * Log de création d'alerte
   */
  alertCreated: async (
    alertId,
    poulaillerId,
    moduleId,
    severity,
    parameter,
  ) => {
    return logService.create({
      type: "alert_created",
      severity: severity === "critical" ? "error" : "warning",
      message: `Alerte ${severity}: ${parameter}`,
      description: `Nouvelle alerte détectée`,
      poulailler: poulaillerId,
      module: moduleId,
      alert: alertId,
    });
  },

  /**
   * Log de résolution d'alerte
   */
  alertResolved: async (userId, alertId, poulaillerId) => {
    return logService.create({
      type: "alert_resolved",
      severity: "info",
      message: "Alerte résolue",
      description: `Alerte marquée comme résolue`,
      user: userId,
      poulailler: poulaillerId,
      alert: alertId,
    });
  },

  /**
   * Log de commande envoyée
   */
  commandSent: async (userId, poulaillerId, commandId, commandType) => {
    return logService.create({
      type: "command_sent",
      severity: "info",
      message: `Commande ${commandType} envoyée`,
      description: `Commande envoyée au module`,
      user: userId,
      poulailler: poulaillerId,
      command: commandId,
    });
  },

  /**
   * Log de commande exécutée
   */
  commandExecuted: async (poulaillerId, commandId, commandType, status) => {
    return logService.create({
      type: "command_executed",
      severity: status === "failed" ? "error" : "info",
      message: `Commande ${commandType} ${status}`,
      description: `Commande ${status === "failed" ? "échouée" : "exécutée"}`,
      poulailler: poulaillerId,
      command: commandId,
      metadata: { status },
    });
  },

  /**
   * Log d'erreur système
   */
  systemError: async (error, context, userId) => {
    return logService.create({
      type: "system_error",
      severity: "error",
      message: "Erreur système",
      description: error.message || "Une erreur s'est produite",
      user: userId,
      metadata: {
        stack: error.stack,
        context,
      },
    });
  },

  /**
   * Log d'information système
   */
  systemInfo: async (message, metadata) => {
    return logService.create({
      type: "system_info",
      severity: "info",
      message: "Information système",
      description: message,
      metadata,
    });
  },
};

module.exports = logService;
