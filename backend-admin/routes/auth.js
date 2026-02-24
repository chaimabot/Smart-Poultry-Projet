// routes/auth.js
const express = require("express");
const router = express.Router();

const { registerAdmin, loginAdmin } = require("../controllers/authController");

// ────────────────────────────────────────────────
// Enregistrement d'un nouvel administrateur
// ────────────────────────────────────────────────
router.post("/admin/register", registerAdmin);

// ────────────────────────────────────────────────
// Connexion administrateur
// ────────────────────────────────────────────────
router.post("/admin/login", loginAdmin);

// Route de test pour vérifier que auth est bien monté
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Route /api/auth/test fonctionne correctement",
  });
});

module.exports = router;
