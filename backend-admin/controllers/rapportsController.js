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
    const poulaillersConnectes = await Poulailler.countDocuments({
      isArchived: false,
      status: "connecte",
    });
    const poulaillersHorsLigne = await Poulailler.countDocuments({
      isArchived: false,
      status: "hors ligne",
    });
    const poulaillersEnAttente = await Poulailler.countDocuments({
      isArchived: false,
      status: "en attente",
    });

    // Stats Eleveurs
    const totalEleveurs = await User.countDocuments({ role: "eleveur" });
    const eleveursActifs = await User.countDocuments({
      role: "eleveur",
      isActive: true,
    });

    // Stats Modules
    const totalModules = await Module.countDocuments();
    const modulesAssocies = await Module.countDocuments({
      poulailler: { $ne: null },
    });
    const modulesLibres = await Module.countDocuments({
      poulailler: null,
    });
    const modulesConnectes = await Module.countDocuments({
      lastPing: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    const modulesHorsLigne = totalModules - modulesConnectes;
    const tauxConnexion =
      totalModules > 0
        ? Math.round((modulesConnectes / totalModules) * 100)
        : 0;

    // Stats Alertes (actives = not resolved)
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
    const alertesActives = await Alert.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      resolvedAt: null,
    });

    res.json({
      success: true,
      data: {
        periode: period,
        dateDebut: startDate,
        dateFin: endDate,
        poulaillers: {
          total: totalPoulaillers,
          connects: poulaillersConnectes,
          horsLigne: poulaillersHorsLigne,
          enAttente: poulaillersEnAttente,
          pourcentageActifs:
            totalPoulaillers > 0
              ? Math.round((poulaillersConnectes / totalPoulaillers) * 100)
              : 0,
        },
        eleveurs: {
          total: totalEleveurs,
          actifs: eleveursActifs,
        },
        modules: {
          total: totalModules,
          associes: modulesAssocies,
          libres: modulesLibres,
          connectes: modulesConnectes,
          horsLigne: modulesHorsLigne,
          tauxConnexion: tauxConnexion,
        },
        alertes: {
          total: totalAlertes,
          critiques: alertesCritiques,
          warnings: alertesWarnings,
          resolues: alertesResolues,
          actives: alertesActives,
        },
      },
    });
  } catch (err) {
    console.error("[GET GLOBAL REPORT ERROR]", err);
    res.status(500).json({
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
        $unwind: { path: "$poulailler", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          poulaillerName: { $ifNull: ["$poulailler.name", "Inconnu"] },
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
          parameter: item._id || "inconnu",
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
    res.status(500).json({
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

    // Calculate hours since last ping for each module
    const formattedModules = modulesDetails.map((m) => {
      const heuresSansPing = m.lastPing
        ? Math.round(
            (Date.now() - new Date(m.lastPing).getTime()) / (1000 * 60 * 60),
          )
        : 999;
      return {
        id: m._id,
        name: m.name,
        type: m.type,
        status: m.status,
        poulailler: m.poulailler?.name || "Non associé",
        lastPing: m.lastPing,
        firmwareVersion: m.firmwareVersion,
        heuresSansPing: heuresSansPing,
      };
    });

    // Get modules without ping for 24h+
    const modulesSansPing = formattedModules.filter(
      (m) => m.heuresSansPing >= 24,
    );

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
        modulesSansPing: modulesSansPing,
      },
    });
  } catch (err) {
    console.error("[GET MODULES REPORT ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la génération du rapport",
    });
  }
};

// @desc    Rapport sur les mesures - activité des poulaillers
// @route   GET /api/admin/rapports/mesures
// @access  Private/Admin
exports.getMesuresReport = async (req, res) => {
  try {
    const { period = "7d", poulaillerId } = req.query;
    const { startDate, endDate = new Date() } = getDateRange(period);

    // Get all poulaillers
    const poulaillers = await Poulailler.find({ isArchived: false })
      .populate("owner", "firstName lastName")
      .limit(100);

    // Get latest measure for each poulailler
    const poulaillersWithMesures = await Promise.all(
      poulaillers.map(async (p) => {
        const lastMeasure = await Measure.findOne({ poulailler: p._id })
          .sort({ timestamp: -1 })
          .limit(1);

        return {
          poulaillerId: p._id,
          poulaillerName: p.name,
          derniereMesure: lastMeasure?.timestamp || null,
          parametres: lastMeasure
            ? Object.keys(lastMeasure._doc).filter(
                (k) =>
                  !["_id", "poulailler", "timestamp", "__v"].includes(k) &&
                  lastMeasure[k] !== undefined &&
                  lastMeasure[k] !== null,
              )
            : [],
        };
      }),
    );

    // Calculate actifs/inactifs (inactif = no measure in last 24h)
    const now = Date.now();
    const poulaillersActifs = poulaillersWithMesures.filter(
      (p) =>
        p.derniereMesure &&
        now - new Date(p.derniereMesure).getTime() < 24 * 60 * 60 * 1000,
    ).length;

    const poulaillersInactifs = poulaillersWithMesures.filter(
      (p) =>
        !p.derniereMesure ||
        now - new Date(p.derniereMesure).getTime() >= 24 * 60 * 60 * 1000,
    ).length;

    res.json({
      success: true,
      data: {
        periode: period,
        poulaillersActifs: poulaillersActifs,
        poulaillersInactifs: poulaillersInactifs,
        totalPoulaillers: poulaillers.length,
        dernieresMesures: poulaillersWithMesures,
      },
    });
  } catch (err) {
    console.error("[GET MESURES REPORT ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la génération du rapport",
    });
  }
};
