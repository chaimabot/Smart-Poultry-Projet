const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Joi = require("joi");
const bcrypt = require("bcryptjs");
const Poulailler = require("../models/Poulailler");
const emailService = require("../services/emailService");
const logService = require("../services/logService");

// Validation schemas
const inviteSchema = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().allow("", null),
  lastName: Joi.string().allow("", null),
  phone: Joi.string().allow("", null),
});

const completeInviteSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phone: Joi.string().allow("", null),
});

const updateEleveurSchema = Joi.object({
  firstName: Joi.string().allow("", null),
  lastName: Joi.string().allow("", null),
  phone: Joi.string().allow("", null),
  isActive: Joi.boolean(),
});

// Generate invite token
const generateInviteToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// @desc    Inviter un nouvel éleveur
// @route   POST /api/admin/eleveurs/invite
// @access  Private/Admin
exports.inviteEleveur = async (req, res) => {
  const { error } = inviteSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { email, firstName, lastName, phone } = req.body;

  try {
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // Si l'utilisateur est archivé, on le réactive et on renvoie une invitation
      if (existingUser.status === "archived") {
        // Générer un nouveau token d'invitation
        const inviteToken = generateInviteToken();
        const inviteTokenExpires = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ); // 7 jours

        // Réactiver l'utilisateur
        existingUser.status = "pending";
        existingUser.isActive = true;
        existingUser.inviteToken = inviteToken;
        existingUser.inviteTokenExpires = inviteTokenExpires;
        existingUser.firstName = firstName || existingUser.firstName;
        existingUser.lastName = lastName || existingUser.lastName;
        existingUser.phone = phone || existingUser.phone;
        await existingUser.save();

        // Envoyer l'email d'invitation
        try {
          await emailService.sendInviteEmail(
            email,
            inviteToken,
            firstName || existingUser.firstName,
          );
        } catch (emailError) {
          console.error("[EMAIL ERROR]", emailError);
        }

        return res.status(200).json({
          success: true,
          message: "Invitation renvoyée avec succès (éléveur réactivé)",
          data: {
            id: existingUser._id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            status: existingUser.status,
          },
        });
      }

      // Si l'utilisateur existe et n'est pas archivé, retourner une erreur
      return res
        .status(409)
        .json({ success: false, error: "Cet email est déjà utilisé" });
    }

    // Générer le token d'invitation
    const inviteToken = generateInviteToken();
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Créer l'utilisateur avec statut pending
    const user = await User.create({
      email,
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || null,
      password: "temp_password_for_invitation", // Mot de passe temporaire
      role: "eleveur",
      status: "pending",
      inviteToken,
      inviteTokenExpires,
      isActive: true,
    });

    // Envoyer l'email d'invitation
    try {
      await emailService.sendInviteEmail(email, inviteToken, firstName || "");
    } catch (emailError) {
      console.error("[EMAIL ERROR]", emailError);
      // On continue même si l'email échoue
    }

    // Log: qui a invité et qui a été invité
    await logService.userCreated(
      req.user?._id, // L'admin qui invite
      user._id, // Le nouvel utilisateur invité
      email, // Email du nouvel utilisateur
      req.ip || req.connection?.remoteAddress,
    );

    res.status(201).json({
      success: true,
      message: "Invitation envoyée avec succès",
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("[INVITE ELEVEUR ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de l'invitation" });
  }
};

// @desc    Ré-envoyer une invitation
// @route   POST /api/admin/eleveurs/:id/resend-invite
// @access  Private/Admin
exports.resendInvite = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: "Éleveur non trouvé" });
    }

    if (user.role !== "eleveur") {
      return res.status(400).json({
        success: false,
        error: "Cet utilisateur n'est pas un élèveur",
      });
    }

    if (user.status === "active") {
      return res
        .status(400)
        .json({ success: false, error: "Cet élèveur est déjà actif" });
    }

    // Générer un nouveau token
    const inviteToken = generateInviteToken();
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    user.inviteToken = inviteToken;
    user.inviteTokenExpires = inviteTokenExpires;
    await user.save();

    // Envoyer l'email
    try {
      await emailService.sendInviteEmail(
        user.email,
        inviteToken,
        user.firstName,
      );
    } catch (emailError) {
      console.error("[EMAIL ERROR]", emailError);
    }

    res.json({
      success: true,
      message: "Invitation rechargée avec succès",
    });
  } catch (err) {
    console.error("[RESEND INVITE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors du renvoi de l'invitation" });
  }
};

// @desc    Vérifier le token d'invitation (page publique) - pour eleveurs ET admins
// @route   GET /api/admin/eleveurs/verify-invite
// @access  Public
exports.verifyInvite = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, error: "Token manquant" });
  }

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, error: "Lien expiré ou invalide" });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role, // Retourne le rôle pour permettre la redirection appropriée
      },
    });
  } catch (err) {
    console.error("[VERIFY INVITE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la vérification" });
  }
};

// @desc    Compléter l'inscription (page publique)
// @route   POST /api/admin/eleveurs/complete-invite
// @access  Public
exports.completeInvite = async (req, res) => {
  const { error } = completeInviteSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { token, password, firstName, lastName, phone } = req.body;

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, error: "Lien expiré ou invalide" });
    }

    // Don't hash here - the model's pre-save hook will do it automatically
    user.password = password;
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone || null;
    user.status = "active";
    user.inviteToken = null;
    user.inviteTokenExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Compte activé avec succès",
    });
  } catch (err) {
    console.error("[COMPLETE INVITE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de l'activation" });
  }
};

