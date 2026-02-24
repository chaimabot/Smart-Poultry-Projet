// controllers/dashboardController.js
const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const Alert = require("../models/Alert");
const Module = require("../models/Module");
const Measure = require("../models/Measure");

// Helper pour "il y a X min"
function formatTimeAgo(date) {
  if (!date) return "N/A";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

exports.getDashboardStats = async (req, res) => {
  try {
    const totalEleveurs = await User.countDocuments({ role: "eleveur" });

    const poulaillersActifs = await Poulailler.countDocuments({
      status: "connecte",
      isArchived: false,
    });

    const poulaillersEnAttente = await Poulailler.countDocuments({
      status: "en_attente_module",
      isArchived: false,
    });

    const alertesNonResolues = await Alert.countDocuments({
      read: false,
      resolvedAt: null,
    });

    const totalModules = await Module.countDocuments();
    const modulesConnectes = await Module.countDocuments({
      lastPing: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const tauxConnexionModules =
      totalModules > 0
        ? Math.round((modulesConnectes / totalModules) * 100) + "%"
        : "0%";

    const derniereMesure = await Measure.findOne()
      .sort({ timestamp: -1 })
      .select("timestamp");

    res.json({
      success: true,
      data: {
        totalEleveurs,
        poulaillersActifs,
        poulaillersEnAttente,
        alertesNonResolues,
        tauxConnexionModules,
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

exports.getAlertesRecentes = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const alertes = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: "poulailler",
        select: "name owner",
        populate: {
          path: "owner",
          select: "firstName lastName",
        },
      });

    const formatted = alertes.map((a) => ({
      id: a._id.toString(),
      niveau: a.severity === "critical" ? "danger" : "avertissement",
      poulailler: a.poulailler?.name || "Poulailler inconnu",
      parametre: a.parameter,
      valeur: `${a.value}${a.parameter === "temperature" ? " °C" : a.parameter === "humidity" ? " %" : ""}`,
      tempsAgo: formatTimeAgo(a.createdAt),
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("Erreur getAlertesRecentes:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur alertes" });
  }
};

exports.getPoulaillersCritiques = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const poulaillers = await Poulailler.find({
      isArchived: false,
      $or: [
        { status: "Critique" },
        { status: "Avertissement" },
        { isCritical: true },
      ],
    })
      .sort({ isCritical: -1, status: 1 })
      .limit(limit)
      .populate("owner", "firstName lastName");

    const formatted = poulaillers.map((p) => ({
      nom: p.name || "Sans nom",
      eleveur: p.owner
        ? `${p.owner.firstName || ""} ${p.owner.lastName || ""}`.trim() ||
          "Inconnu"
        : "Inconnu",
      statut: p.isCritical ? "Critique" : p.status || "Avertissement",
      temperature: p.lastMonitoring?.temperature
        ? `${p.lastMonitoring.temperature} °C`
        : "N/A",
      alertesRecentes: p.alertesRecentes || 0,
      derniereMesure: p.lastMeasureAt ? formatTimeAgo(p.lastMeasureAt) : "N/A",
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("Erreur getPoulaillersCritiques:", err.message, err.stack);
    res.status(500).json({ success: false, error: "Erreur serveur critiques" });
  }
};
