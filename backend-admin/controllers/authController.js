const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const bcrypt = require("bcryptjs");

// Validation Joi pour l'inscription ADMIN
const registerAdminSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().allow("", null),
});

// Validation Joi pour la connexion ADMIN
const loginAdminSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Générer un JWT avec le rôle
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// @desc    Enregistrer un nouvel ADMINISTRATEUR
// @route   POST /api/auth/admin/register
// @access  Public (ou protégé selon tes besoins futurs)
exports.registerAdmin = async (req, res) => {
  const { error } = registerAdminSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { firstName, lastName, email, password, phone } = req.body;

  try {
    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ email });

    if (user) {
      return res
        .status(409)
        .json({ success: false, error: "Cet email est déjà utilisé" });
    }

    // Créer l'ADMINISTRATEUR (rôle forcé)
    user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: "admin", // ← Seul changement important ici
    });

    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        photoUrl: user.photoUrl,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};

// @desc    Connecter un ADMINISTRATEUR
// @route   POST /api/auth/admin/login
// @access  Public
exports.loginAdmin = async (req, res) => {
  const { error } = loginAdminSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, error: error.details[0].message });
  }

  const { email, password } = req.body;

  try {
    // Vérifier l'email
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Identifiants invalides" });
    }

    // Vérifier que le compte est actif
    if (!user.isActive) {
      return res
        .status(401)
        .json({
          success: false,
          error: "Compte désactivé. Veuillez contacter l'administrateur.",
        });
    }

    // Vérifier que c'est bien un admin
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, error: "Accès réservé aux administrateurs" });
    }

    // Vérifier le mot de passe
    const isMatch = await user.matchPassword(password);
    console.log("Password match result:", isMatch);
    console.log("Entered password:", password);
    console.log("Stored password:", user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Identifiants invalides" });
    }

    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        photoUrl: user.photoUrl,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Erreur serveur" });
  }
};
