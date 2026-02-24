const Poulailler = require("../models/Poulailler");
const User = require("../models/User");
const Alert = require("../models/Alert");

// @desc    Obtenir tous les poulaillers (admin)
// @route   GET /api/admin/poulaillers
// @access  Private/Admin
exports.getAllPoulaillers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const query = { isArchived: false };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { uniqueCode: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const poulaillers = await Poulailler.find(query)
      .populate("owner", "firstName lastName email")
      .populate("moduleId", "name status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Poulailler.countDocuments(query);

    // Enrichir avec le nombre d'alertes actives
    const enrichedPoulaillers = await Promise.all(
      poulaillers.map(async (p) => {
        const alertesCount = await Alert.countDocuments({
          poulailler: p._id,
          resolvedAt: null,
        });
        return {
          id: p._id,
          codeUnique: p.uniqueCode,
          name: p.name,
          owner: p.owner
            ? {
                id: p.owner._id,
                firstName: p.owner.firstName,
                lastName: p.owner.lastName,
              }
            : null,
          status: p.status,
          lastMeasure: p.lastMonitoring,
          alertesActives: alertesCount,
          dernierPing: p.lastCommunicationAt,
          lastMeasureAt: p.lastMeasureAt,
        };
      }),
    );

    res.json({
      success: true,
      data: enrichedPoulaillers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[GET ALL POULAILLERS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des poulaillers",
    });
  }
};

// @desc    Obtenir un poulailler par ID (admin)
// @route   GET /api/admin/poulaillers/:id
// @access  Private/Admin
exports.getPoulaillerById = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id)
      .populate("owner", "firstName lastName email phone")
      .populate("moduleId");

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    const alertesCount = await Alert.countDocuments({
      poulailler: poulailler._id,
      resolvedAt: null,
    });

    res.json({
      success: true,
      data: {
        id: poulailler._id,
        codeUnique: poulailler.uniqueCode,
        name: poulailler.name,
        type: poulailler.type,
        animalCount: poulailler.animalCount,
        owner: poulailler.owner,
        status: poulailler.status,
        seuils: poulailler.seuils,
        autoThresholds: poulailler.autoThresholds,
        actuatorStates: poulailler.actuatorStates,
        lastMonitoring: poulailler.lastMonitoring,
        lastMeasureAt: poulailler.lastMeasureAt,
        alertesActives: alertesCount,
        isCritical: poulailler.isCritical,
        isOnline: poulailler.isOnline,
        lastCommunicationAt: poulailler.lastCommunicationAt,
        createdAt: poulailler.createdAt,
      },
    });
  } catch (err) {
    console.error("[GET POULAILLER BY ID ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du poulailler",
    });
  }
};

// @desc    Mettre à jour un poulailler (admin)
// @route   PUT /api/admin/poulaillers/:id
// @access  Private/Admin
exports.updatePoulailler = async (req, res) => {
  try {
    const { name, location, description, status, isArchived } = req.body;

    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    if (name) poulailler.name = name;
    if (location !== undefined) poulailler.location = location;
    if (description !== undefined) poulailler.description = description;
    if (status) poulailler.status = status;
    if (isArchived !== undefined) poulailler.isArchived = isArchived;

    await poulailler.save();

    res.json({
      success: true,
      message: "Poulailler mis à jour avec succès",
      data: poulailler,
    });
  } catch (err) {
    console.error("[UPDATE POULAILLER ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour du poulailler",
    });
  }
};

// @desc    Supprimer un poulailler (admin)
// @route   DELETE /api/admin/poulaillers/:id
// @access  Private/Admin
exports.deletePoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    // Archiver au lieu de supprimer (soft delete)
    poulailler.isArchived = true;
    await poulailler.save();

    res.json({
      success: true,
      message: "Poulailler archivé avec succès",
    });
  } catch (err) {
    console.error("[DELETE POULAILLER ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression du poulailler",
    });
  }
};
