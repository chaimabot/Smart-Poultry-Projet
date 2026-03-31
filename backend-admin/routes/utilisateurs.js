// routes/utilisateurs.js
const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const {
  getUtilisateurs,
  getUtilisateurById,
  toggleStatus,
  deleteUtilisateur,
} = require("../controllers/utilisateursController");

// ============================================================
// ROUTES PUBLIQUES (doivent être AVANT le middleware de protection)
// ============================================================

// Vérifier le token d'invitation administrateur
router.get("/verify-admin-invite", async (req, res) => {
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

    if (user.role !== "admin") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Token invalide pour un administrateur",
        });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    console.error("[VERIFY ADMIN INVITE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de la vérification" });
  }
});

// Compléter l'invitation administrateur
router.post("/complete-admin-invite", async (req, res) => {
  const { token, password, firstName, lastName, phone } = req.body;

  if (!token || !password || !firstName || !lastName) {
    return res.status(400).json({
      success: false,
      error: "Token, mot de passe, prénom et nom sont requis",
    });
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

    if (user.role !== "admin") {
      return res
        .status(400)
        .json({
          success: false,
          error: "Token invalide pour un administrateur",
        });
    }

    // Hasher le mot de passe
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone || null;
    user.status = "active";
    user.inviteToken = null;
    user.inviteTokenExpires = null;
    await user.save();

    res.json({
      success: true,
      message: "Compte administrateur activé avec succès",
    });
  } catch (err) {
    console.error("[COMPLETE ADMIN INVITE ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Erreur lors de l'activation" });
  }
});

// ============================================================
// ROUTES PROTÉGÉES (admin seulement)
// ============================================================

router.use(protect, admin);

// List all utilisateurs
router.get("/", getUtilisateurs);

// Get single utilisateur
router.get("/:id", getUtilisateurById);

// Toggle user status
router.put("/:id/toggle-status", toggleStatus);

// Delete user (PERMANENT)
router.delete("/:id", deleteUtilisateur);

// Invite new admin
router.post(
  "/invite-admin",
  require("../controllers/utilisateursController").inviteAdmin,
);

module.exports = router;
