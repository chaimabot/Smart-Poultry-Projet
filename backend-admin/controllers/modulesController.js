const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");
const Joi = require("joi");

// Configuration
const CLAIM_CODE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

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
    // Retourner le code claim COMPLET pour permettre la copie
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

// Controllers
exports.getModules = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const query = {};

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

exports.generateClaimCode = async (req, res) => {
  console.log("\n========== GENERATE-CLAIM ==========");
  console.log("Request body:", req.body);

  const { error, value } = generateClaimSchema.validate(req.body);
  if (error) {
    console.log("Validation error:", error.details[0].message);
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const serial = value.serialNumber.toUpperCase().trim();
  const mac = value.macAddress.toUpperCase().trim();
  const name = value.deviceName.trim();
  const fw = value.firmwareVersion || null;

  console.log("Normalized:", { serial, mac, name });

  try {
    const existingModule = await Module.findOne({
      $or: [{ serialNumber: serial }, { macAddress: mac }],
    });

    if (existingModule) {
      console.log("Existing module found:", existingModule.serialNumber);

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
      console.log("Module updated with new code:", newClaimCode);

      // Retourner le code COMPLET (pas masque) pour les modules existants aussi
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
          claimCode: newClaimCode, // Code COMPLET
          claimCodeExpiresAt: existingModule.claimCodeExpiresAt,
          claimCodeUsedAt: existingModule.claimCodeUsedAt,
          lastPing: existingModule.lastPing,
          installationDate: existingModule.installationDate,
          createdAt: existingModule.createdAt,
          updatedAt: existingModule.updatedAt,
        },
      });
    }

    const claimCode = Module.generateClaimCode();
    console.log("Creating new module with code:", claimCode);

    const mod = await Module.create({
      serialNumber: serial,
      macAddress: mac,
      deviceName: name,
      firmwareVersion: fw,
      claimCode,
      claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
      status: "pending",
    });

    console.log("Module created:", mod._id);

    // Retourner le code COMPLET lors de la generation (pas masque)
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
        claimCode: claimCode, // Code COMPLET pas masque
        claimCodeExpiresAt: mod.claimCodeExpiresAt,
        claimCodeUsedAt: mod.claimCodeUsedAt,
        lastPing: mod.lastPing,
        installationDate: mod.installationDate,
        createdAt: mod.createdAt,
        updatedAt: mod.updatedAt,
      },
    });
  } catch (err) {
    console.error("[GENERATE CLAIM CODE ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.claimModule = async (req, res) => {
  const { error, value } = claimModuleSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const code = value.claimCode.toUpperCase().trim();
  const poulaierId = value.poulaillerId;

  console.log("\n========== CLAIM MODULE ==========");
  console.log("Claim code received:", code);
  console.log("Poulailler ID:", poulaierId);

  try {
    // Recherche avec expression régulière pour être insensible à la casse
    const mod = await Module.findOne({
      claimCode: { $regex: new RegExp(`^${code}$`, "i") },
    });

    console.log("Module found:", mod ? mod.serialNumber : "NONE");

    if (!mod) {
      // Debug: essayer de trouver des modules avec des codes similaires
      const allPendingModules = await Module.find({
        status: { $in: ["pending", "dissociated"] },
      })
        .select("claimCode serialNumber status")
        .limit(5);
      console.log(
        "Available pending modules:",
        allPendingModules.map((m) => ({
          serial: m.serialNumber,
          code: m.claimCode,
          status: m.status,
        })),
      );

      return res
        .status(404)
        .json({ success: false, error: "Code claim invalide ou introuvable" });
    }

    // Vérifier si le code a déjà été utilisé
    if (mod.claimCodeUsedAt) {
      return res
        .status(400)
        .json({ success: false, error: "Ce code claim a déjà été utilisé" });
    }

    // CORRECTION: Vérifier si le code claim a expiré
    if (mod.claimCodeExpiresAt && new Date() > mod.claimCodeExpiresAt) {
      return res.status(400).json({
        success: false,
        error: "Ce code claim a expiré. Veuillez en générer un nouveau.",
      });
    }

    const poulaier = await Poulailler.findById(poulaierId);
    if (!poulaier) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    // CORRECTION: Vérifier que l'utilisateur est bien le propriétaire du poulailler
    // ou qu'il est admin (req.user doit contenir le user id)
    const userId = req.user?.id || req.user?._id;
    if (
      userId &&
      poulaier.owner &&
      poulaier.owner.toString() !== userId.toString()
    ) {
      // Vérifier si l'utilisateur est admin (role admin)
      if (req.user?.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Vous n'êtes pas propriétaire de ce poulailler",
        });
      }
    }

    // Utiliser une transaction pour éviter les race conditions
    const session = await Module.startSession();
    session.startTransaction();

    try {
      mod.claimCodeUsedAt = new Date();
      mod.poulailler = poulaierId;
      mod.owner = poulaier.owner;
      mod.status = "associated";
      mod.installationDate = new Date();
      await mod.save({ session });

      poulaier.moduleId = mod._id;
      poulaier.status = "connecte";
      await poulaier.save({ session });

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

    const poulaier = await Poulailler.findById(poulaillerId);
    if (!poulaier) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    mod.poulailler = poulaillerId;
    mod.owner = poulaier.owner;
    mod.status = "associated";
    mod.installationDate = new Date();
    await mod.save();

    poulaier.moduleId = mod._id;
    poulaier.status = "connecte";
    await poulaier.save();

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

    const oldPoulaierId = mod.poulailler;

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

    await Poulailler.findByIdAndUpdate(oldPoulaierId, {
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

exports.getAvailableModules = async (req, res) => {
  try {
    const mods = await Module.find({
      status: "pending",
      claimCode: { $ne: null },
    }).select("serialNumber deviceName status");

    res.json({ success: true, data: mods });
  } catch (err) {
    console.error("[GET AVAILABLE MODULES ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

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
