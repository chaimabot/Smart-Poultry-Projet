const Poulailler = require("../models/Poulailler");
const User = require("../models/User");
const Alert = require("../models/Alert");

// ============================================================================
// HELPER — format d'une entrée de la liste
// ============================================================================

// Détermine le statut de connexion à partir des données temps réel
const computeConnectionStatus = (p) => {
  if (p.status === "en_attente_module") return "en_attente_module";
  if (p.isOnline && p.lastCommunicationAt) {
    const hoursSince = (Date.now() - new Date(p.lastCommunicationAt)) / 36e5;
    if (hoursSince > 4) return "hors_ligne";
    return "connecte";
  }
  return "hors_ligne";
};

// Détermine la sévérité d'alerte
const computeAlertSeverity = (alertesCount, isCritical) => {
  if (alertesCount === 0) return "ok";
  if (isCritical) return "critique";
  return "alerte";
};

// Traduit les actionneurs du modèle vers le format frontend
const mapActuators = (actuatorStates) => {
  if (!actuatorStates) return [];
  const map = [];
  if (actuatorStates.door) {
    const doorState =
      actuatorStates.door.status === "open" ? "Ouverte" : "Fermée";
    const doorMode = actuatorStates.door.mode === "auto" ? "Auto" : "Manuel";
    map.push({ name: "Porte", state: doorState, mode: doorMode, icon: "🚪" });
  }
  if (actuatorStates.ventilation) {
    const ventState =
      actuatorStates.ventilation.status === "on" ? "Allumée" : "Éteinte";
    const ventMode =
      actuatorStates.ventilation.mode === "auto" ? "Auto" : "Manuel";
    map.push({
      name: "Ventilation",
      state: ventState,
      mode: ventMode,
      icon: "💨",
    });
  }
  // Souvent la lampe et la pompe ne sont pas dans le modèle — fallback si absent
  if (!actuatorStates.lampe && !map.find((a) => a.name === "Lampe")) {
    map.push({ name: "Lampe", state: "Éteinte", mode: "Auto", icon: "💡" });
  }
  if (!actuatorStates.pompe && !map.find((a) => a.name === "Pompe")) {
    map.push({ name: "Pompe", state: "Éteinte", mode: "Manuel", icon: "💧" });
  }
  return map;
};

// Map des seuils du modèle vers le frontend
const mapThresholds = (seuils) => {
  if (!seuils) return null;
  return {
    tempMin: seuils.temperatureMin,
    tempMax: seuils.temperatureMax,
    humMin: seuils.humidityMin,
    humMax: seuils.humidityMax,
    co2Max: seuils.co2Max,
    nh3Max: seuils.nh3Max,
    dustMax: seuils.dustMax,
    waterMin: seuils.waterLevelMin,
  };
};

// Map des seuils automatiques
const mapAutoThresholds = (auto) => {
  if (!auto) return null;
  return {
    tempVentilo: auto.ventiloThresholdTemp,
    co2Ventilo: auto.ventiloThresholdCO2,
    doorOpen: auto.doorOpenTime,
    doorClose: auto.doorCloseTime,
  };
};

