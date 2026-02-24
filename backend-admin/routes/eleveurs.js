const express = require("express");
const router = express.Router();

const User = require("../models/User");
const { protect, admin } = require("../middlewares/auth");
const {
  inviteEleveur,
  resendInvite,
  verifyInvite,
  completeInvite,
  getEleveurs,
  getEleveurById,
  updateEleveur,
  deleteEleveur,
} = require("../controllers/eleveursController");

// ============================================================
// ROUTES PUBLIQUES (doivent être AVANT le middleware de protection)
// ============================================================

// Vérifier le token d'invitation (page publique)
router.get("/verify-invite", verifyInvite);

// Compléter l'inscription (page publique)
router.post("/complete-invite", completeInvite);

// ============================================================
// ROUTES PROTÉGÉES (admin seulement)
// ============================================================

router.use(protect, admin);

// Liste des breeders
router.get("/", getEleveurs);

// Obtenir un breeder par ID
router.get("/:id", getEleveurById);

// Inviter un nouvel élèveur
router.post("/invite", inviteEleveur);

// Ré-envoyer une invitation
router.post("/:id/resend-invite", resendInvite);

// Mettre à jour un breeder
router.put("/:id", updateEleveur);

// Basculer le statut d'un breeder (activer/désactiver)
router.put("/:id/toggle-status", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Éleveur non trouvé",
      });
    }

    if (user.role !== "eleveur") {
      return res.status(400).json({
        success: false,
        error: "Cet utilisateur n'est pas un élèveur",
      });
    }

    // Inverser le statut
    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: user.isActive ? "Éleveur activé" : "Éleveur désactivé",
      data: {
        id: user._id,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("[TOGGLE STATUS ERROR]", err);
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour",
    });
  }
});

// Supprimer/désactiver un breeder
router.delete("/:id", deleteEleveur);

module.exports = router;
