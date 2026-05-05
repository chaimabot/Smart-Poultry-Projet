const express = require("express");
const router = express.Router();
const lampeController = require("../controllers/lampeController");
const { protect } = require("../middlewares/auth");

router.use(protect);

router.patch("/:id/control", lampeController.controlLamp);
router.post("/:id/control", lampeController.controlLamp);
router.put("/:id/thresholds", lampeController.updateThresholds);

module.exports = router;