const formatPoulaillerListItem = async (p) => {
  const alertesCount = await Alert.countDocuments({
    poulailler: p._id,
    resolvedAt: null,
  });

  const connectionStatus = computeConnectionStatus(p);
  const alertSeverity = computeAlertSeverity(alertesCount, p.isCritical);

  return {
    id: p._id,
    codeUnique: p.uniqueCode,
    name: p.name,
    type: p.type ?? null,
    animalCount: p.animalCount ?? null,
    description: p.description ?? null,
    location: p.location ?? null,
    installationDate: p.installationDate?.toISOString?.() ?? null,
    archived: p.isArchived ?? false,
    owner: p.owner
      ? {
          id: p.owner._id,
          firstName: p.owner.firstName,
          lastName: p.owner.lastName,
          email: p.owner.email,
        }
      : null,
    status: p.status,
    connectionStatus,
    lastMeasure: p.lastMonitoring
      ? {
          temperature: p.lastMonitoring.temperature ?? null,
          humidity: p.lastMonitoring.humidity ?? null,
          co2: p.lastMonitoring.co2 ?? null,
          nh3: p.lastMonitoring.nh3 ?? null,
          waterLevel: p.lastMonitoring.waterLevel ?? null,
          dust: p.lastMonitoring.dust ?? null,
        }
      : null,
    lastMeasureDate:
      p.lastMeasureAt?.toISOString?.() ??
      p.lastMonitoring?.timestamp?.toISOString?.() ??
      null,
    lastAlertDate: p.lastAlert?.toISOString?.() ?? null,
    alertesActives: alertesCount,
    alertSeverity,
    dernierPing: p.lastCommunicationAt?.toISOString?.() ?? null,
    actuators: mapActuators(p.actuatorStates),
    thresholds: mapThresholds(p.seuils),
    autoThresholds: mapAutoThresholds(p.autoThresholds),
  };
};

// ============================================================================
// @desc    Obtenir tous les poulaillers (admin)
// @route   GET /api/admin/poulaillers
// @access  Private/Admin
// ============================================================================
exports.getAllPoulaillers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    const query = { isArchived: false };

    if (status) {
      query.status = status;
    }

    if (search) {
      // FIX #4 — recherche aussi par nom/prénom de l'éleveur via lookup
      const matchingOwners = await User.find(
        {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        },
        "_id",
      );
      const ownerIds = matchingOwners.map((u) => u._id);

      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { uniqueCode: { $regex: search, $options: "i" } },
        ...(ownerIds.length > 0 ? [{ owner: { $in: ownerIds } }] : []),
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

    const enrichedPoulaillers = await Promise.all(
      poulaillers.map(formatPoulaillerListItem),
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

// ============================================================================
// @desc    Obtenir un poulailler par ID (admin)
// @route   GET /api/admin/poulaillers/:id
// @access  Private/Admin
// ============================================================================
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

    const connectionStatus = computeConnectionStatus(poulailler);
    const alertSeverity = computeAlertSeverity(
      alertesCount,
      poulailler.isCritical,
    );

    res.json({
      success: true,
      data: {
        id: poulailler._id,
        codeUnique: poulailler.uniqueCode,
        name: poulailler.name,
        type: poulailler.type,
        animalCount: poulailler.animalCount,
        description: poulailler.description ?? null,
        location: poulailler.location ?? null,
        installationDate: poulailler.installationDate?.toISOString?.() ?? null,
        archived: poulailler.isArchived ?? false,
        owner: poulailler.owner
          ? {
              id: poulailler.owner._id ?? poulailler.owner.id,
              firstName: poulailler.owner.firstName,
              lastName: poulailler.owner.lastName,
              email: poulailler.owner.email,
            }
          : null,
        status: poulailler.status,
        connectionStatus,
        lastMeasure: poulailler.lastMonitoring
          ? {
              temperature: poulailler.lastMonitoring.temperature ?? null,
              humidity: poulailler.lastMonitoring.humidity ?? null,
              co2: poulailler.lastMonitoring.co2 ?? null,
              nh3: poulailler.lastMonitoring.nh3 ?? null,
              waterLevel: poulailler.lastMonitoring.waterLevel ?? null,
              dust: poulailler.lastMonitoring.dust ?? null,
            }
          : null,
        lastMeasureDate:
          poulailler.lastMeasureAt?.toISOString?.() ??
          poulailler.lastMonitoring?.timestamp?.toISOString?.() ??
          null,
        lastAlertDate: poulailler.lastAlert?.toISOString?.() ?? null,
        alertesActives: alertesCount,
        alertSeverity,
        dernierPing: poulailler.lastCommunicationAt?.toISOString?.() ?? null,
        actuators: mapActuators(poulailler.actuatorStates),
        thresholds: mapThresholds(poulailler.seuils),
        autoThresholds: mapAutoThresholds(poulailler.autoThresholds),
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

// ============================================================================
// @desc    Créer un poulailler (admin)              ← FIX #1 — handler manquant
// @route   POST /api/admin/poulaillers
// @access  Private/Admin
// ============================================================================
exports.createPoulailler = async (req, res) => {
  try {
    const { name, type, animalCount, ownerId } = req.body;

    // Validation minimale
    if (!name || !ownerId) {
      return res.status(400).json({
        success: false,
        error: "Le nom et le propriétaire sont obligatoires",
      });
    }

    if (name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "Le nom doit comporter au moins 3 caractères",
      });
    }

    const owner = await User.findById(ownerId);
    if (!owner) {
      return res.status(404).json({
        success: false,
        error: "Éleveur introuvable",
      });
    }

    // Génération du code unique : POL-XXXXXX
    const uniqueCode =
      "POL-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const poulailler = await Poulailler.create({
      name: name.trim(),
      type: type || "autre",
      animalCount: animalCount || undefined,
      owner: ownerId,
      uniqueCode,
      status: "en_attente_module",
    });

    await poulailler.populate("owner", "firstName lastName email");

    res.status(201).json({
      success: true,
      message: "Poulailler créé avec succès",
      data: await formatPoulaillerListItem(poulailler),
    });
  } catch (err) {
    console.error("[CREATE POULAILLER ERROR]", err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Code unique déjà utilisé, veuillez réessayer",
      });
    }
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création du poulailler",
    });
  }
};

