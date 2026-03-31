/**
 * 🔐 SESSION TIMEOUT MIDDLEWARE
 * Forcelogout les admins après 30 minutes d'inactivité
 */

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Track user activity
const userActivity = new Map(); // userId -> lastActivityTime

/**
 * Middleware: Update last activity time
 */
const updateActivity = (req, res, next) => {
  if (req.user && req.user.id) {
    userActivity.set(req.user.id, Date.now());
  }
  next();
};

/**
 * Middleware: Check if session is expired
 */
const checkSessionTimeout = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(); // Not authenticated
  }

  const lastActivity = userActivity.get(req.user.id);
  if (!lastActivity) {
    userActivity.set(req.user.id, Date.now());
    return next();
  }

  const timeSinceActivity = Date.now() - lastActivity;
  if (timeSinceActivity > SESSION_TIMEOUT_MS) {
    userActivity.delete(req.user.id);
    return res.status(401).json({
      success: false,
      error: "Session expired due to inactivity",
      code: "SESSION_EXPIRED",
    });
  }

  // Update activity timestamp
  userActivity.set(req.user.id, Date.now());
  next();
};

/**
 * Cleanup: Remove expired sessions every 1 hour
 */
setInterval(
  () => {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, lastActivity] of userActivity.entries()) {
      if (now - lastActivity > SESSION_TIMEOUT_MS + 10 * 60 * 1000) {
        userActivity.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SESSION] 🧹 Cleaned up ${cleaned} expired sessions`);
    }
  },
  60 * 60 * 1000,
); // Every hour

module.exports = {
  updateActivity,
  checkSessionTimeout,
};
