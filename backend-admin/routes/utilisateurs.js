const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middlewares/auth");
const utilisateursController = require("../controllers/utilisateursController");

const {
  getUtilisateurs,
  getUtilisateurById,
  toggleStatus,
  deleteUtilisateur,
  inviteAdmin,
  desactiverCompte, // ← AJOUT
  reactiverCompte, // ← AJOUT
} = utilisateursController;

//    MIDDLEWARE AVANT les routes
router.use(protect, admin);

// Routes dans le BON ORDRE (du plus spécifique au plus général)

router.post("/invite-admin", inviteAdmin); // /invite-admin

// ← AJOUT : routes /:id/xxx avant /:id pour éviter les conflits
router.put("/:id/desactiver", desactiverCompte); // /:id/desactiver
router.put("/:id/reactiver", reactiverCompte); // /:id/reactiver
router.put("/:id/toggle-status", toggleStatus); // /:id/toggle-status

router.get("/:id", getUtilisateurById); // /:id
router.delete("/:id", deleteUtilisateur); // /:id ← DELETE
router.get("/", getUtilisateurs); // /

module.exports = router;
