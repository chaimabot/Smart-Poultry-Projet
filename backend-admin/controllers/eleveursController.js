const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Joi = require("joi");
const bcrypt = require("bcryptjs");
const Poulailler = require("../models/Poulailler");
const emailService = require("../services/emailService");
const logService = require("../services/logService");

// ─── Validation schemas ────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const generateInviteToken = () => crypto.randomBytes(32).toString("hex");

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * @desc    Inviter un nouvel éleveur
 * @route   POST /api/admin/eleveurs/invite
 * @access  Privé / Admin
 */
exports.inviteEleveur = async (req, res) => {
  const { error } = inviteSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { email, firstName, lastName, phone } = req.body;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // CAS 1 : compte actif sans token → impossible de réinviter
      if (existingUser.status === "active" && !existingUser.inviteToken) {
        return res.status(409).json({
          success: false,
          error:
            "Un compte actif est déjà associé à cette adresse email. Veuillez utiliser une autre adresse.",
        });
      }

      // CAS 2 : compte archivé → réactivation et renvoi
      if (existingUser.status === "archived") {
        const inviteToken = generateInviteToken();
        const inviteTokenExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

        existingUser.status = "pending";
        existingUser.isActive = false;
        existingUser.inviteToken = inviteToken;
        existingUser.inviteTokenExpires = inviteTokenExpires;
        existingUser.firstName = firstName || existingUser.firstName;
        existingUser.lastName = lastName || existingUser.lastName;
        existingUser.phone = phone || existingUser.phone;

        await existingUser.save();

        try {
          await emailService.sendInviteEmail(
            email,
            inviteToken,
            existingUser.firstName,
          );
        } catch (emailError) {
          console.error(
            "[EMAIL ERROR] sendInviteEmail (archived):",
            emailError.message,
          );
        }

        return res.status(200).json({
          success: true,
          message:
            "Le compte a été réactivé et une nouvelle invitation a été envoyée à l'adresse indiquée.",
        });
      }

      // CAS 3 : compte pending OU actif avec token encore valide
      if (existingUser.status === "pending" || existingUser.inviteToken) {
        const tokenValid =
          existingUser.inviteToken &&
          existingUser.inviteTokenExpires &&
          existingUser.inviteTokenExpires > new Date();

        if (tokenValid) {
          return res.status(200).json({
            success: true,
            message:
              "Une invitation est déjà en attente pour cette adresse. Utilisez l'action « Renvoyer l'invitation » si l'email n'a pas été reçu.",
          });
        }

        // Token expiré → renouvellement
        const newToken = generateInviteToken();
        const newExpiry = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

        existingUser.inviteToken = newToken;
        existingUser.inviteTokenExpires = newExpiry;
        existingUser.firstName = firstName || existingUser.firstName;
        existingUser.lastName = lastName || existingUser.lastName;
        existingUser.phone = phone || existingUser.phone;

        await existingUser.save();

        try {
          await emailService.sendInviteEmail(
            email,
            newToken,
            existingUser.firstName,
          );
        } catch (emailError) {
          console.error(
            "[EMAIL ERROR] sendInviteEmail (pending, expired):",
            emailError.message,
          );
        }

        return res.status(200).json({
          success: true,
          message:
            "L'invitation précédente était expirée. Une nouvelle invitation a été envoyée avec succès.",
        });
      }

      // Fallback
      return res.status(409).json({
        success: false,
        error: "Cette adresse email est déjà associée à un compte existant.",
      });
    }

    // ── Nouveau compte ──────────────────────────────────────────────────────────
    const inviteToken = generateInviteToken();
    const inviteTokenExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

    const user = await User.create({
      email,
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || null,
      password: crypto.randomBytes(16).toString("hex"),
      role: "eleveur",
      status: "pending",
      inviteToken,
      inviteTokenExpires,
      isActive: false,
    });

    try {
      await emailService.sendInviteEmail(email, inviteToken, firstName || "");
    } catch (emailError) {
      console.error(
        "[EMAIL ERROR] sendInviteEmail (new user):",
        emailError.message,
      );
    }

    await logService.userCreated(
      req.user?._id,
      user._id,
      email,
      req.ip || req.connection?.remoteAddress,
    );

    return res.status(201).json({
      success: true,
      message:
        "Invitation envoyée avec succès. L'éleveur recevra un email pour finaliser son inscription.",
      data: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("[INVITE ELEVEUR ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error:
        "Une erreur est survenue lors de l'envoi de l'invitation. Veuillez réessayer.",
    });
  }
};

