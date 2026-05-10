const express = require("express");
const router = express.Router();
const {
  verifyInvite,
  completeInvite,
} = require("../controllers/inviteController");

router.get("/verify", verifyInvite);
router.post("/complete", completeInvite);

module.exports = router;
