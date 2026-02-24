const Module = require("../models/Module");
const Poulailler = require("../models/Poulailler");
const User = require("../models/User");
const Joi = require("joi");

// ============================================================================
// CONFIGURATION
// ============================================================================

// Delai d'expiration du code claim (180 jours en millisecondes)
const CLAIM_CODE_TTL_DAYS = 180;
const CLAIM_CODE_TTL_MS = CLAIM_CODE_TTL_DAYS * 24 * 60 * 60 * 1000;

// Rate limiting - nombre de tentatives max par IP
const MAX_CLAIM_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Stockage en memoire pour le rate limiting (en production, utiliser Redis)
const claimAttempts = new Map();

// ============================================================================
// SCHEMAS DE VALIDATION
// ============================================================================

/**
 * Schema de validation pour la creation d'un module
 * @security - Validation stricte pour eviter les injections
 */
const createModuleSchema = Joi.object({
  serialNumber: Joi.string()
    .required()
    .uppercase()
    .trim()
    .min(8)
    .max(32)
    .pattern(/^[A-Z0-9\-]+$/),
  macAddress: Joi.string()
    .required()
    .uppercase()
    .pattern(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/),
  deviceName: Joi.string()
    .required()
    .min(2)
    .max(50)
    .trim()
    .pattern(/^[A-Za-z0-9\s\-_]+$/),
  firmwareVersion: Joi.string().allow("", null).max(20),
});

/**
 * Schema de validation pour la mise a jour d'un module
 */
const updateModuleSchema = Joi.object({
  deviceName: Joi.string()
    .min(2)
    .max(50)
    .trim()
    .pattern(/^[A-Za-z0-9\s\-_]+$/),
  firmwareVersion: Joi.string().allow("", null).max(20),
});

/**
 * Schema de validation pour le claim d'un module
 * SIMPLIFICATION: claim passe directement a associated avec poulaillerId
 * @security - Validation stricte du code claim
 */
const claimModuleSchema = Joi.object({
  claimCode: Joi.string()
    .required()
    .uppercase()
    .trim()
    .min(10)
    .max(14)
    .pattern(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
  poulaillerId: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{24}$/),
});

/**
 * Schema de validation pour l'association module-poulailler
 * (Plus necessaire avec le nouveau flux - kept for backward compatibility)
 */
const associateSchema = Joi.object({
  poulaillerId: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{24}$/),
});

/**
 * Schema de validation pour la dissociation
 * @security - Motif obligatoire pour audit
 */
const dissociateSchema = Joi.object({
  reason: Joi.string().required().min(10).max(500).trim(),
  confirm: Joi.boolean().valid(true).required(),
});

/**
 * Schema de validation pour la generation de code claim
 */
const generateClaimSchema = Joi.object({
  serialNumber: Joi.string()
    .required()
    .uppercase()
    .trim()
    .min(8)
    .max(32)
    .pattern(/^[A-Z0-9\-]+$/),
  macAddress: Joi.string()
    .required()
    .uppercase()
    .pattern(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/),
  deviceName: Joi.string()
    .required()
    .min(2)
    .max(50)
    .trim()
    .pattern(/^[A-Za-z0-9\s\-_]+$/),
  firmwareVersion: Joi.string().allow("", null).max(20),
});

/**
 * Schema de validation pour la Recherche
 * Statuts SIMPLIFIES: pending, associated, offline, dissociated
 */
