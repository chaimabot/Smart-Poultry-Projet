const express = require("express");
const router = express.Router();
const controller = require("../controllers/camerasController");
const { protect, admin } = require("../middlewares/auth");

// Toutes les routes nécessitent une authentification

// ─── Lecture ─────────────────────────────────────────────────────────────────
router.get("/", protect, controller.getAllCameras);
router.get(
  "/pending-poulaillers",
  protect,
  controller.getPendingPoulaillersForCameras,
);

// ─── Création (admin) ─────────────────────────────────────────────────────────
router.post("/", protect, admin, controller.createCamera);

// ─── Association / dissociation ───────────────────────────────────────────────
router.post("/claim", protect, controller.claimCamera);
router.patch("/:id/dissociate", protect, admin, controller.dissociateCamera);

// ─── Mise à jour URL flux MJPEG (admin) ──────────────────────────────────────
router.patch("/:id/stream", protect, admin, controller.updateStreamUrl);

// ─── Suppression (admin) ──────────────────────────────────────────────────────
router.delete("/:id", protect, admin, controller.deleteCamera);

module.exports = router;
