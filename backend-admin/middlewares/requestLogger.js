/**
 * 📋 HTTP REQUEST LOGGING MIDDLEWARE
 * Logs all incoming requests and responses
 */

const logger = require("../utils/logger");

/**
 * Middleware for logging HTTP requests/responses
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.debug("Incoming Request", {
    method: req.method,
    path: req.url,
    ip: req.ip,
    userId: req.user?.id,
  });

  // Intercept res.send to log response
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log response
    logger.logRequest(req, res, duration);

    // Log errors at warn level
    if (res.statusCode >= 400) {
      logger.warn("HTTP Error Response", {
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id,
      });
    }

    // Call original send
    return originalSend.call(this, data);
  };

  next();
};

module.exports = requestLogger;
