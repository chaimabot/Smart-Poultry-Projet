/**
 * AlertController — Smart Poultry
 *
 * Routes REST :
 *   GET    /api/alerts                        → liste paginée avec filtres
 *   GET    /api/alerts/stats                  → statistiques par poulailler
 *   GET    /api/alerts/poulailler/:id         → liste par poulailler (shortcut)
 *   POST   /api/alerts                        → créer une alerte manuellement (IoT / tests)
 *   POST   /api/alerts/read                   → marquer une ou toutes comme lues (backend)
 *   PATCH  /api/alerts/:id/read               → marquer une alerte spécifique comme lue
 *   PATCH  /api/alerts/bulk/read              → marquer plusieurs alertes comme lues ✅ NOUVEAU
 *   DELETE /api/alerts                        → supprimer les alertes lues
 *   DELETE /api/alerts/:id                    → supprimer une alerte spécifique ✅ NOUVEAU
 *   DELETE /api/alerts/bulk                   → supprimer plusieurs alertes par IDs ✅ NOUVEAU
 */

const AlertModel = require("../models/Alert");
const Poulailler = require("../models/Poulailler");
const mongoose = require("mongoose");
const {
  createSensorAlert,
  createDoorAlert,
  createActuatorAlert,
  createMqttAlert,
} = require("../services/alertService");

// ─── Labels et unités ────────────────────────────────────────────────────────
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

// ─── Helper : vérifier qu'un ObjectId est valide ─────────────────────────────
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── Helper : vérifier que l'alerte appartient à l'utilisateur ───────────────
async function findAlertForUser(alertId, userId) {
  if (!isValidObjectId(alertId)) return null;
  const alert = await AlertModel.findById(alertId).populate("poulailler");
  if (!alert) return null;
  if (!alert.poulailler) return null;
  if (alert.poulailler.owner.toString() !== userId.toString()) return null;
  return alert;
}

/**
 * Reconstruit un message propre depuis les champs d'une alerte.
 */
function buildMessage(alert) {
  if (alert.message && !alert.message.includes("undefined")) {
    return alert.message;
  }
  if (alert.type === "door") return alert.message || "Événement porte";
  if (alert.type === "actuator") return alert.message || "Événement actionneur";
  if (alert.type === "mqtt") return alert.message || "Événement connexion";

  const label = PARAM_LABELS[alert.parameter] || alert.parameter || "Paramètre";
  const unit = PARAM_UNITS[alert.parameter] || "";
  const valStr = typeof alert.value === "number" ? alert.value.toFixed(1) : "?";
  const thresStr =
    typeof alert.threshold === "number" ? alert.threshold.toFixed(1) : "?";
  const dirLabel =
    alert.direction === "above"
      ? "dépasse le seuil"
      : "est en dessous du seuil";

  return `${label} ${dirLabel} : ${valStr}${unit} (seuil : ${thresStr}${unit})`;
}

