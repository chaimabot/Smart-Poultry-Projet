// routes/utilisateurs.js
const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getUtilisateurs,
  getUtilisateurById,
  toggleStatus,
  deleteUtilisateur,
} = require("../controllers/utilisateursController");

// All routes require authentication and admin role
router.use(protect, admin);

// List all utilisateurs
router.get("/", getUtilisateurs);

// Get single utilisateur
router.get("/:id", getUtilisateurById);

// Toggle user status
router.put("/:id/toggle-status", toggleStatus);

// Delete user (PERMANENT)
router.delete("/:id", deleteUtilisateur);

module.exports = router;
