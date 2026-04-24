const express = require("express");
const router = express.Router();
const controller = require("../controllers/modulesController");

router.get("/", controller.getAllModules);
router.get("/pending-poulaillers", controller.getPendingPoulaillers);
router.post("/", controller.createModule);
router.post("/claim", controller.claimModule);
router.patch("/:id/dissociate", controller.dissociateModule);
router.delete("/:id", controller.deleteModule);

module.exports = router;
