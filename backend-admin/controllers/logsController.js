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

// @desc    Liste des logs système
// @route   GET /api/admin/logs
// @access  Private/Admin
exports.getLogs = async (req, res) => {
  try {
    const { type, startDate, endDate, page = 1, limit = 50 } = req.query;

    // We'll aggregate logs from different sources
    const logs = [];
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get recent alerts
    const alerts = await Alert.find({
      createdAt: { $gte: start, $lte: end },
    })
      .populate({
        path: "poulailler",
        select: "name",
      })
      .sort({ createdAt: -1 })
      .limit(100);

    alerts.forEach((alert) => {
      logs.push({
        type: "alerte",
        severity: alert.severity,
        message: `Alerte ${alert.severity}: ${alert.parameter} - ${alert.value}`,
        poulailler: alert.poulailler?.name,
        timestamp: alert.createdAt,
      });
    });

    // Get recent commands
    const commands = await Command.find({
      createdAt: { $gte: start, $lte: end },
    })
      .populate({
        path: "poulailler",
        select: "name",
      })
      .sort({ createdAt: -1 })
      .limit(50);

    commands.forEach((cmd) => {
      logs.push({
        type: "commande",
        severity: cmd.status === "failed" ? "error" : "info",
        message: `Commande ${cmd.type} - ${cmd.status}`,
        poulailler: cmd.poulailler?.name,
        timestamp: cmd.createdAt,
      });
    });

    // Get recent user logins (from User model if tracked)
    const recentUsers = await User.find({
      lastLogin: { $gte: start, $lte: end },
    }).limit(50);

    recentUsers.forEach((user) => {
      logs.push({
        type: "connexion",
        severity: "info",
        message: `Connexion utilisateur: ${user.email} (${user.role})`,
        poulailler: null,
        timestamp: user.lastLogin,
      });
    });

    // Sort all logs by timestamp descending
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter by type if specified
    const filteredLogs = type ? logs.filter((log) => log.type === type) : logs;

    // Paginate
    const total = filteredLogs.length;
    const paginatedLogs = filteredLogs.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: paginatedLogs.map((log) => ({
        ...log,
        timestampFormatted: formatTimeAgo(log.timestamp),
      })),
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

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);

    // Alert stats
    const alertsToday = await Alert.countDocuments({
      createdAt: { $gte: today },
    });

    const alertsLast7Days = await Alert.countDocuments({
      createdAt: { $gte: last7Days },
    });

    // Command stats
    const commandsToday = await Command.countDocuments({
      createdAt: { $gte: today },
    });

    // User connections
    const connectionsToday = await User.countDocuments({
      lastLogin: { $gte: today },
    });

    res.json({
      success: true,
      data: {
        alertsToday,
        alertsLast7Days,
        commandsToday,
        connectionsToday,
      },
    });
  } catch (err) {
    console.error("[GET LOGS STATS ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};
