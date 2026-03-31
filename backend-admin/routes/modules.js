const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const { checkSessionTimeout } = require("../middlewares/sessionTimeout");
const {
  getModules,
  getModuleById,
  createModule,
  updateModule,
  associateModule,
  dissociateModule,
  deleteModule,
  getAvailableModules,
  generateClaimCode,
  claimModule,
  decodeQRCode,
  getPendingPoulaillers,
} = require("../controllers/modulesController");

// All routes require authentication, session check, and admin role
router.use(protect, checkSessionTimeout, admin);

// ============================================================================
// ORDRE CRITIQUE: Les routes SPECIFIQUES doivent etre AVANT les routes DYNAMIQUES
// ============================================================================

// --- ROUTES GET SPECIFIQUES (AVANT /:id) ---
router.get("/", getModules);
router.get("/available", getAvailableModules);
router.get("/pending-poulaillers", getPendingPoulaillers);

// --- ROUTES POST SPECIFIQUES (AVANT /:id) ---
router.post("/claim", claimModule);
router.post("/generate-claim", generateClaimCode);
router.post("/decode-qr", decodeQRCode);

// --- ROUTES POST STANDARD ---
router.post("/", createModule);

// --- ROUTES PUT SPECIFIQUES (AVANT /:id) ---
router.put("/:id/associate", associateModule);
router.put("/:id/dissociate", dissociateModule);

// --- ROUTES PUT STANDARD ---
router.put("/:id", updateModule);

// --- ROUTES DELETE ---
router.delete("/:id", deleteModule);

// --- ROUTE GET DYNAMIQUE (DOIT ETRE EN DERNIER) ---
router.get("/:id", getModuleById);

module.exports = router;
