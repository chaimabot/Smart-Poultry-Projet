const express = require("express");
const router = express.Router();
const LampeController = require("../controllers/LampeController");
const { protect } = require("../middlewares/auth");

router.use(protect);

router.patch("/:id/control", LampeController.controlLamp);
router.post("/:id/control", LampeController.controlLamp);
router.put("/:id/thresholds", LampeController.updateThresholds);

module.exports = router;
