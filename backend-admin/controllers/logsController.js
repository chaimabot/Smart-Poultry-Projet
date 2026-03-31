const Log = require("../models/Log");
const Alert = require("../models/Alert");
const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const Module = require("../models/Module");
const Command = require("../models/Command");

// Helper function to format time ago
function formatTimeAgo(date) {
  if (!date) return "N/A";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

// Helper to map log type to display type
function mapLogTypeToDisplayType(type) {
  const typeMap = {
    user_created: "utilisateur",
    user_updated: "utilisateur",
    user_deleted: "utilisateur",
    user_login: "connexion",
    user_logout: "connexion",
    poulailler_created: "poulailler",
    poulailler_updated: "poulailler",
    poulailler_deleted: "poulailler",
    module_claimed: "module",
    module_dissociated: "module",
    module_offline: "module",
    alert_created: "alerte",
    alert_resolved: "alerte",
    command_sent: "commande",
    command_executed: "commande",
    system_error: "systeme",
    system_info: "systeme",
  };
  return typeMap[type] || "systeme";
}

// @desc    Liste des logs d'admin
// @route   GET /api/admin/logs
// @access  Private/Admin
exports.getLogs = async (req, res) => {
  try {
    const {
      type,
      severity,
      startDate,
      endDate,
      userId,
      poulaillerId,
      page = 1,
      limit = 50,
    } = req.query;

    // Build query - Par défaut, ne montrer que les logs d'admin
    const query = { user: { $exists: true, $ne: null } };

    // Filter by display type (mapped from internal type)
    if (type) {
      const internalTypes = [];
      switch (type) {
        case "utilisateur":
          internalTypes.push(
            "user_created",
            "user_updated",
            "user_deleted",
            "user_login",
            "user_logout",
          );
          break;
        case "connexion":
          internalTypes.push("user_login", "user_logout");
          break;
        case "poulailler":
          internalTypes.push(
            "poulailler_created",
            "poulailler_updated",
            "poulailler_deleted",
          );
          break;
        case "module":
          internalTypes.push(
            "module_claimed",
            "module_dissociated",
            "module_offline",
          );
          break;
        case "alerte":
          internalTypes.push("alert_created", "alert_resolved");
          break;
        case "commande":
          internalTypes.push("command_sent", "command_executed");
          break;
        case "systeme":
          internalTypes.push("system_error", "system_info");
          break;
        default:
          internalTypes.push(type);
      }
      query.type = { $in: internalTypes };
    }

    // Filter by severity
    if (severity) {
      query.severity = severity;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    } else {
      // Default: last 30 days
      query.createdAt = {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      };
    }

    // Filter by specific admin user
    if (userId) {
      query.user = userId;
    }

    // Filter by poulailler
    if (poulaillerId) {
      query.poulailler = poulaillerId;
    }

    // Execute query with pagination
    const total = await Log.countDocuments(query);
    const logs = await Log.find(query)
      .populate("user", "firstName lastName email role")
      .populate("targetUser", "firstName lastName email")
      .populate("poulailler", "name")
      .populate("module", "type status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Transform logs for display
    const transformedLogs = logs.map((log) => {
      let poulaillerName = null;
      if (log.poulailler) {
        poulaillerName = log.poulailler.name;
      }

      let userName = null;
      let userRole = null;
      if (log.user) {
        userName = `${log.user.firstName} ${log.user.lastName}`;
        userRole = log.user.role;
      }

      return {
        id: log._id,
        type: mapLogTypeToDisplayType(log.type),
        internalType: log.type,
        severity: log.severity,
        message: log.message,
        description: log.description,
        poulailler: poulaillerName,
        user: userName,
        userRole: userRole,
        ipAddress: log.ipAddress,
        timestamp: log.createdAt,
        timestampFormatted: formatTimeAgo(log.createdAt),
        metadata: log.metadata,
      };
    });

    res.json({
      success: true,
      data: transformedLogs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET LOGS ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Obtenir les statistiques des logs
// @route   GET /api/admin/logs/stats
// @access  Private/Admin
exports.getLogsStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);

    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);

    // Only count logs from admin users
    const adminQuery = { user: { $exists: true, $ne: null } };

    // Count logs by type and severity
    const [
      totalLogs,
      logsToday,
      logsLast7Days,
      logsLast30Days,
      logsBySeverity,
      logsByType,
      recentErrors,
    ] = await Promise.all([
      Log.countDocuments(adminQuery),
      Log.countDocuments({ ...adminQuery, createdAt: { $gte: today } }),
      Log.countDocuments({ ...adminQuery, createdAt: { $gte: last7Days } }),
      Log.countDocuments({ ...adminQuery, createdAt: { $gte: last30Days } }),
      Log.aggregate([
        { $match: adminQuery },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
      ]),
      Log.aggregate([
        { $match: adminQuery },
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Log.find({ ...adminQuery, severity: { $in: ["error", "critical"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "firstName lastName")
        .populate("poulailler", "name"),
    ]);

    // Also get legacy stats from other collections
    const alertsToday = await Alert.countDocuments({
      createdAt: { $gte: today },
    });

    const alertsLast7Days = await Alert.countDocuments({
      createdAt: { $gte: last7Days },
    });

    const commandsToday = await Command.countDocuments({
      createdAt: { $gte: today },
    });

    const connectionsToday = await User.countDocuments({
      lastLogin: { $gte: today },
    });

    // Format severity stats
    const severityStats = {};
    logsBySeverity.forEach((item) => {
      severityStats[item._id] = item.count;
    });

    // Format type stats
    const typeStats = {};
    logsByType.forEach((item) => {
      typeStats[item._id] = item.count;
    });

    res.json({
      success: true,
      data: {
        totalLogs,
        logsToday,
        logsLast7Days,
        logsLast30Days,
        alertsToday,
        alertsLast7Days,
        commandsToday,
        connectionsToday,
        severityStats,
        typeStats,
        recentErrors: recentErrors.map((log) => ({
          id: log._id,
          message: log.message,
          severity: log.severity,
          timestamp: log.createdAt,
          poulailler: log.poulailler?.name,
          user: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
        })),
      },
    });
  } catch (err) {
    console.error("[GET LOGS STATS ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Exporter les logs
// @route   GET /api/admin/logs/export
// @access  Private/Admin
exports.exportLogs = async (req, res) => {
  try {
    const { startDate, endDate, type, severity, format = "json" } = req.query;

    // Build query - only admin logs
    const query = { user: { $exists: true, $ne: null } };

    if (type) {
      query.type = type;
    }

    if (severity) {
      query.severity = severity;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const logs = await Log.find(query)
      .populate("user", "firstName lastName email")
      .populate("targetUser", "firstName lastName email")
      .populate("poulailler", "name")
      .populate("module", "type status")
      .sort({ createdAt: -1 })
      .limit(10000);

    if (format === "csv") {
      // Convert to CSV
      const headers = [
        "Date",
        "Type",
        "Sévérité",
        "Message",
        "Description",
        "Admin",
        "Poulailler",
        "Adresse IP",
      ];

      const rows = logs.map((log) => [
        log.createdAt.toISOString(),
        log.type,
        log.severity,
        log.message,
        log.description || "",
        log.user ? `${log.user.firstName} ${log.user.lastName}` : "",
        log.poulailler?.name || "",
        log.ipAddress || "",
      ]);

      const csv = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=logs.csv");
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: logs,
        exportedAt: new Date(),
        count: logs.length,
      });
    }
  } catch (err) {
    console.error("[EXPORT LOGS ERROR]", err);
    res.status(500).json({ success: false, error: "Erreur lors de l'export" });
  }
};

// @desc    Supprimer les logs anciens
// @route   DELETE /api/admin/logs/cleanup
// @access  Private/Admin
exports.cleanupLogs = async (req, res) => {
  try {
    const { olderThanDays = 90 } = req.body;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await Log.deleteMany({
      createdAt: { $lt: cutoffDate },
      severity: { $nin: ["error", "critical"] }, // Keep errors and critical logs
    });

    res.json({
      success: true,
      message: `${result.deletedCount} logs supprimés`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("[CLEANUP LOGS ERROR]", err);
    res.status(500).json({ success: false, error: "Erreur lors du nettoyage" });
  }
};