const searchQuerySchema = Joi.object({
  status: Joi.string().valid("pending", "associated", "offline", "dissociated"),
  search: Joi.string().max(50).trim(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  ownerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
});

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Formate une date en "il y a X" (francais)
 */
function formatTimeAgo(date) {
  if (!date) return "Jamais";
  const diff = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.round(diff / 60)} h`;
  return `il y a ${Math.round(diff / 1440)} j`;
}

/**
 * Nettoie les anciennes entrees de rate limiting
 */
function cleanupRateLimit(ip) {
  const now = Date.now();
  const attempts = claimAttempts.get(ip);
  if (attempts) {
    const validAttempts = attempts.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    if (validAttempts.length === 0) {
      claimAttempts.delete(ip);
    } else {
      claimAttempts.set(ip, validAttempts);
    }
  }
}

/**
 * Verifie et met a jour le rate limiting
 */
function checkRateLimit(ip) {
  cleanupRateLimit(ip);
  const attempts = claimAttempts.get(ip) || [];

  if (attempts.length >= MAX_CLAIM_ATTEMPTS) {
    return true; // Rate limit depasse
  }

  attempts.push(Date.now());
  claimAttempts.set(ip, attempts);
  return false;
}

/**
 * Formate un module pour la reponse API
 */
function formatModule(m) {
  return {
    id: m._id,
    serialNumber: m.serialNumber,
    macAddress: m.macAddress,
    deviceName: m.deviceName,
    firmwareVersion: m.firmwareVersion || "N/A",
    status: m.status,
    claimCode: m.claimCode ? `${m.claimCode.substring(0, 4)}-XXXX-XXXX` : null,
    claimCodeExpiresAt: m.claimCodeExpiresAt,
    claimCodeUsedAt: m.claimCodeUsedAt,
    lastPing: m.lastPing,
    lastPingFormatted: formatTimeAgo(m.lastPing),
    installationDate: m.installationDate,
    poulailler: m.poulailler
      ? {
          id: m.poulailler._id,
          name: m.poulailler.name,
        }
      : null,
    owner: m.owner
      ? {
          id: m.owner._id,
          name: `${m.owner.firstName} ${m.owner.lastName}`,
          email: m.owner.email,
        }
      : null,
    dissociationReason: m.dissociationReason,
    dissociatedAt: m.dissociatedAt,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * @desc    Liste des modules avec pagination et filtres
 * @route   GET /api/admin/modules
 * @access  Private/Admin
 */
exports.getModules = async (req, res) => {
  try {
    const { error, value } = searchQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }

    const { status, search, page, limit, ownerId } = value;
    const query = {};

    if (status) query.status = status;
    if (ownerId) query.owner = ownerId;
    if (search) {
      query.$or = [
        { serialNumber: { $regex: search, $options: "i" } },
        { macAddress: { $regex: search, $options: "i" } },
        { deviceName: { $regex: search, $options: "i" } },
        { claimCode: { $regex: search.toUpperCase(), $options: "i" } },
      ];
    }

    const total = await Module.countDocuments(query);
    const modules = await Module.find(query)
      .populate({ path: "poulailler", select: "name" })
      .populate({ path: "owner", select: "firstName lastName email" })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      data: modules.map(formatModule),
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[GET MODULES ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des modules",
    });
  }
};

/**
 * @desc    Obtenir un module par ID
 * @route   GET /api/admin/modules/:id
 * @access  Private/Admin
 */
exports.getModuleById = async (req, res) => {
  try {
    const module = await Module.findById(req.params.id)
      .populate({
        path: "poulailler",
        select: "name owner status",
        populate: { path: "owner", select: "firstName lastName email" },
      })
      .populate({ path: "owner", select: "firstName lastName email" })
      .populate({
        path: "auditLogs.performedBy",
        select: "firstName lastName email",
      });

    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    res.json({ success: true, data: formatModule(module) });
  } catch (err) {
    console.error("[GET MODULE BY ID ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la récupération du module",
      });
  }
};

/**
 * @desc    Generer un nouveau module avec code claim
 * @route   POST /api/admin/modules/generate-claim
 * @access  Private/Admin
 * @security Genere un code claim cryptographique avec TTL de 180 jours
 *
 * FLUX SIMPLIFIE:
 * - Cree/Met a jour le module en statut 'pending'
 * - Genere un code claim cryptographique
 */
exports.generateClaimCode = async (req, res) => {
  const { error, value } = generateClaimSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { serialNumber, macAddress, deviceName, firmwareVersion } = value;

  try {
    const existingModule = await Module.findOne({
      $or: [{ serialNumber }, { macAddress }],
    });

    if (existingModule) {
      // Module existant - regenerer le code si expire
      if (existingModule.claimCode && !existingModule.isClaimCodeExpired()) {
        return res.json({
          success: true,
          message: "Module existant avec code claim valide",
          data: formatModule(existingModule),
        });
      }

      // Nouveau code claim
      const newClaimCode = Module.generateClaimCode();
      existingModule.claimCode = newClaimCode;
      existingModule.claimCodeExpiresAt = new Date(
        Date.now() + CLAIM_CODE_TTL_MS,
      );
      existingModule.claimCodeUsedAt = null;
      // Le module doit etre en pending (pas en stock/claimed)
      if (existingModule.status === "dissociated") {
        existingModule.status = "pending";
      }
      await existingModule.save();

      await existingModule.addAuditLog(
        "code_generated",
        req.user._id,
        "Nouveau code claim généré",
        { claimCode: newClaimCode, ipAddress: req.ip },
      );

      return res.json({
        success: true,
        message: "Nouveau code claim généré pour le module existant",
        data: formatModule(existingModule),
      });
    }

    // Creer un nouveau module avec code claim - statut 'pending'
    const claimCode = Module.generateClaimCode();
    const module = await Module.create({
      serialNumber,
      macAddress,
      deviceName,
      firmwareVersion,
      claimCode,
      claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS),
      status: "pending", // Statut par defaut simplifie
    });

    await module.addAuditLog(
      "created",
      req.user._id,
      "Module créé avec code claim",
      { claimCode, ipAddress: req.ip },
    );

    res.status(201).json({
      success: true,
      message: "Module créé avec code claim",
      data: formatModule(module),
    });
  } catch (err) {
    console.error("[GENERATE CLAIM CODE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la génération du code claim",
      });
  }
};

/**
 * @desc    Claim un module et l'associer a un poulailler en une seule etape
 * @route   POST /api/admin/modules/claim
 * @access  Private/Admin
 *
 * FLUX SIMPLIFIE (fusion claim + associate):
 * - Verifie le code claim
 * - Associe directement au poulailler specifie
 * - Passe le module a 'associated'
 *
 * @security
 *   - Rate limiting: 10 tentatives / IP / 5 min
 *   - Code claim a usage unique
 *   - Code expire apres 180 jours
 *   - Transaction atomique
 */
exports.claimModule = async (req, res) => {
  // Verification rate limiting
  const clientIp = req.ip || req.connection.remoteAddress;
  if (checkRateLimit(clientIp)) {
    console.warn(`[RATE LIMIT] Trop de tentatives de claim depuis ${clientIp}`);
    return res.status(429).json({
      success: false,
      error: "Trop de tentatives. Veuillez patienter 5 minutes.",
    });
  }

  // Validation du code claim ET poulaillerId
  const { error, value } = claimModuleSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: "Format invalide" });
  }

  const { claimCode, poulaillerId } = value;

  try {
    // Rechercher le module avec le code claim
    const module = await Module.findOne({ claimCode: claimCode.toUpperCase() });

    if (!module) {
      console.warn(
        `[CLAIM] Code claim invalide: ${claimCode} from ${clientIp}`,
      );
      return res
        .status(404)
        .json({ success: false, error: "Code claim invalide" });
    }

    // Verifier si deja utilise
    if (module.claimCodeUsedAt) {
      return res
        .status(400)
        .json({ success: false, error: "Ce code claim a déjà été utilisé" });
    }

    // Verifier l'expiration
    if (module.isClaimCodeExpired()) {
      return res
        .status(400)
        .json({ success: false, error: "Ce code claim a expiré" });
    }

    // Verifier le poulailler
    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    // Verifier que le poulailler est en attente de module
    if (poulailler.status !== "en_attente_module") {
      return res.status(400).json({
        success: false,
        error: "Ce poulailler n'est pas en attente d'un module",
      });
    }

    // Transaction atomique pour claim + association
    const session = await Module.startSession();
    session.startTransaction();

    try {
      // Marquer le code comme utilise ET associer directement
      module.claimCodeUsedAt = new Date();
      module.poulailler = poulaillerId;
      module.owner = poulailler.owner;
      module.status = "associated"; // Directly to associated!
      module.installationDate = new Date();
      await module.save({ session });

      // Mettre a jour le poulailler
      poulailler.moduleId = module._id;
      poulailler.status = "connecte";
      await poulailler.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log d'audit
      await module.addAuditLog(
        "associated",
        req.user._id,
        `Module réclamé et associé au poulailler ${poulailler.name}`,
        { poulaillerId, claimCode, ipAddress: clientIp },
      );

      console.log(
        `[CLAIM+ASSOCIATE] Module ${module.serialNumber} reclame et associe a ${poulailler.name}`,
      );

      res.json({
        success: true,
        message: "Module réclamé et associé avec succès",
        data: formatModule(module),
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("[CLAIM MODULE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la réclamation du module",
      });
  }
};

/**
 * @desc    Creer un nouveau module (sans code claim)
 * @route   POST /api/admin/modules
 * @access  Private/Admin
 */
exports.createModule = async (req, res) => {
  const { error, value } = createModuleSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { serialNumber, macAddress, deviceName, firmwareVersion } = value;

  try {
    const existingModule = await Module.findOne({
      $or: [{ serialNumber }, { macAddress }],
    });
    if (existingModule) {
      return res.status(409).json({
        success: false,
        error: "Ce numéro de série ou MAC existe déjà",
      });
    }

    const module = await Module.create({
      serialNumber,
      macAddress,
      deviceName,
      firmwareVersion,
      status: "pending", // Statut par defaut simplifie
    });

    await module.addAuditLog(
      "created",
      req.user._id,
      "Module créé sans code claim",
      { ipAddress: req.ip },
    );

    res.status(201).json({
      success: true,
      message: "Module créé avec succès",
      data: formatModule(module),
    });
  } catch (err) {
    console.error("[CREATE MODULE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la création du module" });
  }
};

/**
 * @desc    Mettre a jour un module
 * @route   PUT /api/admin/modules/:id
 * @access  Private/Admin
 */
exports.updateModule = async (req, res) => {
  const { error, value } = updateModuleSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    const { deviceName, firmwareVersion } = value;
    if (deviceName !== undefined) module.deviceName = deviceName;
    if (firmwareVersion !== undefined) module.firmwareVersion = firmwareVersion;

    await module.save();

    res.json({
      success: true,
      message: "Module mis à jour avec succès",
      data: formatModule(module),
    });
  } catch (err) {
    console.error("[UPDATE MODULE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la mise à jour du module",
      });
  }
};

/**
 * @desc    Associer un module a un poulailler (methode alternative)
 * @route   PUT /api/admin/modules/:id/associate
 * @access  Private/Admin
 * @security Transaction atomique
 */
exports.associateModule = async (req, res) => {
  const { error, value } = associateSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { poulaillerId } = value;
  const clientIp = req.ip || req.connection.remoteAddress;

  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    // Le module doit etre en pending
    if (module.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "Le module doit être en attente pour être associé",
      });
    }

    const poulailler = await Poulailler.findById(poulaillerId);
    if (!poulailler) {
      return res
        .status(404)
        .json({ success: false, error: "Poulailler non trouvé" });
    }

    if (poulailler.status !== "en_attente_module") {
      return res.status(400).json({
        success: false,
        error: "Ce poulailler n'est pas en attente d'un module",
      });
    }

    if (poulailler.moduleId) {
      return res.status(400).json({
        success: false,
        error: "Ce poulailler a déjà un module associé",
      });
    }

    const session = await Module.startSession();
    session.startTransaction();

    try {
      module.poulailler = poulaillerId;
      module.owner = poulailler.owner;
      module.status = "associated";
      module.installationDate = new Date();
      await module.save({ session });

      poulailler.moduleId = module._id;
      poulailler.status = "connecte";
      await poulailler.save({ session });

      await session.commitTransaction();
      session.endSession();

      await module.addAuditLog(
        "associated",
        req.user._id,
        `Module associé au poulailler ${poulailler.name}`,
        { poulaillerId, ipAddress: clientIp },
      );

      res.json({
        success: true,
        message: "Module associé avec succès",
        data: formatModule(module),
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("[ASSOCIATE MODULE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de l'association du module",
      });
  }
};

/**
 * @desc    Dissocier un module d'un poulailler
 * @route   PUT /api/admin/modules/:id/dissociate
 * @access  Private/Admin
 *
 * FLUX SIMPLIFIE:
 * - Passe le module a 'dissociated'
 * - Genere un nouveau code claim pour reutilisation future
 *
 * @security
 *   - Confirmation double (flag confirm + motif obligatoire)
 *   - Log d'audit complet
 */
exports.dissociateModule = async (req, res) => {
  const { error, value } = dissociateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error:
        "Motif de dissociation obligatoire (10-500 caractères) et confirmation requise",
    });
  }

  const { reason, confirm } = value;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!confirm) {
    return res.status(400).json({
      success: false,
      error: "Confirmation requise pour la dissociation",
    });
  }

  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    if (!module.poulailler || module.status !== "associated") {
      return res.status(400).json({
        success: false,
        error: "Ce module n'est pas associé à un poulailler",
      });
    }

    const poulaillerId = module.poulailler;
    const poulailler = await Poulailler.findById(poulaillerId);

    // Transaction atomique
    const session = await Module.startSession();
    session.startTransaction();

    try {
      // Sauvegarder l'ancien code claim
      module.previousClaimCode = module.claimCode;
      // Generer un nouveau code claim pour reutilisation
      module.claimCode = Module.generateClaimCode();
      module.claimCodeExpiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);
      module.claimCodeUsedAt = null;
      module.poulailler = null;
      module.owner = null;
      module.status = "dissociated"; // Nouveau statut!
      module.dissociationReason = reason;
      module.dissociatedAt = new Date();
      await module.save({ session });

      // Mettre a jour le poulailler
      if (poulailler) {
        poulailler.moduleId = null;
        poulailler.status = "en_attente_module";
        await poulailler.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      await module.addAuditLog(
        "dissociated",
        req.user._id,
        `Module dissocié. Motif: ${reason}. Nouveau code: ${module.claimCode}`,
        { poulaillerId, ipAddress: clientIp },
      );

      console.log(
        `[DISSOCIATE] Module ${module.serialNumber} dissocie. Nouveau code: ${module.claimCode}`,
      );

      res.json({
        success: true,
        message:
          "Module dissocié. Un nouveau code claim a été généré pour réutilisation.",
        data: formatModule(module),
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("[DISSOCIATE MODULE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la dissociation du module",
      });
  }
};

/**
 * @desc    Supprimer un module
 * @route   DELETE /api/admin/modules/:id
 * @access  Private/Admin
 */
exports.deleteModule = async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res
        .status(404)
        .json({ success: false, error: "Module non trouvé" });
    }

    if (module.status === "associated" && module.poulailler) {
      return res.status(400).json({
        success: false,
        error:
          "Impossible de supprimer un module associé. Veuillez d'abord le dissocier.",
      });
    }

    if (module.poulailler) {
      await Poulailler.findByIdAndUpdate(module.poulailler, {
        moduleId: null,
        status: "en_attente_module",
      });
    }

    await Module.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "Module supprimé avec succès" });
  } catch (err) {
    console.error("[DELETE MODULE ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la suppression du module",
      });
  }
};

/**
 * @desc    Obtenir les modules disponibles (en attente)
 * @route   GET /api/admin/modules/available
 * @access  Private/Admin
 */
exports.getAvailableModules = async (req, res) => {
  try {
    const modules = await Module.find({
      status: "pending",
      claimCode: { $ne: null },
    }).select("serialNumber deviceName status claimCode");

    res.json({ success: true, data: modules });
  } catch (err) {
    console.error("[GET AVAILABLE MODULES ERROR]", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la récupération des modules disponibles",
      });
  }
};

/**
 * @desc    Decoder le code QR et extraire les informations de claim
 * @route   POST /api/admin/modules/decode-qr
 * @access  Private/Admin
 */
exports.decodeQRCode = async (req, res) => {
  const { qrData } = req.body;

  if (!qrData) {
    return res
      .status(400)
      .json({ success: false, error: "Donnees QR code requises" });
  }

  try {
    let claimCode = qrData;
    let serialNumber = null;

    // Parser l'URL si presente: smartpoultry://claim?v=1&c=CODECLAIM&s=SERIAL-MAC
    if (qrData.startsWith("smartpoultry://")) {
      try {
        const url = new URL(qrData);
        claimCode = url.searchParams.get("c") || claimCode;
        serialNumber = url.searchParams.get("s") || serialNumber;
      } catch (e) {
        // Format non standard
      }
    }

    // Verifier le format du code claim
    const claimCodePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!claimCodePattern.test(claimCode.toUpperCase())) {
      return res
        .status(400)
        .json({ success: false, error: "Format de code claim invalide" });
    }

    const module = await Module.findOne({
      claimCode: claimCode.toUpperCase(),
    }).select(
      "serialNumber deviceName status claimCodeUsedAt claimCodeExpiresAt",
    );

    if (!module) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Aucun module trouvé avec ce code claim",
        });
    }

    if (module.claimCodeUsedAt) {
      return res.status(400).json({
        success: false,
        error: "Ce code claim a déjà été utilisé",
        data: {
          serialNumber: module.serialNumber,
          deviceName: module.deviceName,
          status: module.status,
        },
      });
    }

    if (module.isClaimCodeExpired()) {
      return res.status(400).json({
        success: false,
        error: "Ce code claim a expiré",
        data: {
          serialNumber: module.serialNumber,
          deviceName: module.deviceName,
        },
      });
    }

    res.json({
      success: true,
      message: "Code QR valide",
      data: {
        claimCode: module.claimCode,
        serialNumber: module.serialNumber,
        deviceName: module.deviceName,
        status: module.status,
      },
    });
  } catch (err) {
    console.error("[DECODE QR CODE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors du decodage du code QR" });
  }
};

/**
 * @desc    Obtenir les poulaillers en attente de module
 * @route   GET /api/admin/modules/pending-poulaillers
 * @access  Private/Admin
 */
exports.getPendingPoulaillers = async (req, res) => {
  try {
    const poulaillers = await Poulailler.find({
      status: "en_attente_module",
      isArchived: false,
    })
      .populate({ path: "owner", select: "firstName lastName email" })
      .select("name type animalCount owner status");

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
    res
      .status(500)
      .json({
        success: false,
        error: "Erreur lors de la récupération des poulaillers",
      });
  }
};
