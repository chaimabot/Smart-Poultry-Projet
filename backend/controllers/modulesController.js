const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");
const Joi = require("joi");

// Configuration
const CLAIM_CODE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 jours

// Schemas de validation
const createModuleSchema = Joi.object({
  serialNumber: Joi.string().required().trim().min(3).max(32),
  macAddress: Joi.string().required().trim(),
  deviceName: Joi.string().required().trim().min(2).max(50),
  firmwareVersion: Joi.string().allow("", null).max(20),
});

const generateClaimSchema = Joi.object({
  serialNumber: Joi.string().required().trim().min(3).max(32),
  macAddress: Joi.string().required().trim(),
  deviceName: Joi.string().required().trim().min(2).max(50),
  firmwareVersion: Joi.string().allow("", null).max(20),
});

const claimModuleSchema = Joi.object({
  claimCode: Joi.string().required().uppercase().trim(),
  poulaillerId: Joi.string().required(),
});

const dissociateSchema = Joi.object({
  reason: Joi.string().required().min(10).max(500).trim(),
  confirm: Joi.boolean().valid(true).required(),
});

// Fonctions utilitaires
function formatTimeAgo(date) {
  if (!date) return "Jamais";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

function formatModule(m) {
  return {
    id: m._id,
    serialNumber: m.serialNumber,
    macAddress: m.macAddress,
    deviceName: m.deviceName,
    firmwareVersion: m.firmwareVersion || "N/A",
    status: m.status,
    claimCode: m.claimCode || null,
    claimCodeExpiresAt: m.claimCodeExpiresAt,
    claimCodeUsedAt: m.claimCodeUsedAt,
    lastPing: m.lastPing,
    lastPingFormatted: formatTimeAgo(m.lastPing),
    installationDate: m.installationDate,
    poulailler: m.poulailler
      ? { id: m.poulailler._id, name: m.poulailler.name }
      : null,
    owner: m.owner
      ? {
          id: m.owner._id,
          name: `${m.owner.firstName} ${m.owner.lastName}`,
          email: m.owner.email,
        }
      : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// Obtenir tous les modules (pour les elevers: leurs modules seulement)
exports.getModules = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const query = {};

    // Si utilisateur connecte (pas admin), filtrer par owner
    if (req.user && req.user.role !== "admin") {
      query.owner = req.user._id;
    }

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { serialNumber: { $regex: search, $options: "i" } },
        { macAddress: { $regex: search, $options: "i" } },
        { deviceName: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Module.countDocuments(query);
    const modules = await Module.find(query)
      .populate({ path: "poulailler", select: "name" })
      .populate({ path: "owner", select: "firstName lastName email" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: modules.map(formatModule),
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET MODULES ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Obtenir un module par ID
exports.getModuleById = async (req, res) => {
  try {
    const mod = await Module.findById(req.params.id)
      .populate({ path: "poulailler", select: "name" })
      .populate({ path: "owner", select: "firstName lastName email" });

    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    res.json({ success: true, data: formatModule(mod) });
  } catch (err) {
    console.error("[GET MODULE BY ID ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Generer un code claim (admin seulement)
exports.generateClaimCode = async (req, res) => {
  console.log("\n========== GENERATE-CLAIM ==========");

  const { error, value } = generateClaimSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const serial = value.serialNumber.toUpperCase().trim();
  const mac = value.macAddress.toUpperCase().trim();
  const name = value.deviceName.trim();
  const fw = value.firmwareVersion || null;

  try {
    const existingModule = await Module.findOne({
      $or: [{ serialNumber: serial }, { macAddress: mac }],
    });

    if (existingModule) {
      const newClaimCode = Module.generateClaimCode();
      existingModule.claimCode = newClaimCode;
      existingModule.claimCodeExpiresAt = new Date(
        Date.now() + CLAIM_CODE_TTL_MS,
      );
      existingModule.claimCodeUsedAt = null;

      if (existingModule.status === "dissociated") {
        existingModule.status = "pending";
      }

      await existingModule.save();

      return res.json({
        success: true,
        message: "Module existant avec nouveau code claim",
        data: {
          id: existingModule._id,
          serialNumber: existingModule.serialNumber,
          macAddress: existingModule.macAddress,
          deviceName: existingModule.deviceName,
          firmwareVersion: existingModule.firmwareVersion,
          status: existingModule.status,
          claimCode: newClaimCode,
          claimCodeExpiresAt: existingModule.claimCodeExpiresAt,
        },
      });
    }

    const claimCode = Module.generateClaimCode();

    const mod = await Module.create({
      serialNumber: serial,
      macAddress: mac,
      deviceName: name,
      firmwareVersion: fw,
      claimCode,
      claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Module créé avec code claim",
      data: {
        id: mod._id,
        serialNumber: mod.serialNumber,
        macAddress: mod.macAddress,
        deviceName: mod.deviceName,
        firmwareVersion: mod.firmwareVersion,
        status: mod.status,
        claimCode: claimCode,
        claimCodeExpiresAt: mod.claimCodeExpiresAt,
      },
    });
  } catch (err) {
    console.error("[GENERATE CLAIM CODE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Claimer un module (l'ESP32 appelle cette route)
exports.claimModule = async (req, res) => {
  const { error, value } = claimModuleSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const code = value.claimCode.toUpperCase().trim();
  const poulaillerId = value.poulaillerId;

  try {
    const mod = await Module.findOne({
      claimCode: { $regex: new RegExp(`^${code}$`, "i") },
    });

    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Code claim invalide ou introuvable" });
    }

    if (mod.claimCodeUsedAt) {
      return res
        .status(400)
        .json({ success: false, error: "Ce code claim a déjà été utilisé" });
    }

    if (mod.claimCodeExpiresAt && new Date() > mod.claimCodeExpiresAt) {
      return res.status(400).json({
        success: false,
        error: "Ce code claim a expiré. Veuillez en générer un nouveau.",
      });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    const session = await Module.startSession();
    session.startTransaction();

    try {
      mod.claimCodeUsedAt = new Date();
      mod.poulailler = poulaillerId;
      mod.owner = poulailler.owner;
      mod.status = "associated";
      mod.installationDate = new Date();
      await mod.save({ session });

      poulailler.moduleId = mod._id;
      poulailler.status = "connecte";
      await poulailler.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: "Module réclamé et associé avec succès",
        data: formatModule(mod),
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("[CLAIM MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Creer un module (sans code claim)
exports.createModule = async (req, res) => {
  const { error, value } = createModuleSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  try {
    const mod = await Module.create({
      serialNumber: value.serialNumber.toUpperCase(),
      macAddress: value.macAddress.toUpperCase(),
      deviceName: value.deviceName,
      firmwareVersion: value.firmwareVersion,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Module créé avec succès",
      data: formatModule(mod),
    });
  } catch (err) {
    console.error("[CREATE MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Mettre a jour un module
exports.updateModule = async (req, res) => {
  try {
    const mod = await Module.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    res.json({ success: true, data: formatModule(mod) });
  } catch (err) {
    console.error("[UPDATE MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Associer un module a un poulailler
exports.associateModule = async (req, res) => {
  const { poulaillerId } = req.body;

  try {
    const mod = await Module.findById(req.params.id);
    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    if (mod.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, error: "Le module doit être en attente" });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    mod.poulailler = poulaillerId;
    mod.owner = poulailler.owner;
    mod.status = "associated";
    mod.installationDate = new Date();
    await mod.save();

    poulailler.moduleId = mod._id;
    poulailler.status = "connecte";
    await poulailler.save();

    res.json({
      success: true,
      message: "Module associé avec succès",
      data: formatModule(mod),
    });
  } catch (err) {
    console.error("[ASSOCIATE MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Dissocier un module
exports.dissociateModule = async (req, res) => {
  const { error, value } = dissociateSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { reason } = value;

  try {
    const mod = await Module.findById(req.params.id);
    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    if (!mod.poulailler || mod.status !== "associated") {
      return res
        .status(400)
        .json({ success: false, error: "Ce module n'est pas associé" });
    }

    const oldPoulaillerId = mod.poulailler;

    const newClaimCode = Module.generateClaimCode();

    mod.previousClaimCode = mod.claimCode;
    mod.claimCode = newClaimCode;
    mod.claimCodeExpiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);
    mod.claimCodeUsedAt = null;
    mod.poulailler = null;
    mod.owner = null;
    mod.status = "dissociated";
    mod.dissociationReason = reason;
    mod.dissociatedAt = new Date();
    await mod.save();

    await Poulailler.findByIdAndUpdate(oldPoulaillerId, {
      moduleId: null,
      status: "en_attente_module",
    });

    res.json({
      success: true,
      message: "Module dissocié. Nouveau code claim généré.",
      data: formatModule(mod),
    });
  } catch (err) {
    console.error("[DISSOCIATE MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Supprimer un module
exports.deleteModule = async (req, res) => {
  try {
    const mod = await Module.findById(req.params.id);
    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    if (mod.status === "associated") {
      return res
        .status(400)
        .json({ success: false, error: "Dissociez d'abord le module" });
    }

    await Module.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Module supprimé" });
  } catch (err) {
    console.error("[DELETE MODULE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Decoder QR code
exports.decodeQRCode = async (req, res) => {
  const { qrData } = req.body;

  if (!qrData) {
    return res
      .status(400)
      .json({ success: false, error: "Données QR requises" });
  }

  try {
    let claimCode = qrData.trim();

    if (qrData.startsWith("smartpoultry://") || qrData.includes("?")) {
      try {
        const url = new URL(
          qrData.startsWith("smartpoultry://")
            ? qrData
            : "smartpoultry://" + qrData,
        );
        claimCode = url.searchParams.get("c") || claimCode;
      } catch (e) {}
    }

    claimCode = claimCode.toUpperCase();

    const mod = await Module.findOne({ claimCode }).select(
      "serialNumber deviceName status claimCodeUsedAt claimCodeExpiresAt",
    );

    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Aucun module trouvé" });
    }

    if (mod.claimCodeUsedAt) {
      return res
        .status(400)
        .json({ success: false, error: "Code déjà utilisé" });
    }

    if (mod.claimCodeExpiresAt && new Date() > mod.claimCodeExpiresAt) {
      return res.status(400).json({ success: false, error: "Code expiré" });
    }

    res.json({
      success: true,
      data: {
        claimCode: mod.claimCode,
        serialNumber: mod.serialNumber,
        deviceName: mod.deviceName,
        status: mod.status,
      },
    });
  } catch (err) {
    console.error("[DECODE QR ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Obtenir les poulaillers en attente de module
exports.getPendingPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      status: "en_attente_module",
      isArchived: false,
    })
      .populate({ path: "owner", select: "firstName lastName email" })
      .select("name type animalCount owner");

    res.json({
      success: true,
      data: poulaillers.map((p) => ({
        id: p._id,
        name: p.name,
        type: p.type,
        animalCount: p.animalCount,
        owner: p.owner
          ? {
              id: p.owner._id,
              name: `${p.owner.firstName} ${p.owner.lastName}`,
              email: p.owner.email,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[GET PENDING POULAILLERS ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Mettre a jour le ping du module (appele par MQTT)
exports.updatePing = async (req, res) => {
  const { serialNumber, macAddress } = req.body;

  if (!serialNumber && !macAddress) {
    return res
      .status(400)
      .json({ success: false, error: "serialNumber ou macAddress requis" });
  }

  try {
    const query = serialNumber
      ? { serialNumber: serialNumber.toUpperCase() }
      : { macAddress: macAddress.toUpperCase() };

    const mod = await Module.findOne(query);

    if (!mod) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    mod.lastPing = new Date();

    // Recalculer le statut
    if (mod.status === "offline") {
      mod.status = "associated";
    }

    await mod.save();

    res.json({
      success: true,
      message: "Ping mis à jour",
      data: {
        id: mod._id,
        status: mod.status,
        lastPing: mod.lastPing,
      },
    });
  } catch (err) {
    console.error("[UPDATE PING ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
