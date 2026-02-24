const AlertModel = require("../models/Alert");
const Poulailler = require("../models/Poulailler");

// ── Helpers ───────────────────────────────────────────────────────────────────
const PARAM_LABELS = {
  temperature: "Température",
  humidity: "Humidité",
  co2: "CO₂",
  nh3: "NH₃",
  dust: "Poussière",
  waterLevel: "Niveau d'eau",
};

const PARAM_UNITS = {
  temperature: "°C",
  humidity: "%",
  co2: "ppm",
  nh3: "ppm",
  dust: "µg/m³",
  waterLevel: "%",
};

// Génère un message lisible depuis les champs du modèle
function buildMessage(alert) {
  const label = PARAM_LABELS[alert.parameter] || alert.parameter;
  const unit = PARAM_UNITS[alert.parameter] || "";
  const dir = alert.direction === "above" ? "dépasse" : "est en dessous de";
  return `${label} ${dir} le seuil (${alert.value}${unit})`;
}

// @desc    Obtenir toutes les alertes d'un poulailler
// @route   GET /api/alerts?poulaillerId=...
// @route   GET /api/alerts/poulailler/:poulaillerId
// @access  Private
exports.getAlerts = async (req, res) => {
  try {
    const {
      read,
      severity,
      limit = 50,
      page = 1,
      poultryId,
      poulaillerId: queryId,
    } = req.query;

    // Accepte toutes les variantes de l'ID
    const poulaillerId = req.params.poulaillerId || poultryId || queryId;

    if (!poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "Veuillez fournir un ID de poulailler",
      });
    }

    const poulailler = await Poulailler.findOne({
      _id: poulaillerId,
      owner: req.user.id,
    });

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé ou accès non autorisé",
      });
    }

    let query = { poulailler: poulaillerId };
    if (read !== undefined) query.read = read === "true";
    if (severity !== undefined) query.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await AlertModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AlertModel.countDocuments(query);

    // ✅ Enrichit chaque alerte avec message + sensorType + isRead
    //    pour compatibilité avec le frontend existant
    const data = alerts.map((a) => ({
      _id: a._id,
      poulailler: a.poulailler,
      parameter: a.parameter,
      sensorType: PARAM_LABELS[a.parameter] || a.parameter,
      value: a.value,
      threshold: a.threshold,
      direction: a.direction,
      severity: a.severity,
      message: buildMessage(a),
      type: a.severity === "critical" ? "CRITIQUE" : "ATTENTION",
      read: a.read,
      isRead: a.read, // alias frontend
      resolvedAt: a.resolvedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Marquer une ou toutes les alertes comme lues
// @route   POST /api/alerts/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const { alertId, poulaillerId } = req.body;

    if (alertId) {
      const alert = await AlertModel.findById(alertId).populate("poulailler");
      if (!alert || alert.poulailler.owner.toString() !== req.user.id) {
        return res
          .status(404)
          .json({ success: false, error: "Alerte non trouvée" });
      }
      alert.read = true;
      await alert.save();
    } else if (poulaillerId) {
      const poulailler = await Poulailler.findOne({
        _id: poulaillerId,
        owner: req.user.id,
      });
      if (!poulailler) {
        return res
          .status(404)
          .json({ success: false, error: "Poulailler non trouvé" });
      }
      await AlertModel.updateMany(
        { poulailler: poulaillerId, read: false },
        { read: true },
      );
    } else {
      return res.status(400).json({
        success: false,
        error: "Veuillez fournir alertId ou poulaillerId",
      });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Créer une alerte (appelé par le système ou l'IoT)
// @route   POST /api/alerts
// @access  Private
exports.createAlert = async (req, res) => {
  try {
    const { poulaillerId, parameter, value, threshold, direction, severity } =
      req.body;

    if (
      !poulaillerId ||
      !parameter ||
      value === undefined ||
      threshold === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: "poulaillerId, parameter, value et threshold sont requis",
      });
    }

    const poulailler = await Poulailler.findOne({
      _id: poulaillerId,
      owner: req.user.id,
    });

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    const alert = await AlertModel.create({
      poulailler: poulaillerId,
      parameter,
      value,
      threshold,
      direction: direction || (value > threshold ? "above" : "below"),
      severity: severity || "warning",
    });

    // Mettre à jour isCritical sur le poulailler si critique
    if (severity === "critical") {
      await Poulailler.findByIdAndUpdate(poulaillerId, {
        isCritical: true,
        lastAlert: new Date(),
      });
    }

    res.status(201).json({
      success: true,
      data: {
        ...alert.toObject(),
        message: buildMessage(alert),
        sensorType: PARAM_LABELS[alert.parameter] || alert.parameter,
        isRead: alert.read,
        type: alert.severity === "critical" ? "CRITIQUE" : "ATTENTION",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Supprimer toutes les alertes lues d'un poulailler
// @route   DELETE /api/alerts?poulaillerId=...
// @access  Private
exports.deleteReadAlerts = async (req, res) => {
  try {
    const poulaillerId = req.query.poulaillerId || req.body.poulaillerId;

    if (!poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "poulaillerId est requis",
      });
    }

    const poulailler = await Poulailler.findOne({
      _id: poulaillerId,
      owner: req.user.id,
    });

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    const result = await AlertModel.deleteMany({
      poulailler: poulaillerId,
      read: true,
    });

    res.status(200).json({
      success: true,
      deleted: result.deletedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Statistiques des alertes d'un poulailler
// @route   GET /api/alerts/stats?poulaillerId=...
// @access  Private
exports.getAlertStats = async (req, res) => {
  try {
    const poulaillerId = req.query.poulaillerId;

    if (!poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "poulaillerId est requis",
      });
    }

    const poulailler = await Poulailler.findOne({
      _id: poulaillerId,
      owner: req.user.id,
    });

    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    const [total, unread, critical, byParam] = await Promise.all([
      AlertModel.countDocuments({ poulailler: poulaillerId }),
      AlertModel.countDocuments({ poulailler: poulaillerId, read: false }),
      AlertModel.countDocuments({
        poulailler: poulaillerId,
        severity: "critical",
      }),
      AlertModel.aggregate([
        { $match: { poulailler: poulailler._id } },
        { $group: { _id: "$parameter", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        unread,
        critical,
        byParameter: byParam.map((b) => ({
          parameter: b._id,
          label: PARAM_LABELS[b._id] || b._id,
          count: b.count,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