/** Formate un document Alert pour le client mobile */
function formatAlert(a) {
  return {
    _id: a._id,
    poulailler: a.poulailler,
    type: a.type,
    key: a.key,
    parameter: a.parameter || null,
    sensorLabel: PARAM_LABELS[a.parameter] || null,
    sensorUnit: PARAM_UNITS[a.parameter] || null,
    value: a.value ?? null,
    threshold: a.threshold ?? null,
    direction: a.direction || null,
    severity: a.severity,
    icon: a.icon,
    message: buildMessage(a),
    read: a.read,
    isRead: a.read,
    resolvedAt: a.resolvedAt,
    timestamp: a.createdAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts
// Liste paginée avec filtres (poultryId requis)
// ─────────────────────────────────────────────────────────────────────────────
exports.getAlerts = async (req, res) => {
  try {
    const { read, severity, type, limit = 50, page = 1 } = req.query;

    const poulaillerId =
      req.params.poulaillerId || req.query.poultryId || req.query.poulaillerId;

    if (!poulaillerId) {
      return res.status(400).json({
        success: false,
        error: "poultryId est requis",
      });
    }

    if (!isValidObjectId(poulaillerId)) {
      return res.status(400).json({
        success: false,
        error: "poultryId invalide",
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

    const filter = { poulailler: poulaillerId };
    if (read !== undefined) filter.read = read === "true";
    if (severity) filter.severity = severity;
    if (type) filter.type = type;

    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;

    const [alerts, total] = await Promise.all([
      AlertModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AlertModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: alerts.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: alerts.map(formatAlert),
    });
  } catch (err) {
    console.error("[AlertController] getAlerts :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/alerts/stats
// Statistiques par poulailler
// ─────────────────────────────────────────────────────────────────────────────
exports.getAlertStats = async (req, res) => {
  try {
    const poulaillerId = req.query.poultryId || req.query.poulaillerId;

    if (!poulaillerId) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId requis" });
    }

    if (!isValidObjectId(poulaillerId)) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId invalide" });
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

    const [total, unread, dangerCount, warnCount, infoCount, byType, byParam] =
      await Promise.all([
        AlertModel.countDocuments({ poulailler: poulaillerId }),
        AlertModel.countDocuments({ poulailler: poulaillerId, read: false }),
        AlertModel.countDocuments({
          poulailler: poulaillerId,
          severity: "danger",
          read: false,
        }),
        AlertModel.countDocuments({
          poulailler: poulaillerId,
          severity: "warn",
          read: false,
        }),
        AlertModel.countDocuments({
          poulailler: poulaillerId,
          severity: "info",
          read: false,
        }),
        AlertModel.aggregate([
          { $match: { poulailler: poulailler._id } },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
        ]),
        AlertModel.aggregate([
          {
            $match: {
              poulailler: poulailler._id,
              type: "sensor",
              parameter: { $ne: null },
            },
          },
          {
            $group: {
              _id: "$parameter",
              count: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] },
              },
            },
          },
          { $sort: { count: -1 } },
        ]),
      ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        unread,
        // ✅ Détail par sévérité (utile pour SummaryBar mobile)
        bySeverity: {
          danger: dangerCount,
          warn: warnCount,
          info: infoCount,
        },
        byType: byType.map((b) => ({
          type: b._id,
          label:
            b._id === "sensor"
              ? "Capteur"
              : b._id === "door"
                ? "Porte"
                : b._id === "actuator"
                  ? "Actionneur"
                  : b._id === "mqtt"
                    ? "Connexion"
                    : b._id,
          count: b.count,
          unread: b.unread,
        })),
        byParameter: byParam.map((b) => ({
          parameter: b._id,
          label: PARAM_LABELS[b._id] || b._id,
          unit: PARAM_UNITS[b._id] || "",
          count: b.count,
          unread: b.unread,
        })),
      },
    });
  } catch (err) {
    console.error("[AlertController] getAlertStats :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts
// Créer une alerte manuellement (IoT / tests)
// ─────────────────────────────────────────────────────────────────────────────
exports.createAlert = async (req, res) => {
  try {
    const { poultryId, poulaillerId, type = "sensor", ...rest } = req.body;
    const pid = poultryId || poulaillerId;

    if (!pid) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId requis" });
    }

    if (!isValidObjectId(pid)) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId invalide" });
    }

    const poulailler = await Poulailler.findOne({
      _id: pid,
      owner: req.user.id,
    });
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    let alertId = null;

    if (type === "sensor") {
      const { parameter, value, threshold, severity } = rest;
      if (!parameter || value == null || threshold == null) {
        return res.status(400).json({
          success: false,
          error: "parameter, value et threshold sont requis pour type=sensor",
        });
      }
      const validParams = [
        "temperature",
        "humidity",
        "co2",
        "nh3",
        "dust",
        "waterLevel",
      ];
      if (!validParams.includes(parameter)) {
        return res.status(400).json({
          success: false,
          error: `Paramètre invalide. Valeurs acceptées : ${validParams.join(", ")}`,
        });
      }
      alertId = await createSensorAlert(
        pid,
        parameter,
        value,
        threshold,
        severity || "warn",
      );
    } else if (type === "door") {
      const { eventKey, triggeredBy } = rest;
      if (!eventKey) {
        return res
          .status(400)
          .json({ success: false, error: "eventKey requis pour type=door" });
      }
      alertId = await createDoorAlert(pid, eventKey, triggeredBy || "manual");
    } else if (type === "actuator") {
      const { actuator, state, triggeredBy } = rest;
      if (!actuator || !state) {
        return res.status(400).json({
          success: false,
          error: "actuator et state requis pour type=actuator",
        });
      }
      alertId = await createActuatorAlert(
        pid,
        actuator,
        state,
        triggeredBy || "manual",
      );
    } else if (type === "mqtt") {
      const { eventType } = rest;
      if (!eventType) {
        return res
          .status(400)
          .json({ success: false, error: "eventType requis pour type=mqtt" });
      }
      alertId = await createMqttAlert(pid, eventType);
    } else {
      return res.status(400).json({
        success: false,
        error:
          "type invalide. Valeurs acceptées : sensor, door, actuator, mqtt",
      });
    }

    if (!alertId) {
      return res.status(200).json({
        success: true,
        message: "Alerte dupliquée — non créée (cache actif)",
        data: null,
      });
    }

    const alert = await AlertModel.findById(alertId);
    res.status(201).json({ success: true, data: formatAlert(alert) });
  } catch (err) {
    console.error("[AlertController] createAlert :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/alerts/read
// Marquer une alerte ou tout un poulailler comme lu
// ─────────────────────────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const { alertId, poulaillerId, poultryId } = req.body;
    const pid = poulaillerId || poultryId;

    if (alertId) {
      if (!isValidObjectId(alertId)) {
        return res
          .status(400)
          .json({ success: false, error: "alertId invalide" });
      }

      const alert = await findAlertForUser(alertId, req.user.id);
      if (!alert) {
        return res
          .status(404)
          .json({ success: false, error: "Alerte non trouvée" });
      }

      alert.read = true;
      await alert.save();
      return res.status(200).json({ success: true, data: formatAlert(alert) });
    }

    if (pid) {
      if (!isValidObjectId(pid)) {
        return res
          .status(400)
          .json({ success: false, error: "poulaillerId invalide" });
      }

      const poulailler = await Poulailler.findOne({
        _id: pid,
        owner: req.user.id,
      });
      if (!poulailler) {
        return res
          .status(404)
          .json({ success: false, error: "Poulailler non trouvé" });
      }

      const result = await AlertModel.updateMany(
        { poulailler: pid, read: false },
        { read: true },
      );

      return res.status(200).json({
        success: true,
        updated: result.modifiedCount,
        data: {},
      });
    }

    return res.status(400).json({
      success: false,
      error: "alertId ou poulaillerId est requis",
    });
  } catch (err) {
    console.error("[AlertController] markAsRead :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alerts/:id/read
// Marquer une alerte spécifique comme lue
// ─────────────────────────────────────────────────────────────────────────────
exports.markOneAsRead = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, error: "ID d'alerte invalide" });
    }

    const alert = await findAlertForUser(req.params.id, req.user.id);
    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    alert.read = true;
    await alert.save();

    res.status(200).json({ success: true, data: formatAlert(alert) });
  } catch (err) {
    console.error("[AlertController] markOneAsRead :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/alerts/bulk/read                               ✅ NOUVEAU
// Marquer plusieurs alertes comme lues en une seule requête
// Body : { alertIds: ["id1", "id2", ...] }
// ─────────────────────────────────────────────────────────────────────────────
exports.markBulkAsRead = async (req, res) => {
  try {
    const { alertIds } = req.body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "alertIds doit être un tableau non vide",
      });
    }

    // Valider les ObjectIds
    const validIds = alertIds.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun ID valide fourni",
      });
    }

    // Récupérer les alertes avec leur poulailler pour vérifier l'ownership
    const alerts = await AlertModel.find({
      _id: { $in: validIds },
    }).populate("poulailler", "owner");

    // Filtrer uniquement les alertes appartenant à l'utilisateur
    const ownedAlertIds = alerts
      .filter(
        (a) =>
          a.poulailler &&
          a.poulailler.owner.toString() === req.user.id.toString(),
      )
      .map((a) => a._id);

    if (ownedAlertIds.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Aucune alerte trouvée pour cet utilisateur",
      });
    }

    const result = await AlertModel.updateMany(
      { _id: { $in: ownedAlertIds }, read: false },
      { read: true },
    );

    res.status(200).json({
      success: true,
      requested: validIds.length,
      updated: result.modifiedCount,
      message: `${result.modifiedCount} alerte${result.modifiedCount > 1 ? "s" : ""} marquée${result.modifiedCount > 1 ? "s" : ""} comme lue${result.modifiedCount > 1 ? "s" : ""}`,
    });
  } catch (err) {
    console.error("[AlertController] markBulkAsRead :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts
// Supprimer les alertes lues d'un poulailler
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteReadAlerts = async (req, res) => {
  try {
    const poulaillerId =
      req.query.poultryId ||
      req.query.poulaillerId ||
      req.body.poulaillerId ||
      req.body.poultryId;

    if (!poulaillerId) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId requis" });
    }

    if (!isValidObjectId(poulaillerId)) {
      return res
        .status(400)
        .json({ success: false, error: "poultryId invalide" });
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
      message: `${result.deletedCount} alerte${result.deletedCount > 1 ? "s" : ""} supprimée${result.deletedCount > 1 ? "s" : ""}`,
    });
  } catch (err) {
    console.error("[AlertController] deleteReadAlerts :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts/:id                                    ✅ NOUVEAU
// Supprimer une alerte spécifique
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteOneAlert = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, error: "ID d'alerte invalide" });
    }

    const alert = await findAlertForUser(req.params.id, req.user.id);
    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alerte non trouvée" });
    }

    await AlertModel.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      deleted: 1,
      message: "Alerte supprimée avec succès",
    });
  } catch (err) {
    console.error("[AlertController] deleteOneAlert :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/alerts/bulk                                   ✅ NOUVEAU
// Supprimer plusieurs alertes par IDs
// Body : { alertIds: ["id1", "id2", ...] }
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteBulkAlerts = async (req, res) => {
  try {
    const { alertIds } = req.body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "alertIds doit être un tableau non vide",
      });
    }

    // Valider les ObjectIds
    const validIds = alertIds.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun ID valide fourni",
      });
    }

    // Récupérer les alertes avec ownership check
    const alerts = await AlertModel.find({
      _id: { $in: validIds },
    }).populate("poulailler", "owner");

    // Filtrer uniquement les alertes de l'utilisateur
    const ownedAlertIds = alerts
      .filter(
        (a) =>
          a.poulailler &&
          a.poulailler.owner.toString() === req.user.id.toString(),
      )
      .map((a) => a._id);

    if (ownedAlertIds.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Aucune alerte trouvée pour cet utilisateur",
      });
    }

    const result = await AlertModel.deleteMany({
      _id: { $in: ownedAlertIds },
    });

    res.status(200).json({
      success: true,
      requested: validIds.length,
      deleted: result.deletedCount,
      message: `${result.deletedCount} alerte${result.deletedCount > 1 ? "s" : ""} supprimée${result.deletedCount > 1 ? "s" : ""}`,
    });
  } catch (err) {
    console.error("[AlertController] deleteBulkAlerts :", err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
