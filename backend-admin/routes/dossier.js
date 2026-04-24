const express = require("express");
const router = express.Router();

const {
  getDossiers,
  validateDossier,
  updateFinance,
  cloreDossier,
  annulerDossier,
  deleteDossier,
} = require("../controllers/dossierController");

const { protect, admin } = require("../middlewares/auth");
const { checkSessionTimeout } = require("../middlewares/sessionTimeout");

/**
 * @route   /api/admin/dossiers
 * @access  Private - Admin uniquement
 */
router.use(protect);
router.use(admin);
router.use(checkSessionTimeout);

router.get("/", getDossiers); // GET  /api/admin/dossiers
router.patch("/validate/:id", validateDossier); // PATCH /api/admin/dossiers/validate/:id
router.put("/:id/finance", updateFinance); // PUT  /api/admin/dossiers/:id/finance
router.patch("/clore/:id", cloreDossier); // PATCH /api/admin/dossiers/clore/:id - Clôturer un dossier (TERMINE)
router.patch("/annuler/:id", annulerDossier); // PATCH /api/admin/dossiers/annuler/:id - Annuler un dossier (ANNULE)
router.delete("/:id", deleteDossier); // DELETE /api/admin/dossiers/:id - Supprimer un dossier (TODO: implémenter soft-delete)
module.exports = router;