// @desc    Liste des éleveurs
// @route   GET /api/admin/eleveurs
// @access  Private/Admin
exports.getEleveurs = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;

    const query = { role: "eleveur" };

    if (status) {
      query.status = status;
    } else {
      // Par défaut, exclure les éleveurs archivés
      query.status = { $ne: "archived" };
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await User.countDocuments(query);
    const eleveurs = await User.find(query)
      .select("-password -inviteToken -inviteTokenExpires")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Ajouter le nombre de poulaillers pour chaque éleveur
    const eleveursWithCount = await Promise.all(
      eleveurs.map(async (eleveur) => {
        const poulaillersCount = await Poulailler.countDocuments({
          owner: eleveur._id,
          isArchived: false,
        });
        return {
          id: eleveur._id,
          email: eleveur.email,
          firstName: eleveur.firstName,
          lastName: eleveur.lastName,
          phone: eleveur.phone,
          status: eleveur.status,
          isActive: eleveur.isActive,
          lastLogin: eleveur.lastLogin,
          poulaillersCount,
          createdAt: eleveur.createdAt,
        };
      }),
    );

    res.json({
      success: true,
      data: eleveursWithCount,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET ELEVEURS ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Obtenir un éleveur par ID
// @route   GET /api/admin/eleveurs/:id
// @access  Private/Admin
exports.getEleveurById = async (req, res) => {
  try {
    const eleveur = await User.findById(req.params.id).select(
      "-password -inviteToken -inviteTokenExpires",
    );

    if (!eleveur) {
      return res
        .status(404)
        .json({ success: false, error: "Éleveur non trouvé" });
    }

    if (eleveur.role !== "eleveur") {
      return res.status(400).json({
        success: false,
        error: "Cet utilisateur n'est pas un élèveur",
      });
    }

    // Nombre de poulaillers
    const poulaillersCount = await Poulailler.countDocuments({
      owner: eleveur._id,
      isArchived: false,
    });

    res.json({
      success: true,
      data: {
        id: eleveur._id,
        email: eleveur.email,
        firstName: eleveur.firstName,
        lastName: eleveur.lastName,
        phone: eleveur.phone,
        status: eleveur.status,
        isActive: eleveur.isActive,
        lastLogin: eleveur.lastLogin,
        poulaillersCount,
        createdAt: eleveur.createdAt,
      },
    });
  } catch (err) {
    console.error("[GET ELEVEUR BY ID ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la récupération" });
  }
};

// @desc    Mettre à jour un élèveur
// @route   PUT /api/admin/eleveurs/:id
// @access  Private/Admin
exports.updateEleveur = async (req, res) => {
  const { error } = updateEleveurSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  try {
    const eleveur = await User.findById(req.params.id);

    if (!eleveur) {
      return res
        .status(404)
        .json({ success: false, error: "Éleveur non trouvé" });
    }

    if (eleveur.role !== "eleveur") {
      return res.status(400).json({
        success: false,
        error: "Cet utilisateur n'est pas un élèveur",
      });
    }

    const { firstName, lastName, phone, isActive } = req.body;

    if (firstName !== undefined) eleveur.firstName = firstName;
    if (lastName !== undefined) eleveur.lastName = lastName;
    if (phone !== undefined) eleveur.phone = phone;
    if (isActive !== undefined) eleveur.isActive = isActive;

    await eleveur.save();

    res.json({
      success: true,
      message: "Éleveur mis à jour avec succès",
      data: {
        id: eleveur._id,
        email: eleveur.email,
        firstName: eleveur.firstName,
        lastName: eleveur.lastName,
        phone: eleveur.phone,
        status: eleveur.status,
        isActive: eleveur.isActive,
      },
    });
  } catch (err) {
    console.error("[UPDATE ELEVEUR ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la mise à jour" });
  }
};

// @desc    Supprimer DÉFINITIVEMENT un élèveur
// @route   DELETE /api/admin/eleveurs/:id
// @access  Private/Admin
exports.deleteEleveur = async (req, res) => {
  try {
    console.log(
      "[DELETE ELEVEUR] Starting PERMANENT deletion for ID:",
      req.params.id,
    );

    const eleveur = await User.findById(req.params.id);
    console.log("[DELETE ELEVEUR] Found eleveur:", eleveur);

    if (!eleveur) {
      console.log("[DELETE ELEVEUR] Eleveur not found");
      return res
        .status(404)
        .json({ success: false, error: "Éleveur non trouvé" });
    }

    if (eleveur.role !== "eleveur") {
      console.log("[DELETE ELEVEUR] Not an eleveur, role:", eleveur.role);
      return res.status(400).json({
        success: false,
        error: "Cet utilisateur n'est pas un élèveur",
      });
    }

    // Log: qui a supprimé et qui a été supprimé
    await logService.userDeleted(
      req.user?._id,
      eleveur._id,
      eleveur.email,
      req.ip || req.connection?.remoteAddress,
    );

    // SUPPRIMER DÉFINITIVEMENT les poulaillers associés
    console.log(
      "[DELETE ELEVEUR] Deleting poulaillers for owner:",
      eleveur._id,
    );
    const poulaillersResult = await Poulailler.deleteMany({
      owner: eleveur._id,
    });
    console.log("[DELETE ELEVEUR] Poulaillers deleted:", poulaillersResult);

    // SUPPRIMER DÉFINITIVEMENT l'utilisateur
    console.log("[DELETE ELEVEUR] Permanently deleting eleveur...");
    await User.findByIdAndDelete(req.params.id);
    console.log("[DELETE ELEVEUR] Eleveur permanently deleted!");

    res.json({
      success: true,
      message: "Éleveur supprimé définitivement",
    });
  } catch (err) {
    console.error("[DELETE ELEVEUR ERROR]", err);
    console.error("[DELETE ELEVEUR ERROR STACK]", err.stack);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression: " + err.message,
    });
  }
};
