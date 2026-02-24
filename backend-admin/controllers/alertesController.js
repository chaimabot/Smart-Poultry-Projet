const Alert = require("../models/Alert");
const Poulailler = require("../models/Poulailler");
const Joi = require("joi");

// Helper function to format time ago
function formatTimeAgo(date) {
  if (!date) return "N/A";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

// @desc    Liste des alertes avec filtres avancés
// @route   GET /api/admin/alertes
// @access  Private/Admin
exports.getAlertes = async (req, res) => {
  try {
    const {
      severity,
      poulaillerId,
      read,
      resolved,
      parameter,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filtre sévérité
    if (severity) {
      query.severity = severity;
    }

    // Filtre poulailler
    if (poulaillerId) {
      query.poulailler = poulaillerId;
    }

    // Filtre lu/non lu
    if (read !== undefined) {
      query.read = read === "true";
    }

    // Filtre résolu/non résolu
    if (resolved !== undefined) {
      if (resolved === "true") {
        query.resolvedAt = { $ne: null };
      } else {
        query.resolvedAt = null;
      }
    }

    // Filtre paramètre
    if (parameter) {
      query.parameter = parameter;
    }

    // Recherche textuelle (sur le message ou le nom du poulailler)
    if (search) {
      const poulaillers = await Poulailler.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");
      const poulaillerIds = poulaillers.map((p) => p._id);

      query.$or = [
        { message: { $regex: search, $options: "i" } },
        { poulailler: { $in: poulaillerIds } },
      ];
    }

    // Filtre date
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const total = await Alert.countDocuments(query);

    // Tri
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    const alertes = await Alert.find(query)
      .populate({
        path: "poulailler",
        select: "name",
        populate: {
          path: "owner",
          select: "firstName lastName email",
        },
      })
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const formattedAlertes = alertes.map((a) => ({
      id: a._id,
      severity: a.severity,
      parameter: a.parameter,
      value: a.value,
      threshold: a.threshold,
      direction: a.direction,
      message: a.message,
      read: a.read,
      resolved: !!a.resolvedAt,
      resolvedAt: a.resolvedAt,
      poulailler: a.poulailler
        ? {
            id: a.poulailler._id,
            name: a.poulailler.name,
            eleveur: a.poulailler.owner
              ? {
                  id: a.poulailler.owner._id,
                  name: `${a.poulailler.owner.firstName} ${a.poulailler.owner.lastName}`,
                  email: a.poulailler.owner.email,
                }
              : null,
          }
        : null,
      createdAt: a.createdAt,
      createdAtFormatted: formatTimeAgo(a.createdAt),
    }));

    res.json({
      success: true,
      data: formattedAlertes,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    console.error("[GET ALERTES ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Obtenir une alerte par ID
// @route   GET /api/admin/alertes/:id
// @access  Private/Admin
exports.getAlerteById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).populate({
      path: "poulailler",
      select: "name owner status",
      populate: {
        path: "owner",
        select: "firstName lastName email phone",
      },
    });

    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    res.json({
      success: true,
      data: {
        id: alert._id,
        severity: alert.severity,
        parameter: alert.parameter,
        value: alert.value,
        threshold: alert.threshold,
        direction: alert.direction,
        message: alert.message,
        read: alert.read,
        resolved: !!alert.resolvedAt,
        resolvedAt: alert.resolvedAt,
        poulailler: alert.poulailler
          ? {
              id: alert.poulailler._id,
              name: alert.poulailler.name,
              status: alert.poulailler.status,
              eleveur: alert.poulailler.owner
                ? {
                    id: alert.poulailler.owner._id,
                    name: `${alert.poulailler.owner.firstName} ${alert.poulailler.owner.lastName}`,
                    email: alert.poulailler.owner.email,
                    phone: alert.poulailler.owner.phone,
                  }
                : null,
            }
          : null,
        createdAt: alert.createdAt,
      },
    });
  } catch (err) {
    console.error("[GET ALERTE BY ID ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Marquer une alerte comme lue
// @route   PUT /api/admin/alertes/:id/read
// @access  Private/Admin
exports.markAsRead = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    alert.read = true;
    await alert.save();

    res.json({
      success: true,
      message: "Alerte marquée comme lue",
    });
  } catch (err) {
    console.error("[MARK AS READ ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la mise à jour" });
  }
};

// @desc    Marquer une alerte comme résolue
// @route   PUT /api/admin/alertes/:id/resolve
// @access  Private/Admin
exports.resolveAlerte = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    alert.read = true;
    alert.resolvedAt = new Date();
    await alert.save();

    res.json({
      success: true,
      message: "Alerte résolue",
      data: {
        resolvedAt: alert.resolvedAt,
      },
    });
  } catch (err) {
    console.error("[RESOLVE ALERTE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la résolution" });
  }
};

// @desc    Marquer plusieurs alertes comme lues
// @route   PUT /api/admin/alertes/mark-read
// @access  Private/Admin
exports.markMultipleAsRead = async (req, res) => {
  try {
    const { alertIds } = req.body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return res
        .status(400)
        .json({ success: false, error: "IDs des alertes requis" });
    }

    await Alert.updateMany({ _id: { $in: alertIds } }, { read: true });

    res.json({
      success: true,
      message: `${alertIds.length} alertes marquées comme lues`,
    });
  } catch (err) {
    console.error("[MARK MULTIPLE AS READ ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la mise à jour" });
  }
};

