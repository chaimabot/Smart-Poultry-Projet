// controllers/utilisateursController.js

const User = require("../models/User");
const Poulailler = require("../models/Poulailler");
const logService = require("../services/logService");
const emailService = require("../services/emailService");
const crypto = require("crypto");

const generateSecurePassword = () => {
  const length = 12;
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";

  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  const allChars = uppercase + lowercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

exports.getUtilisateurs = async (req, res) => {
  try {
    const { search, role } = req.query;
    const query = {};

    if (role && role !== "all") query.role = role;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("-password -inviteTokenExpires")
      .sort({ createdAt: -1 });

    const formatted = users.map((u) => ({
      id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      isActive: u.isActive,
      hasInviteToken: !!u.inviteToken, // ✅ calculé ici
      lastLogin: u.lastLogin,
      createdAt: u.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    console.error("[GET UTILISATEURS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des utilisateurs",
    });
  }
};
// @desc    Récupérer un utilisateur par ID
// @route   GET /api/admin/utilisateurs/:id
// @access  Private/Admin
exports.getUtilisateurById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error("[GET UTILISATEUR BY ID ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération de l'utilisateur",
    });
  }
};

// @desc    Activer / Archiver un utilisateur (toggle existant)
// @route   PUT /api/admin/utilisateurs/:id/toggle-status
// @access  Private/Admin
exports.toggleStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Vous ne pouvez pas modifier votre propre statut",
      });
    }

    const newStatus = user.status === "active" ? "archived" : "active";
    user.status = newStatus;
    user.isActive = newStatus === "active";
    await user.save();

    res.status(200).json({
      success: true,
      message: `Statut mis à jour : ${newStatus}`,
      data: user,
    });
  } catch (err) {
    console.error("[TOGGLE STATUS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors du changement de statut",
    });
  }
};

// ============================================
// NOUVEAUTÉS : Désactiver / Réactiver un compte
// ============================================

// @desc    Désactiver un compte utilisateur (Admin)
// @route   PUT /api/admin/utilisateurs/:id/desactiver
// @access  Private/Admin
exports.desactiverCompte = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Vous ne pouvez pas désactiver votre propre compte",
      });
    }

    if (user.status === "inactive") {
      return res.status(400).json({
        success: false,
        error: "Ce compte est déjà désactivé",
      });
    }

    user.status = "inactive";
    user.isActive = false;
    await user.save();

    await logService.userUpdated?.(
      req.user?.id,
      user._id,
      "Désactivation du compte",
      req.ip || req.connection?.remoteAddress,
    );

    res.status(200).json({
      success: true,
      message: "Compte désactivé avec succès",
      data: user,
    });
  } catch (err) {
    console.error("[DESACTIVER COMPTE ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la désactivation du compte",
    });
  }
};

// @desc    Réactiver un compte utilisateur (Admin)
// @route   PUT /api/admin/utilisateurs/:id/reactiver
// @access  Private/Admin
exports.reactiverCompte = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    if (user.status === "active") {
      return res.status(400).json({
        success: false,
        error: "Ce compte est déjà actif",
      });
    }

    user.status = "active";
    user.isActive = true;
    await user.save();

    await logService.userUpdated?.(
      req.user?.id,
      user._id,
      "Réactivation du compte",
      req.ip || req.connection?.remoteAddress,
    );

    res.status(200).json({
      success: true,
      message: "Compte réactivé avec succès",
      data: user,
    });
  } catch (err) {
    console.error("[REACTIVER COMPTE ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la réactivation du compte",
    });
  }
};

// @desc    Désactiver son propre compte (Self-service)
// @route   PUT /api/utilisateurs/me/desactiver
// @access  Private
exports.desactiverMonCompte = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        error:
          "Les administrateurs ne peuvent pas désactiver leur propre compte. Contactez un autre admin.",
      });
    }

    user.status = "inactive";
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message:
        "Votre compte a été désactivé avec succès. Vous allez être déconnecté.",
    });
  } catch (err) {
    console.error("[DESACTIVER MON COMPTE ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la désactivation de votre compte",
    });
  }
};

// ============================================

// @desc    Supprimer un utilisateur
// @route   DELETE /api/admin/utilisateurs/:id
// @access  Private/Admin
exports.deleteUtilisateur = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur non trouvé",
      });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "Vous ne pouvez pas supprimer votre propre compte",
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Utilisateur supprimé avec succès",
    });
  } catch (err) {
    console.error("[DELETE UTILISATEUR ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression de l'utilisateur",
    });
  }
};

// @desc    Inviter un nouvel administrateur
// @route   POST /api/admin/utilisateurs/invite-admin
// @access  Private/Admin
exports.inviteAdmin = async (req, res) => {
  const { email, firstName, lastName, phone } = req.body;

  if (!email || !firstName || !lastName) {
    return res.status(400).json({
      success: false,
      error: "Email, prénom et nom sont requis",
    });
  }

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // CAS 1 : compte actif → impossible de réinviter
      if (existingUser.status === "active") {
        return res.status(409).json({
          success: false,
          error:
            "Un compte actif est déjà associé à cette adresse email. Veuillez utiliser une autre adresse.",
        });
      }

      // CAS 2 : compte en attente avec token encore valide
      if (existingUser.status === "pending") {
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

      // Fallback statut inconnu
      return res.status(409).json({
        success: false,
        error: "Cette adresse email est déjà associée à un compte existant.",
      });
    }

    const temporaryPassword = generateSecurePassword();
    console.log("[INVITE ADMIN] Mot de passe temporaire généré");

    const admin = await User.create({
      email,
      firstName,
      lastName,
      phone: phone || null,
      password: temporaryPassword,
      role: "admin",
      status: "active",
      isActive: true,
    });

    console.log("[INVITE ADMIN] Admin créé avec ID:", admin._id);

    try {
      await emailService.sendAdminCredentialsEmail(
        email,
        temporaryPassword,
        firstName,
      );
      console.log("[INVITE ADMIN] Email envoyé avec succès");
    } catch (emailError) {
      console.error("[INVITE ADMIN EMAIL ERROR]", emailError.message);
      await User.findByIdAndDelete(admin._id);
      return res.status(500).json({
        success: false,
        error: "Impossible d'envoyer l'email. Le compte n'a pas été créé.",
      });
    }

    await logService.userCreated(
      req.user?.id,
      admin._id,
      email,
      req.ip || req.connection?.remoteAddress,
    );

    res.status(201).json({
      success: true,
      message:
        "Administrateur créé avec succès. Un email avec les identifiants a été envoyé.",
      data: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        status: admin.status,
      },
    });
  } catch (err) {
    console.error("[INVITE ADMIN ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de l'invitation de l'administrateur",
    });
  }
};