// ============================================================================
// @desc    Mettre à jour un poulailler (admin)
// @route   PUT /api/admin/poulaillers/:id
// @access  Private/Admin
// ============================================================================
exports.updatePoulailler = async (req, res) => {
  try {
    // FIX #3 — type, animalCount et ownerId ignorés avant
    const {
      name,
      type,
      animalCount,
      ownerId,
      location,
      description,
      status,
      isArchived,
    } = req.body;

    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

    if (name) {
      if (name.trim().length < 3) {
        return res.status(400).json({
          success: false,
          error: "Le nom doit comporter au moins 3 caractères",
        });
      }
      poulailler.name = name.trim();
    }

    if (type !== undefined) poulailler.type = type;
    if (animalCount !== undefined) poulailler.animalCount = animalCount;

    if (ownerId !== undefined) {
      const owner = await User.findById(ownerId);
      if (!owner) {
        return res.status(404).json({
          success: false,
          error: "Éleveur introuvable",
        });
      }
      poulailler.owner = ownerId;
    }

    if (location !== undefined) poulailler.location = location;
    if (description !== undefined) poulailler.description = description;
    if (status) poulailler.status = status;
    if (isArchived !== undefined) poulailler.isArchived = isArchived;

    await poulailler.save();
    await poulailler.populate("owner", "firstName lastName email");

    res.json({
      success: true,
      message: "Poulailler mis à jour avec succès",
      data: await formatPoulaillerListItem(poulailler),
    });
  } catch (err) {
    console.error("[UPDATE POULAILLER ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour du poulailler",
    });
  }
};

// ============================================================================
// @desc    Supprimer un poulailler (admin) — soft delete
// @route   DELETE /api/admin/poulaillers/:id
// @access  Private/Admin
// ============================================================================
exports.deletePoulailler = async (req, res) => {
  try {
    const poulailler = await Poulailler.findById(req.params.id);

    if (!poulailler) {
      return res.status(404).json({
        success: false,
        error: "Poulailler non trouvé",
      });
    }

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

// ============================================================================
// @desc    Obtenir la liste des éleveurs (pour les selects)  ← FIX #2 — manquant
// @route   GET /api/admin/poulaillers/users
// @access  Private/Admin
// ============================================================================
exports.getUsers = async (req, res) => {
  try {
    const { search } = req.query;

    const query = { role: "eleveur", isActive: { $ne: false } };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("firstName lastName email")
      .sort({ lastName: 1, firstName: 1 })
      .limit(200);

    res.json({
      success: true,
      data: users.map((u) => ({
        id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
      })),
    });
  } catch (err) {
    console.error("[GET USERS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des éleveurs",
    });
  }
};