// @desc    Résoudre plusieurs alertes
// @route   PUT /api/admin/alertes/resolve-multiple
// @access  Private/Admin
exports.resolveMultiple = async (req, res) => {
  try {
    const { alertIds } = req.body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return res
        .status(400)
        .json({ success: false, error: "IDs des alertes requis" });
    }

    await Alert.updateMany(
      { _id: { $in: alertIds } },
      { read: true, resolvedAt: new Date() },
    );

    res.json({
      success: true,
      message: `${alertIds.length} alertes résolues`,
    });
  } catch (err) {
    console.error("[RESOLVE MULTIPLE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la résolution" });
  }
};

// @desc    Obtenir les statistiques des alertes
// @route   GET /api/admin/alertes/stats
// @access  Private/Admin
exports.getAlertesStats = async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    let startDate = new Date();
    let fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    let twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    switch (period) {
      case "24h":
        startDate.setDate(startDate.getDate() - 1);
        break;
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Stats totales
    const total = await Alert.countDocuments();
    const nonLues = await Alert.countDocuments({ read: false });
    const resolues = await Alert.countDocuments({ resolvedAt: { $ne: null } });
    const nonResolues = await Alert.countDocuments({ resolvedAt: null });

    const critical = await Alert.countDocuments({
      severity: "critical",
      resolvedAt: null,
    });
    const warning = await Alert.countDocuments({
      severity: "warning",
      resolvedAt: null,
    });

    // Stats sur la période
    const periodStats = await Alert.countDocuments({
      createdAt: { $gte: startDate },
    });

    // Stats critiques sur la période
    const criticalPeriod = await Alert.countDocuments({
      severity: "critical",
      createdAt: { $gte: startDate },
    });

    // Stats par paramètre
    const parParametre = await Alert.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$parameter",
          total: { $sum: 1 },
          critiques: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] },
          },
          warnings: {
            $sum: { $cond: [{ $eq: ["$severity", "warning"] }, 1, 0] },
          },
        },
      },
    ]);

    // Taux de résolution
    const tauxResolution = total > 0 ? Math.round((resolues / total) * 100) : 0;

    // === NOUVELLES STATS POUR KPI ===

    // 1. Poulaillers hors-ligne (dernière mesure il y a plus de 4 heures)
    const Measure = require("../models/Measure");
    const Poulailler = require("../models/Poulailler");
    
    const poulaillers = await Poulailler.find({ status: "active" });
    let poulaillersHorsLigne = 0;
    
    for (const poulailler of poulaillers) {
      const lastMeasure = await Measure.findOne({ poulailler: poulailler._id })
        .sort({ timestamp: -1 });
      
      if (!lastMeasure || new Date(lastMeasure.timestamp) < fourHoursAgo) {
        poulaillersHorsLigne++;
      }
    }

    // 2. Alertes non traitées depuis plus de 24h
    const alertesNonTraitees24h = await Alert.countDocuments({
      read: false,
      createdAt: { $lt: twentyFourHoursAgo },
    });

    // 3. Élevages à risque élevé (> 8 alertes en 24h)
    const alertes24h = await Alert.find({
      createdAt: { $gte: twentyFourHoursAgo }
    });
    
    const alertesParPoulailler = {};
    for (const alerte of alertes24h) {
      const poulaillerId = alerte.poulailler?.toString();
      if (poulaillerId) {
        alertesParPoulailler[poulaillerId] = (alertesParPoulailler[poulaillerId] || 0) + 1;
      }
    }
    
    const elevagesARisque = Object.values(alertesParPoulailler).filter(count => count > 8).length;

    // 4. Modules en attente d'association depuis plus de 7 jours
    const Module = require("../models/Module");
    const modulesEnAttente = await Module.countDocuments({
      poulailler: null,
      createdAt: { $lt: sevenDaysAgo },
    });

    // 5. Alertes totales sur la période
    const alertesPeriode = await Alert.countDocuments({
      createdAt: { $gte: startDate },
    });

    // 6. Statut infrastructure (simulé - à remplacer par vraie vérification)
    const infrastructure = {
      mqtt: { status: "connected", label: "Connecté" },
      database: { status: "connected", label: "OK" },
    };

    res.json({
      success: true,
      data: {
        total,
        nonLues,
        resolues,
        nonResolues,
        critical,
        warning,
        periodStats,
        criticalPeriod,
        parParametre: parParametre.map((p) => ({
          parameter: p._id,
          total: p.total,
          critiques: p.critiques,
          warnings: p.warnings,
        })),
        tauxResolution,
        periode: period,
        // Nouveaux KPI
        poulaillersHorsLigne,
        alertesNonTraitees24h,
        elevagesARisque,
        modulesEnAttente,
        alertesPeriode,
        infrastructure,
      },
    });
  } catch (err) {
    console.error("[GET ALERTES STATS ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Exporter les alertes
// @route   GET /api/admin/alertes/export
// @access  Private/Admin
exports.exportAlertes = async (req, res) => {
  try {
    const { format = "json", ...filters } = req.query;

    // Construire la même requête que getAlertes
    const query = {};

    if (filters.severity) query.severity = filters.severity;
    if (filters.poulaillerId) query.poulailler = filters.poulaillerId;
    if (filters.read !== undefined) query.read = filters.read === "true";
    if (filters.resolved === "true") {
      query.resolvedAt = { $ne: null };
    } else if (filters.resolved === "false") {
      query.resolvedAt = null;
    }
    if (filters.parameter) query.parameter = filters.parameter;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const alertes = await Alert.find(query)
      .populate({
        path: "poulailler",
        select: "name",
        populate: {
          path: "owner",
          select: "firstName lastName email",
        },
      })
      .sort({ createdAt: -1 })
      .limit(1000); // Limite à 1000 pour l'export

    const formattedAlertes = alertes.map((a) => ({
      Date: new Date(a.createdAt).toLocaleString("fr-FR"),
      Sévérité: a.severity === "critical" ? "Critique" : "Avertissement",
      Paramètre: a.parameter,
      Valeur: a.value,
      Seuil: a.threshold,
      Direction: a.direction === "above" ? "Au-dessus" : "En-dessous",
      Poulailler: a.poulailler?.name || "N/A",
      Éleveur: a.poulailler?.owner
        ? `${a.poulailler.owner.firstName} ${a.poulailler.owner.lastName}`
        : "N/A",
      Status: a.resolvedAt ? "Résolue" : a.read ? "Lue" : "Non lue",
      "Résolue le": a.resolvedAt
        ? new Date(a.resolvedAt).toLocaleString("fr-FR")
        : "N/A",
    }));

    if (format === "csv") {
      const csvHeader = Object.keys(formattedAlertes[0] || {}).join(",");
      const csvRows = formattedAlertes.map((row) =>
        Object.values(row)
          .map((v) => `"${v}"`)
          .join(","),
      );
      const csv = [csvHeader, ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=alertes.csv");
      return res.send(csv);
    }

    res.json({
      success: true,
      data: formattedAlertes,
      count: formattedAlertes.length,
    });
  } catch (err) {
    console.error("[EXPORT ALERTES ERROR]", err);
    res.status(500).json({ success: false, error: "Erreur lors de l'export" });
  }
};

// @desc    Supprimer une alerte
// @route   DELETE /api/admin/alertes/:id
// @access  Private/Admin
exports.deleteAlerte = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    await Alert.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Alerte supprimée",
    });
  } catch (err) {
    console.error("[DELETE ALERTE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la suppression" });
  }
};

// @desc    Supprimer plusieurs alertes
// @route   DELETE /api/admin/alertes
// @access  Private/Admin
exports.deleteMultiple = async (req, res) => {
  try {
    const { alertIds } = req.body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return res
        .status(400)
        .json({ success: false, error: "IDs des alertes requis" });
    }

    await Alert.deleteMany({ _id: { $in: alertIds } });

    res.json({
      success: true,
      message: `${alertIds.length} alertes supprimées`,
    });
  } catch (err) {
    console.error("[DELETE MULTIPLE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la suppression" });
  }
};
