/**
 * 📋 STRUCTURED LOGGING WITH WINSTON
 * Production-grade logging with file rotation, JSON format, and multiple transports
 *
 * Install: npm install winston winston-daily-rotate-file
 */

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ============================================================================
// LOG LEVELS
// ============================================================================

// Custom levels with colors
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    fatal: "red",
    error: "red",
    warn: "yellow",
    info: "green",
    debug: "blue",
    trace: "gray",
  },
};

winston.addColors(customLevels.colors);

// ============================================================================
// LOG FORMAT
// ============================================================================

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(), // Support %s and %d in messages
  winston.format.json({
    space: 2,
  }),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...data }) => {
    const meta = Object.keys(data).length ? JSON.stringify(data, null, 2) : "";
    return `${timestamp} [${level}] ${message} ${meta}`;
  }),
);

// ============================================================================
// TRANSPORTS
// ============================================================================

const transports = [
  // Console (always)
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || "debug",
    format: consoleFormat,
  }),

  // All logs → combined.log (rotated daily)
  new DailyRotateFile({
    level: "info",
    filename: path.join(logsDir, "combined-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "100m",
    maxDays: "30d", // Keep 30 days
    format: logFormat,
  }),

  // Errors only → error.log (rotated daily)
  new DailyRotateFile({
    level: "error",
    filename: path.join(logsDir, "error-%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxSize: "100m",
    maxDays: "30d",
    format: logFormat,
  }),

  // Fatal only → fatal.log (never rotated)
  new DailyRotateFile({
    level: "fatal",
    filename: path.join(logsDir, "fatal.log"),
    maxSize: "50m",
    maxDays: "90d",
    format: logFormat,
  }),
];

// ============================================================================
// CREATE LOGGER
// ============================================================================

const logger = winston.createLogger({
  levels: customLevels.levels,
  format: logFormat,
  transports: transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, "exceptions-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "100m",
      maxDays: "30d",
      format: logFormat,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, "rejections-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "100m",
      maxDays: "30d",
      format: logFormat,
    }),
  ],
});

// ============================================================================
// HELPER METHODS
// ============================================================================

/**
 * Log HTTP request
 */
logger.logRequest = (req, res, duration) => {
  logger.info("HTTP Request", {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    ip: req.ip,
    userId: req.user?.id,
    duration: `${duration}ms`,
    userAgent: req.get("user-agent"),
  });
};

/**
 * Log API error
 */
logger.logError = (error, context = {}) => {
  logger.error("API Error", {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...context,
  });
};

/**
 * Log user action (audit trail)
 */
logger.logAction = (action, userId, details = {}) => {
  logger.info("User Action", {
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

/**
 * Log database operation
 */
logger.logDB = (operation, model, duration, success = true) => {
  logger.debug("Database Operation", {
    operation,
    model,
    duration: `${duration}ms`,
    success,
  });
};

module.exports = logger;
