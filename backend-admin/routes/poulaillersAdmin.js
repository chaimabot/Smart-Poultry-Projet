// routes/poulaillersAdmin.js
const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getAllPoulaillers,
  getPoulaillerById,
  updatePoulailler,
  deletePoulailler,
} = require("../controllers/poulaillersAdminController");

// ============================================================
// ROUTES POULAILLERS POUR ADMIN
// ============================================================

// GET /api/admin/poulaillers → liste tous les poulaillers
router.get("/", protect, admin, getAllPoulaillers);

// GET /api/admin/poulaillers/:id → obtenir un poulailler
router.get("/:id", protect, admin, getPoulaillerById);

// PUT /api/admin/poulaillers/:id → mettre à jour un poulailler
router.put("/:id", protect, admin, updatePoulailler);

// DELETE /api/admin/poulaillers/:id → supprimer (archiver) un poulailler
router.delete("/:id", protect, admin, deletePoulailler);

module.exports = router;
