const Alert = require("../models/Alert");
const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const Module = require("../models/Module");
const Command = require("../models/Command");
const Measure = require("../models/Measure");

// Helper to get date range based on period
function getDateRange(period) {
  const now = new Date();
  let startDate;
  let endDate = now;

  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  return { startDate, endDate };
}

// @desc    Générer un rapport global
// @route   GET /api/admin/rapports/global
// @access  Private/Admin
exports.getGlobalReport = async (req, res) => {
  try {
    const { period = "7d" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Stats Poulaillers
    const totalPoulaillers = await Poulailler.countDocuments({
      isArchived: false,
    });
    const poulaillersActifs = await Poulailler.countDocuments({
      isArchived: false,
      status: "connecte",
    });

    // Stats Eleveurs
    const totalEleveurs = await User.countDocuments({ role: "eleveur" });
    const eleveursActifs = await User.countDocuments({
      role: "eleveur",
      isActive: true,
    });

    // Stats Modules
    const totalModules = await Module.countDocuments();
    const modulesConnectes = await Module.countDocuments({
      lastPing: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    const tauxConnexion =
      totalModules > 0
        ? Math.round((modulesConnectes / totalModules) * 100)
        : 0;

    // Stats Alertes
    const totalAlertes = await Alert.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    const alertesCritiques = await Alert.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      severity: "critical",
    });
    const alertesWarnings = await Alert.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      severity: "warning",
    });
    const alertesResolues = await Alert.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      resolvedAt: { $ne: null },
    });

    // Stats Commandes
    const totalCommandes = await Command.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
    });
    const commandesExecutees = await Command.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      status: "executed",
    });
    const commandesEchouees = await Command.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      status: "failed",
    });

    // Uptime calculation (simulated based on lastPing)
    const uptimeData = await Module.aggregate([
      {
        $match: {
          lastPing: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgPing: { $avg: "$lastPing" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        periode: period,
        dateDebut: startDate,
        dateFin: endDate,
        poulaillers: {
          total: totalPoulaillers,
          actifs: poulaillersActifs,
          pourcentageActifs:
            totalPoulaillers > 0
              ? Math.round((poulaillersActifs / totalPoulaillers) * 100)
              : 0,
        },
        eleveurs: {
          total: totalEleveurs,
          actifs: eleveursActifs,
        },
        modules: {
          total: totalModules,
          connectes: modulesConnectes,
          tauxConnexion: `${tauxConnexion}%`,
        },
        alertes: {
          total: totalAlertes,
          critiques: alertesCritiques,
          warnings: alertesWarnings,
          resolues: alertesResolues,
        },
        commandes: {
          total: totalCommandes,
          executees: commandesExecutees,
          echouees: commandesEchouees,
          tauxReussite:
            totalCommandes > 0
              ? Math.round((commandesExecutees / totalCommandes) * 100)
              : 0,
        },
      },
    });
  } catch (err) {
    console.error("[GET GLOBAL REPORT ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la génération du rapport",
      });
  }
};

// @desc    Rapport sur les alertes
// @route   GET /api/admin/rapports/alertes
// @access  Private/Admin
exports.getAlertesReport = async (req, res) => {
  try {
    const { period = "7d" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    // Get alerts grouped by parameter
    const alertsByParameter = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$parameter",
          count: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
          },
          warning: {
            $sum: { $cond: [{ $eq: ["$severity", "warning"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get alerts by poulailler
    const alertsByPoulailler = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$poulailler",
          count: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "poulaillers",
          localField: "_id",
          foreignField: "_id",
          as: "poulailler",
        },
      },
      {
        $unwind: "$poulailler",
      },
      {
        $project: {
          poulaillerName: "$poulailler.name",
          count: 1,
          critical: 1,
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Alerts timeline (daily)
    const alertsTimeline = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: { $sum: 1 },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
          },
          warning: {
            $sum: { $cond: [{ $eq: ["$severity", "warning"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      success: true,
      data: {
        periode: period,
        parParametre: alertsByParameter.map((item) => ({
          parameter: item._id,
          total: item.count,
          critiques: item.critical,
          warnings: item.warning,
        })),
        parPoulailler: alertsByPoulailler,
        timeline: alertsTimeline,
      },
    });
  } catch (err) {
    console.error("[GET ALERTES REPORT ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la génération du rapport",
      });
  }
};

// @desc    Rapport sur les modules
// @route   GET /api/admin/rapports/modules
// @access  Private/Admin
exports.getModulesReport = async (req, res) => {
  try {
    const { period = "7d" } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const totalModules = await Module.countDocuments();

    const modulesConnectes = await Module.countDocuments({
      lastPing: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const modulesByStatus = await Module.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get modules with their poulailler info
    const modulesDetails = await Module.find()
      .populate("poulailler", "name")
      .sort({ lastPing: -1 })
      .limit(50);

    const formattedModules = modulesDetails.map((m) => ({
      id: m._id,
      name: m.name,
      type: m.type,
      status: m.status,
      poulailler: m.poulailler?.name || "Non associé",
      lastPing: m.lastPing,
      firmwareVersion: m.firmwareVersion,
    }));

    res.json({
      success: true,
      data: {
        periode: period,
        total: totalModules,
        connectes: modulesConnectes,
        deconnectes: totalModules - modulesConnectes,
        tauxConnexion:
          totalModules > 0
            ? Math.round((modulesConnectes / totalModules) * 100)
            : 0,
        parStatut: modulesByStatus,
        modules: formattedModules,
      },
    });
  } catch (err) {
    console.error("[GET MODULES REPORT ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la génération du rapport",
      });
  }
};

// @desc    Rapport sur les mesure
// @route   GET /api/admin/rapports/mesures
// @access  Private/Admin
exports.getMesuresReport = async (req, res) => {
  try {
    const { period = "7d", poulaillerId } = req.query;
    const { startDate, endDate } = getDateRange(period);

    const matchQuery = {
      timestamp: { $gte: startDate, $lte: endDate },
    };

    if (poulaillerId) {
      matchQuery.poulailler = poulaillerId;
    }

    // Average measures
    const avgMeasures = await Measure.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          avgTemperature: { $avg: "$temperature" },
          avgHumidity: { $avg: "$humidityCo" },
          avg2: { $avg: "$co2" },
          avgNh3: { $avg: "$nh3" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Min/Max values
    const minMaxMeasures = await Measure.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          minTemperature: { $min: "$temperature" },
          maxTemperature: { $max: "$temperature" },
          minHumidity: { $min: "$humidity" },
          maxHumidity: { $max: "$humidity" },
          minCo2: { $min: "$co2" },
          maxCo2: { $max: "$co2" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        periode: period,
        moyenne: avgMeasures[0] || null,
        minMax: minMaxMeasures[0] || null,
      },
    });
  } catch (err) {
    console.error("[GET MESURES REPORT ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la génération du rapport",
      });
  }
};
