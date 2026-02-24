const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
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

// All routes require authentication and admin role
router.use(protect, admin);

// ============================================================================
// ROUTES MODULES
// ============================================================================

// List all modules with pagination and filters
router.get("/", getModules);

// Get available (unassigned) modules
router.get("/available", getAvailableModules);

// Get poulaillers waiting for module
router.get("/pending-poulaillers", getPendingPoulaillers);

// Get single module
router.get("/:id", getModuleById);

// Create new module (without claim code)
router.post("/", createModule);

// Generate claim code for a module (creates module if not exists)
router.post("/generate-claim", generateClaimCode);

// Claim a module with code
router.post("/claim", claimModule);

// Decode QR code
router.post("/decode-qr", decodeQRCode);

// Update module
router.put("/:id", updateModule);

// Associate module to poulailler
router.put("/:id/associate", associateModule);

// Dissociate module from poulailler
router.put("/:id/dissociate", dissociateModule);

// Delete module
router.delete("/:id", deleteModule);

module.exports = router;
