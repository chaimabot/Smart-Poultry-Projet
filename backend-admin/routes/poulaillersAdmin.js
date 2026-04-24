const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middlewares/auth");
const {
  getAllPoulaillers,
  getPoulaillerById,
  createPoulailler,
  updatePoulailler,
  deletePoulailler,
  getUsers,
} = require("../controllers/poulaillersAdminController");

router.get("/", protect, admin, getAllPoulaillers);
router.get("/users", protect, admin, getUsers);
router.get("/:id", protect, admin, getPoulaillerById);
router.post("/", protect, admin, createPoulailler);
router.put("/:id", protect, admin, updatePoulailler);
router.delete("/:id", protect, admin, deletePoulailler);

module.exports = router;