exports.resendInvite = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Éleveur introuvable. Il a peut-être été supprimé.",
        });
    }

    if (user.role !== "eleveur") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Cette action est réservée aux comptes de type Éleveur.",
        });
    }

    // CAS 1 : compte actif sans token en attente → reset d'accès
    if (user.status === "active" && !user.inviteToken) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      user.inviteToken = resetToken;
      user.inviteTokenExpires = resetExpires;
      await user.save();

      try {
        await emailService.sendCredentialsEmail(
          user.email,
          resetToken,
          user.firstName,
        );
      } catch (emailError) {
        console.error(
          "[EMAIL ERROR] sendCredentialsEmail:",
          emailError.message,
        );
        return res.status(500).json({
          success: false,
          error:
            "Le token a été généré mais l'email n'a pas pu être envoyé. Veuillez réessayer.",
        });
      }

      return res.json({
        success: true,
        message:
          "Un email de réinitialisation d'accès a été envoyé à l'adresse de l'éleveur.",
      });
    }

    // CAS 2 : compte pending OU actif avec token encore valide → renvoi invitation
    if (user.status === "pending" || user.inviteToken) {
      const tokenValid =
        user.inviteToken &&
        user.inviteTokenExpires &&
        user.inviteTokenExpires > new Date();

      if (tokenValid) {
        try {
          await emailService.sendInviteEmail(
            user.email,
            user.inviteToken,
            user.firstName,
          );
        } catch (emailError) {
          console.error(
            "[EMAIL ERROR] sendInviteEmail (resend, valid token):",
            emailError.message,
          );
          return res.status(500).json({
            success: false,
            error: "L'email n'a pas pu être renvoyé. Veuillez réessayer.",
          });
        }

        return res.json({
          success: true,
          message:
            "L'invitation a été renvoyée avec succès à l'adresse de l'éleveur.",
        });
      }

      // Token expiré → renouvellement
      const newToken = generateInviteToken();
      const newExpiry = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

      user.inviteToken = newToken;
      user.inviteTokenExpires = newExpiry;
      await user.save();

      try {
        await emailService.sendInviteEmail(
          user.email,
          newToken,
          user.firstName,
        );
      } catch (emailError) {
        console.error(
          "[EMAIL ERROR] sendInviteEmail (resend, new token):",
          emailError.message,
        );
        return res.status(500).json({
          success: false,
          error:
            "Le token a été renouvelé mais l'email n'a pas pu être envoyé. Veuillez réessayer.",
        });
      }

      return res.json({
        success: true,
        message:
          "Le lien d'invitation précédent était expiré. Une nouvelle invitation a été envoyée avec succès.",
      });
    }

    return res.status(400).json({
      success: false,
      error:
        "Impossible d'envoyer une invitation pour ce compte dans son état actuel.",
    });
  } catch (err) {
    console.error("[RESEND INVITE ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error: "Une erreur est survenue lors de l'envoi. Veuillez réessayer.",
    });
  }
};

/**
 * @desc    Vérifier le token d'invitation (page publique)
 * @route   GET /api/admin/eleveurs/verify-invite
 * @access  Public
 */
exports.verifyInvite = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: "Token manquant. Veuillez utiliser le lien reçu par email.",
    });
  }

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error:
          "Ce lien d'invitation est invalide ou a expiré. Veuillez contacter votre administrateur pour en obtenir un nouveau.",
      });
    }

    return res.json({
      success: true,
      data: {
        valid: true,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[VERIFY INVITE ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error:
        "Une erreur est survenue lors de la vérification. Veuillez réessayer.",
    });
  }
};

