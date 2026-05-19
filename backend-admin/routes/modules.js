const express = require("express");
const router = express.Router();
const controller = require("../controllers/modulesController");
const { protect, admin } = require("../middlewares/auth");

// Toutes les routes nécessitent une authentification
router.get("/", protect, controller.getAllModules);
router.get("/pending-poulaillers", protect, controller.getPendingPoulaillers);
router.post("/", protect, admin, controller.createModule);

router.post("/claim", protect, controller.claimModule);
router.patch("/:id/dissociate", protect, admin, controller.dissociateModule);
router.delete("/:id", protect, admin, controller.deleteModule);

module.exports = router;
