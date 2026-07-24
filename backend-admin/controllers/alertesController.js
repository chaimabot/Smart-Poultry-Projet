const Alert = require("../models/Alert");
const Poulailler = require("../models/Poulailler");
const Joi = require("joi");

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
      eleveurId, // ← NOUVEAU
      read,
      resolved,
      parameter,
      search,
      startDate,
      endDate,
      period,
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

    // ── Filtre par éleveur (owner) ───────────────────────────────────────────
    // On résout d'abord les poulaillers appartenant à cet éleveur,
    // puis on filtre les alertes sur ces poulaillers.
    // Si poulaillerId ET eleveurId sont fournis, on applique les deux (intersection).
    if (eleveurId) {
      const poulaillersFiltres = await Poulailler.find({
        owner: eleveurId,
      }).select("_id");
      const ids = poulaillersFiltres.map((p) => p._id);

      if (poulaillerId) {
        // Intersection : le poulailler demandé doit appartenir à cet éleveur
        const appartient = ids.some((id) => id.toString() === poulaillerId);
        if (!appartient) {
          // Aucun résultat possible
          return res.json({
            success: true,
            data: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              pages: 0,
              limit: parseInt(limit),
            },
          });
        }
        query.poulailler = poulaillerId;
      } else {
        query.poulailler = { $in: ids };
      }
    } else if (poulaillerId) {
      query.poulailler = poulaillerId;
    }
    // ────────────────────────────────────────────────────────────────────────

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

    // Recherche textuelle
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

    // Filtre période
    if (period) {
      let startDateFilter = new Date();
      switch (period) {
        case "today":
          startDateFilter.setHours(0, 0, 0, 0);
          break;
        case "7d":
          startDateFilter.setDate(startDateFilter.getDate() - 7);
          break;
        case "30d":
          startDateFilter.setDate(startDateFilter.getDate() - 30);
          break;
        case "90d":
          startDateFilter.setDate(startDateFilter.getDate() - 90);
          break;
        default:
          break;
      }
      if (period !== "custom") {
        query.createdAt = { $gte: startDateFilter };
      }
    }

    // Filtre date personnalisé
    if (startDate || endDate) {
      query.createdAt = query.createdAt || {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const total = await Alert.countDocuments(query);

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

// ── Le reste du fichier est inchangé ────────────────────────────────────────

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
    res.json({ success: true, message: "Alerte marquée comme lue" });
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
      data: { resolvedAt: alert.resolvedAt },
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
    res.json({ success: true, message: `${alertIds.length} alertes résolues` });
  } catch (err) {
    console.error("[RESOLVE MULTIPLE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la résolution" });
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
    res.json({ success: true, message: "Alerte supprimée" });
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