/**
 * @desc    Finaliser l'inscription depuis le lien d'invitation
 * @route   POST /api/admin/eleveurs/complete-invite
 * @access  Public
 */
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
      return res.status(400).json({
        success: false,
        error:
          "Ce lien d'activation est invalide ou a expiré. Veuillez contacter votre administrateur.",
      });
    }

    user.password = password;
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone || null;
    user.status = "active";
    user.isActive = true;
    user.inviteToken = undefined;
    user.inviteTokenExpires = undefined;

    await user.save();

    return res.json({
      success: true,
      message:
        "Votre compte a été activé avec succès. Vous pouvez maintenant vous connecter.",
    });
  } catch (err) {
    console.error("[COMPLETE INVITE ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error:
        "Une erreur est survenue lors de l'activation. Veuillez réessayer.",
    });
  }
};

/**
 * @desc    Liste des éleveurs
 * @route   GET /api/admin/eleveurs
 * @access  Privé / Admin
 */
exports.getEleveurs = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;

    const query = { role: "eleveur" };

    if (status) {
      query.status = status;
    } else {
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

    // ✅ On garde inviteToken dans le select pour calculer hasInviteToken
    const eleveurs = await User.find(query)
      .select("-password -inviteTokenExpires")
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit));

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
          // ✅ Booléen exposé — le token brut n'est jamais envoyé au frontend
          hasInviteToken: !!eleveur.inviteToken,
          lastLogin: eleveur.lastLogin,
          poulaillersCount,
          createdAt: eleveur.createdAt,
        };
      }),
    );

    return res.json({
      success: true,
      data: eleveursWithCount,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[GET ELEVEURS ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error: "Une erreur est survenue lors de la récupération des éleveurs.",
    });
  }
};

/**
 * @desc    Obtenir un éleveur par ID
 * @route   GET /api/admin/eleveurs/:id
 * @access  Privé / Admin
 */
exports.getEleveurById = async (req, res) => {
  try {
    const eleveur = await User.findById(req.params.id).select(
      "-password -inviteToken -inviteTokenExpires",
    );

    if (!eleveur) {
      return res
        .status(404)
        .json({ success: false, error: "Éleveur introuvable." });
    }

    if (eleveur.role !== "eleveur") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Cet identifiant ne correspond pas à un compte Éleveur.",
        });
    }

    const poulaillersCount = await Poulailler.countDocuments({
      owner: eleveur._id,
      isArchived: false,
    });

    return res.json({
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
    console.error("[GET ELEVEUR BY ID ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error: "Une erreur est survenue lors de la récupération de l'éleveur.",
    });
  }
};

/**
 * @desc    Mettre à jour un éleveur
 * @route   PUT /api/admin/eleveurs/:id
 * @access  Privé / Admin
 */
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
        .json({ success: false, error: "Éleveur introuvable." });
    }

    if (eleveur.role !== "eleveur") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Cet identifiant ne correspond pas à un compte Éleveur.",
        });
    }

    const { firstName, lastName, phone, isActive } = req.body;

    if (firstName !== undefined) eleveur.firstName = firstName;
    if (lastName !== undefined) eleveur.lastName = lastName;
    if (phone !== undefined) eleveur.phone = phone;
    if (isActive !== undefined) eleveur.isActive = isActive;

    await eleveur.save();

    return res.json({
      success: true,
      message:
        "Les informations de l'éleveur ont été mises à jour avec succès.",
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
    console.error("[UPDATE ELEVEUR ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error:
        "Une erreur est survenue lors de la mise à jour. Veuillez réessayer.",
    });
  }
};

/**
 * @desc    Supprimer définitivement un éleveur
 * @route   DELETE /api/admin/eleveurs/:id
 * @access  Privé / Admin
 */
exports.deleteEleveur = async (req, res) => {
  try {
    const eleveur = await User.findById(req.params.id);

    if (!eleveur) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Éleveur introuvable. Il a peut-être déjà été supprimé.",
        });
    }

    if (eleveur.role !== "eleveur") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Cet identifiant ne correspond pas à un compte Éleveur.",
        });
    }

    await logService.userDeleted(
      req.user?._id,
      eleveur._id,
      eleveur.email,
      req.ip || req.connection?.remoteAddress,
    );

    await Poulailler.deleteMany({ owner: eleveur._id });
    await User.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message:
        "Le compte et l'ensemble des données associées ont été supprimés définitivement.",
    });
  } catch (err) {
    console.error("[DELETE ELEVEUR ERROR]", err.message);
    return res.status(500).json({
      success: false,
      error:
        "Une erreur est survenue lors de la suppression. Veuillez réessayer.",
    });
  }
};
