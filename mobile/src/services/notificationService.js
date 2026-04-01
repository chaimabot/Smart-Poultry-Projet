/**
 * Notification Service
 * Handles local notification management for the mobile app
 * Stores and retrieves alerts per poulailler
 */

import { getAlerts } from "./poultry";

/**
 * Format a timestamp to relative time string (e.g., "il y a 5min")
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return "À l'instant";

  const now = new Date();
  const diff = Math.floor((now - new Date(timestamp)) / 1000); // seconds

  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;

  const days = Math.floor(diff / 86400);
  if (days === 1) return "Hier";
  if (days < 7) return `il y a ${days}j`;

  return new Date(timestamp).toLocaleDateString("fr-FR");
};

/**
 * Get all notifications for a poulailler (sorted by timestamp descending)
 */
export const getNotifications = async (poultryId, limit = null) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return [];

    // Sort by timestamp descending (most recent first)
    const sorted = alerts.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );

    return limit ? sorted.slice(0, limit) : sorted;
  } catch (error) {
    console.error("[NotificationService] getNotifications error:", error);
    return [];
  }
};

/**
 * Count unread notifications for a poulailler
 */
export const getUnreadCount = async (poultryId) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return 0;
    return alerts.filter((a) => !a.read).length;
  } catch (error) {
    console.error("[NotificationService] getUnreadCount error:", error);
    return 0;
  }
};

/**
 * Get the last (most recent) danger notification for a poulailler
 */
export const getLastDanger = async (poultryId) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return null;

    const sorted = alerts.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
    return sorted.find((a) => a.severity === "danger") || null;
  } catch (error) {
    console.error("[NotificationService] getLastDanger error:", error);
    return null;
  }
};

/**
 * Get the last (most recent) warning notification for a poulailler
 */
export const getLastWarn = async (poultryId) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return null;

    const sorted = alerts.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
    return sorted.find((a) => a.severity === "warn") || null;
  } catch (error) {
    console.error("[NotificationService] getLastWarn error:", error);
    return null;
  }
};

/**
 * Count total unread danger notifications
 */
export const getDangerCount = async (poultryId) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return 0;
    return alerts.filter((a) => a.severity === "danger" && !a.read).length;
  } catch (error) {
    console.error("[NotificationService] getDangerCount error:", error);
    return 0;
  }
};

/**
 * Count total unread warning notifications
 */
export const getWarnCount = async (poultryId) => {
  try {
    const alerts = await getAlerts(poultryId);
    if (!Array.isArray(alerts)) return 0;
    return alerts.filter((a) => a.severity === "warn" && !a.read).length;
  } catch (error) {
    console.error("[NotificationService] getWarnCount error:", error);
    return 0;
  }
};

/**
 * Mark all notifications for a poulailler as read (via API call)
 * This should call the backend API to update read status
 */
export const markAllRead = async (poultryId) => {
  try {
    // If you have a markAllRead API endpoint, call it here
    // For now, this is a placeholder for future API integration
    console.log(`[NotificationService] Marked all as read for ${poultryId}`);
    return true;
  } catch (error) {
    console.error("[NotificationService] markAllRead error:", error);
    return false;
  }
};

/**
 * Group notifications by date for display
 */
export const groupNotificationsByDate = (notifications) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {
    today: [],
    yesterday: [],
    older: [],
  };

  notifications.forEach((notif) => {
    const notifDate = new Date(notif.timestamp);
    notifDate.setHours(0, 0, 0, 0);

    if (notifDate.getTime() === today.getTime()) {
      groups.today.push(notif);
    } else if (notifDate.getTime() === yesterday.getTime()) {
      groups.yesterday.push(notif);
    } else {
      groups.older.push(notif);
    }
  });

  return groups;
};
