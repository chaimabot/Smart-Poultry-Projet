const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth");
const { getAnalysesIA } = require("../controllers/analysesIAController");

router.get("/", protect, getAnalysesIA);

module.exports = router;
