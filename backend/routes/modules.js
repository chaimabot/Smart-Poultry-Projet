const express = require("express");
const router = express.Router();
const modulesController = require("../controllers/modulesController");
const auth = require("../middlewares/auth");

// Routes pour les modules

// Routes publiques (pour l'ESP32)
router.post("/ping", modulesController.updatePing);

// Routes protégées (authentification requise)
router.use(auth.protect);

// Routes pour les elevers et admins
router.get("/", modulesController.getModules);
router.get("/:id", modulesController.getModuleById);
router.post("/decode-qr", modulesController.decodeQRCode);
router.get("/pending-poulaillers", modulesController.getPendingPoulaillers);

// Routes pour les admins seulement
router.post("/", auth.restrictTo("admin"), modulesController.createModule);
router.put("/:id", auth.restrictTo("admin"), modulesController.updateModule);
router.delete("/:id", auth.restrictTo("admin"), modulesController.deleteModule);

// Routes pour generation/claim (admin)
router.post(
  "/generate-claim",
  auth.restrictTo("admin"),
  modulesController.generateClaimCode,
);
router.post("/claim", modulesController.claimModule);
router.put(
  "/:id/associate",
  auth.restrictTo("admin"),
  modulesController.associateModule,
);
router.put(
  "/:id/dissociate",
  auth.restrictTo("admin"),
  modulesController.dissociateModule,
);

module.exports = router;
