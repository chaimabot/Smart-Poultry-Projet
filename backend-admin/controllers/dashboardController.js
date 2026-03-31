// controllers/dashboardController.js
const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const Alert = require("../models/Alert");
const Module = require("../models/Module");
const Measure = require("../models/Measure");
const Log = require("../models/Log");

// Helper pour "il y a X min"
function formatTimeAgo(date) {
  if (!date) return "N/A";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

// Helper pour calculer la durée
function getDuration(startDate, endDate = new Date()) {
  const diffMs = endDate.getTime() - new Date(startDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}j ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}min`;
  if (minutes > 0) return `${minutes}min`;
  return "< 1min";
}

// @desc    Statistiques globales du dashboard
// @route   GET /api/admin/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
  try {
    // Éleveurs
    const totalEleveurs = await User.countDocuments({ role: "eleveur" });
    const nouveauxCeMois = await User.countDocuments({
      role: "eleveur",
      createdAt: { $gte: new Date(new Date().setDate(1)) }, // depuis le 1er du mois
    });

    // Poulaillers
    const totalPoulaillers = await Poulailler.countDocuments({
      isArchived: false,
    });
    const poulaillersConnectes = await Poulailler.countDocuments({
      status: "connecte",
      isArchived: false,
    });
    const poulaillersHorsLigne = await Poulailler.countDocuments({
      status: "hors_ligne",
      isArchived: false,
    });
    const poulaillersEnAttente = await Poulailler.countDocuments({
      status: "en_attente_module",
      isArchived: false,
    });

    // Modules
    const totalModules = await Module.countDocuments();
    const modulesAssocies = await Module.countDocuments({
      poulailler: { $ne: null },
    });
    const modulesLibres = await Module.countDocuments({
      poulailler: null,
    });

    // Alertes actives (non résolues)
    const alertesActives = await Alert.countDocuments({
      resolvedAt: null,
    });

    // Dernière mesure
    const derniereMesure = await Measure.findOne()
      .sort({ timestamp: -1 })
      .select("timestamp");

    res.json({
      success: true,
      data: {
        eleveurs: {
          total: totalEleveurs,
          nouveauxCeMois: nouveauxCeMois,
        },
        poulaillers: {
          total: totalPoulaillers,
          connects: poulaillersConnectes,
          horsLigne: poulaillersHorsLigne,
          enAttente: poulaillersEnAttente,
        },
        modules: {
          total: totalModules,
          associes: modulesAssocies,
          libres: modulesLibres,
        },
        alertesActives: alertesActives,
        derniereMiseAJour: derniereMesure
          ? formatTimeAgo(derniereMesure.timestamp)
          : "Aucune mesure",
      },
    });
  } catch (err) {
    console.error("Erreur getDashboardStats:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur stats" });
  }
};

// @desc    Données pour les graphiques d'alertes
// @route   GET /api/admin/dashboard/alertes-chart
// @access  Private/Admin
exports.getAlertesChart = async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    let startDate = new Date();
    switch (period) {
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Alertes par jour
    const alertsByDay = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Alertes par paramètre (7 derniers jours)
    const alertsByParam = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$parameter",
          total: { $sum: 1 },
        },
      },
      {
        $sort: { total: -1 },
      },
    ]);

    // Timeline alertes dernières 24h (pour graphique activité)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alertsByHour = await Alert.aggregate([
      {
        $match: {
          createdAt: { $gte: last24h },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%H:00", date: "$createdAt" } },
          total: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      success: true,
      data: {
        alertsByDay,
        alertsByParam: alertsByParam.map((a) => ({
          parameter: a._id || "inconnu",
          total: a.total,
        })),
        alertsByHour,
      },
    });
  } catch (err) {
    console.error("Erreur getAlertesChart:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Activité des modules (mesures par heure)
// @route   GET /api/admin/dashboard/modules-activity
// @access  Private/Admin
exports.getModulesActivity = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Mesures par heure
    const measuresByHour = await Measure.aggregate([
      {
        $match: {
          timestamp: { $gte: last24h },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%H:00", date: "$timestamp" } },
          total: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      success: true,
      data: measuresByHour,
    });
  } catch (err) {
    console.error("Erreur getModulesActivity:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Alertes récentes
// @route   GET /api/admin/dashboard/alertes-recentes
// @access  Private/Admin
exports.getAlertesRecentes = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const alertes = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: "poulailler",
        select: "name owner uniqueCode",
        populate: {
          path: "owner",
          select: "firstName lastName email",
        },
      });

    const formatted = alertes.map((a) => ({
      id: a._id.toString(),
      severity: a.severity,
      parameter: a.parameter,
      poulailler: a.poulailler?.name || "Inconnu",
      poulaillerCode: a.poulailler?.uniqueCode || "",
      eleveur: a.poulailler?.owner
        ? `${a.poulailler.owner.firstName} ${a.poulailler.owner.lastName}`
        : "",
      value: a.value,
      threshold: a.threshold,
      resolved: !!a.resolvedAt,
      createdAt: a.createdAt,
      tempsAgo: formatTimeAgo(a.createdAt),
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("Erreur getAlertesRecentes:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur alertes" });
  }
};

// @desc    Poulaillers critiques (avec problèmes)
// @route   GET /api/admin/dashboard/poulaillers-critiques
// @access  Private/Admin
exports.getPoulaillersCritiques = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Poulaillers avec alertes actives ou hors ligne
    const poulaillers = await Poulailler.find({ isArchived: false })
      .populate("owner", "firstName lastName email")
      .sort({ isCritical: -1, lastAlert: -1, status: 1 })
      .limit(20);

    // Pour chaque poulailler, compter les alertes actives
    const poulaillersAvecAlertes = await Promise.all(
      poulaillers.map(async (p) => {
        const alertesActives = await Alert.countDocuments({
          poulailler: p._id,
          resolvedAt: null,
        });

        // Déterminer le problème principal
        let probleme = "Fonctionne normalement";
        let severite = "normal";

        if (p.status === "hors_ligne") {
          probleme = "Hors ligne";
          severite = "critical";
        } else if (alertesActives > 0) {
          const derniereAlerte = await Alert.findOne({
            poulailler: p._id,
            resolvedAt: null,
          }).sort({ createdAt: -1 });

          if (derniereAlerte) {
            const paramLabels = {
              temperature: "Température",
              humidity: "Humidité",
              co2: "CO₂",
              nh3: "NH₃",
              dust: "Poussière",
              waterLevel: "Niveau d'eau",
            };
            probleme = `${paramLabels[derniereAlerte.parameter] || derniereAlerte.parameter} ${derniereAlerte.severity === "critical" ? "critique" : "élevée"}`;
            severite = derniereAlerte.severity;
          }
        }

        // Ne garder que ceux avec des problèmes
        if (alertesActives === 0 && p.status !== "hors_ligne") {
          return null;
        }

        return {
          id: p._id.toString(),
          nom: p.name || "Sans nom",
          code: p.uniqueCode || "",
          eleveur: p.owner
            ? `${p.owner.firstName} ${p.owner.lastName}`
            : "Inconnu",
          eleveurEmail: p.owner?.email || "",
          status: p.status,
          severite: severite,
          probleme: probleme,
          depuis: p.lastAlert
            ? getDuration(p.lastAlert)
            : p.status === "hors_ligne" && p.lastCommunicationAt
              ? getDuration(p.lastCommunicationAt)
              : "N/A",
          derniereMesure: p.lastMeasureAt
            ? new Date(p.lastMeasureAt).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "N/A",
          alertesCount: alertesActives,
        };
      }),
    );

    // Filtrer et limiter
    const critiques = poulaillersAvecAlertes
      .filter((p) => p !== null)
      .slice(0, limit);

    res.json({ success: true, data: critiques });
  } catch (err) {
    console.error("Erreur getPoulaillersCritiques:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur critiques" });
  }
};

// @desc    Activité récente (logs)
// @route   GET /api/admin/dashboard/activite-recente
// @access  Private/Admin
exports.getActiviteRecente = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Essayer d'abord avec le modèle Log
    let logs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("user", "firstName lastName");

    // Si pas de logs, générer des activités simulées basées sur les données
    if (logs.length === 0) {
      const recentUsers = await User.find().sort({ createdAt: -1 }).limit(3);
      const recentModules = await Module.find()
        .sort({ createdAt: -1 })
        .limit(3);
      const recentPoulaillers = await Poulailler.find()
        .sort({ createdAt: -1 })
        .limit(3);

      const activities = [];

      recentUsers.forEach((u) => {
        activities.push({
          type: "user_created",
          description: `Compte éleveur créé: ${u.firstName} ${u.lastName}`,
          tempsAgo: formatTimeAgo(u.createdAt),
        });
      });

      recentModules.forEach((m) => {
        activities.push({
          type: "module_associated",
          description: m.poulailler
            ? `Module ${m.deviceName} associé`
            : `Module ${m.deviceName} ajouté`,
          tempsAgo: formatTimeAgo(m.createdAt),
        });
      });

      recentPoulaillers.forEach((p) => {
        activities.push({
          type: "poulailler_added",
          description: `Poulailler "${p.name}" ajouté`,
          tempsAgo: formatTimeAgo(p.createdAt),
        });
      });

      logs = activities.slice(0, limit);
    } else {
      logs = logs.map((l) => ({
        type: l.action || "activity",
        description: l.description || `Activité: ${l.action}`,
        tempsAgo: formatTimeAgo(l.createdAt),
      }));
    }

    res.json({ success: true, data: logs });
  } catch (err) {
    console.error("Erreur getActiviteRecente:", err.message, err.stack);
    // Retourner un tableau vide en cas d'erreur
    res.json({ success: true, data: [] });
  }
};
